/**
 * Gift Cards routes — /api/v1/gift-cards
 *
 * All routes require authentication via the `authenticate` middleware.
 * Cards are household-scoped: any household member can view, add, edit,
 * transact, archive, or delete any card in the household.
 *
 * Routes:
 *   GET    /                          — list all accessible gift cards
 *   POST   /                          — add a new gift card
 *   PUT    /:cardId                   — update card metadata (number/pin/expiry/notes)
 *   PUT    /:cardId/balance           — set a new balance (records transaction)
 *   POST   /:cardId/transactions      — record a spend or reload transaction
 *   GET    /:cardId/transactions      — get full transaction history
 *   PUT    /:cardId/archive           — manually archive a card
 *   DELETE /:cardId                   — soft-delete a card
 *
 * Error codes:
 *   SQIRL-GIFT-CREATE-001   Missing required brandId, cardNumber, or balance
 *   SQIRL-GIFT-CREATE-002   Invalid barcode format
 *   SQIRL-GIFT-CREATE-003   Balance must be a non-negative number
 *   SQIRL-GIFT-ACCESS-001   Card not found or user lacks access
 *   SQIRL-GIFT-TXN-001      Transaction amount must not be zero
 *   SQIRL-GIFT-TXN-002      transactionDate is required
 *   SQIRL-GIFT-BAL-001      New balance must be a non-negative number
 *   SQIRL-GIFT-SERVER-001   Unexpected server error
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import {
  isValidGiftBarcodeFormat,
  getGiftCards,
  addGiftCard,
  updateGiftCard,
  updateGiftCardBalance,
  addGiftCardTransaction,
  getGiftCardTransactions,
  archiveGiftCard,
  deleteGiftCard,
  type BarcodeFormat,
  type GiftCardRow,
  type GiftCardTransactionRow,
} from '../services/giftCardService';
import { pool } from '../db';
import { broadcast } from '../ws/wsServer';

/** Fetch the user's current household ID for broadcast targeting. Fire-and-forget safe. */
async function getUserHhId(userId: string): Promise<string | null> {
  const r = await pool.query<{ household_id: string }>(
    `SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.household_id ?? null;
}

const router = Router();

/** Convert a snake_case gift card DB row to the camelCase API shape. */
function cardToApi(c: GiftCardRow) {
  return {
    id:              c.id,
    householdId:     c.household_id,
    addedByUserId:   c.added_by_user_id,
    brandId:         c.brand_id,
    cardNumber:      c.card_number,
    barcodeFormat:   c.barcode_format,
    pin:             c.pin,
    balance:         Number(c.balance),
    expiryDate:      c.expiry_date,
    notes:           c.notes,
    isArchived:      c.is_archived,
    updatedAt:       c.updated_at,
    syncedAt:        c.synced_at,
    clientId:        c.client_id,
    isDeleted:       c.is_deleted,
  };
}

/** Convert a snake_case transaction row to the camelCase API shape. */
function txnToApi(t: GiftCardTransactionRow) {
  return {
    id:              t.id,
    giftCardId:      t.gift_card_id,
    userId:          t.user_id,
    type:            t.type,
    amount:          Number(t.amount),
    balanceBefore:   Number(t.balance_before),
    balanceAfter:    Number(t.balance_after),
    transactionDate: t.transaction_date,
    location:        t.location,
    description:     t.description,
    expenseId:       t.expense_id,
    createdAt:       t.created_at,
  };
}

/** Typed error thrown by the service. */
interface ServiceError extends Error {
  errorCode?: string;
}

// ── GET / ─────────────────────────────────────────────────────────────────────

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const cards = await getGiftCards(req.user!.userId);
    res.json({ cards: cards.map(cardToApi) });
  } catch (err) {
    console.error('[SQIRL-GIFT-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-GIFT-SERVER-001' });
  }
});

// ── POST / ────────────────────────────────────────────────────────────────────

router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { brandId, cardNumber, barcodeFormat, balance, pin, expiryDate, notes, clientId } = req.body as {
      brandId?: unknown;
      cardNumber?: unknown;
      barcodeFormat?: unknown;
      balance?: unknown;
      pin?: unknown;
      expiryDate?: unknown;
      notes?: unknown;
      clientId?: unknown;
    };

    if (!brandId || typeof brandId !== 'string' || !cardNumber || typeof cardNumber !== 'string' || balance === undefined || balance === null) {
      res.status(400).json({ error: 'brandId, cardNumber, and balance are required', errorCode: 'SQIRL-GIFT-CREATE-001' });
      return;
    }

    const balanceNum = Number(balance);
    if (isNaN(balanceNum) || balanceNum < 0) {
      res.status(400).json({ error: 'balance must be a non-negative number', errorCode: 'SQIRL-GIFT-CREATE-003' });
      return;
    }

    const fmt = barcodeFormat ?? 'CODE128';
    if (typeof fmt !== 'string' || !isValidGiftBarcodeFormat(fmt)) {
      res.status(400).json({ error: 'Invalid barcode format', errorCode: 'SQIRL-GIFT-CREATE-002' });
      return;
    }

    const isTest = !!(req as Request & { isTest?: boolean }).isTest;
    const card = await addGiftCard(
      req.user!.userId,
      brandId,
      cardNumber,
      fmt as BarcodeFormat,
      balanceNum,
      typeof pin === 'string' ? pin : undefined,
      typeof expiryDate === 'string' ? expiryDate : undefined,
      typeof notes === 'string' ? notes : undefined,
      typeof clientId === 'string' ? clientId : undefined,
      isTest
    );
    res.status(201).json({ card: cardToApi(card) });
    broadcast('giftCards:changed', req.user!.userId, card.household_id ?? undefined);
  } catch (err) {
    console.error('[SQIRL-GIFT-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-GIFT-SERVER-001' });
  }
});

// ── PUT /:cardId ──────────────────────────────────────────────────────────────

router.put('/:cardId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { cardId } = req.params;
    const { cardNumber, barcodeFormat, pin, expiryDate, notes } = req.body as {
      cardNumber?: unknown;
      barcodeFormat?: unknown;
      pin?: unknown;
      expiryDate?: unknown;
      notes?: unknown;
    };

    if (barcodeFormat !== undefined) {
      if (typeof barcodeFormat !== 'string' || !isValidGiftBarcodeFormat(barcodeFormat)) {
        res.status(400).json({ error: 'Invalid barcode format', errorCode: 'SQIRL-GIFT-CREATE-002' });
        return;
      }
    }

    const fields: Parameters<typeof updateGiftCard>[2] = {};
    if (typeof cardNumber === 'string')     fields.cardNumber    = cardNumber;
    if (typeof barcodeFormat === 'string')  fields.barcodeFormat = barcodeFormat as BarcodeFormat;
    if (pin !== undefined)                  fields.pin           = typeof pin === 'string' ? pin : null;
    if (expiryDate !== undefined)           fields.expiryDate    = typeof expiryDate === 'string' ? expiryDate : null;
    if (notes !== undefined)                fields.notes         = typeof notes === 'string' ? notes : null;

    const card = await updateGiftCard(cardId, req.user!.userId, fields);
    res.json({ card: cardToApi(card) });
    broadcast('giftCards:changed', req.user!.userId, card.household_id ?? undefined);
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-GIFT-ACCESS-001') {
      res.status(404).json({ error: e.message, errorCode: 'SQIRL-GIFT-ACCESS-001' });
      return;
    }
    console.error('[SQIRL-GIFT-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-GIFT-SERVER-001' });
  }
});

// ── PUT /:cardId/balance ──────────────────────────────────────────────────────

router.put('/:cardId/balance', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { cardId } = req.params;
    const { newBalance, note } = req.body as { newBalance?: unknown; note?: unknown };

    const newBalanceNum = Number(newBalance);
    if (newBalance === undefined || newBalance === null || isNaN(newBalanceNum) || newBalanceNum < 0) {
      res.status(400).json({ error: 'newBalance must be a non-negative number', errorCode: 'SQIRL-GIFT-BAL-001' });
      return;
    }

    const { card, transaction } = await updateGiftCardBalance(
      cardId,
      req.user!.userId,
      newBalanceNum,
      typeof note === 'string' ? note : undefined
    );
    res.json({ card: cardToApi(card), transaction: txnToApi(transaction) });
    broadcast('giftCards:changed', req.user!.userId, card.household_id ?? undefined);
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-GIFT-ACCESS-001') {
      res.status(404).json({ error: e.message, errorCode: 'SQIRL-GIFT-ACCESS-001' });
      return;
    }
    console.error('[SQIRL-GIFT-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-GIFT-SERVER-001' });
  }
});

// ── POST /:cardId/transactions ────────────────────────────────────────────────

router.post('/:cardId/transactions', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { cardId } = req.params;
    const { amount, transactionDate, location, description, addAsExpense } = req.body as {
      amount?: unknown;
      transactionDate?: unknown;
      location?: unknown;
      description?: unknown;
      addAsExpense?: unknown;
    };

    const amountNum = Number(amount);
    if (amount === undefined || amount === null || isNaN(amountNum) || amountNum === 0) {
      res.status(400).json({ error: 'amount must be a non-zero number', errorCode: 'SQIRL-GIFT-TXN-001' });
      return;
    }

    if (!transactionDate || typeof transactionDate !== 'string') {
      res.status(400).json({ error: 'transactionDate is required', errorCode: 'SQIRL-GIFT-TXN-002' });
      return;
    }

    const isTest = !!(req as Request & { isTest?: boolean }).isTest;
    const { card, transaction, expenseId } = await addGiftCardTransaction(
      cardId,
      req.user!.userId,
      amountNum,
      transactionDate,
      typeof location === 'string' ? location : undefined,
      typeof description === 'string' ? description : undefined,
      addAsExpense === true,
      isTest
    );
    res.status(201).json({ card: cardToApi(card), transaction: txnToApi(transaction), expenseId });
    broadcast('giftCards:changed', req.user!.userId, card.household_id ?? undefined);
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-GIFT-ACCESS-001') {
      res.status(404).json({ error: e.message, errorCode: 'SQIRL-GIFT-ACCESS-001' });
      return;
    }
    console.error('[SQIRL-GIFT-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-GIFT-SERVER-001' });
  }
});

// ── GET /:cardId/transactions ─────────────────────────────────────────────────

router.get('/:cardId/transactions', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { cardId } = req.params;
    const transactions = await getGiftCardTransactions(cardId, req.user!.userId);
    res.json({ transactions: transactions.map(txnToApi) });
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-GIFT-ACCESS-001') {
      res.status(404).json({ error: e.message, errorCode: 'SQIRL-GIFT-ACCESS-001' });
      return;
    }
    console.error('[SQIRL-GIFT-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-GIFT-SERVER-001' });
  }
});

// ── PUT /:cardId/archive ──────────────────────────────────────────────────────

router.put('/:cardId/archive', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { cardId } = req.params;
    const card = await archiveGiftCard(cardId, req.user!.userId);
    res.json({ card: cardToApi(card) });
    broadcast('giftCards:changed', req.user!.userId, card.household_id ?? undefined);
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-GIFT-ACCESS-001') {
      res.status(404).json({ error: e.message, errorCode: 'SQIRL-GIFT-ACCESS-001' });
      return;
    }
    console.error('[SQIRL-GIFT-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-GIFT-SERVER-001' });
  }
});

// ── DELETE /:cardId ───────────────────────────────────────────────────────────

router.delete('/:cardId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { cardId } = req.params;
    const userId = req.user!.userId;
    await deleteGiftCard(cardId, userId);
    res.json({ success: true });
    void getUserHhId(userId).then((hhId) => broadcast('giftCards:changed', userId, hhId ?? undefined));
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-GIFT-ACCESS-001') {
      res.status(404).json({ error: e.message, errorCode: 'SQIRL-GIFT-ACCESS-001' });
      return;
    }
    console.error('[SQIRL-GIFT-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-GIFT-SERVER-001' });
  }
});

export default router;
