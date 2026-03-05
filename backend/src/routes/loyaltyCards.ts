/**
 * Loyalty Cards routes — /api/v1/loyalty-cards
 *
 * All routes require authentication via the `authenticate` middleware.
 * Cards are household-scoped: any household member can view, add, edit, or delete.
 *
 * Routes:
 *   GET    /              — list all accessible loyalty cards
 *   POST   /              — add a new loyalty card
 *   PUT    /:cardId       — update a loyalty card
 *   DELETE /:cardId       — soft-delete a loyalty card
 *
 * Error codes:
 *   SQIRL-LOYAL-CREATE-001   Missing required brandId or cardNumber
 *   SQIRL-LOYAL-CREATE-002   Invalid barcode format
 *   SQIRL-LOYAL-ACCESS-001   Card not found or user lacks access
 *   SQIRL-LOYAL-SERVER-001   Unexpected server error
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import {
  isValidBarcodeFormat,
  getCards,
  addCard,
  updateCard,
  deleteCard,
  type BarcodeFormat,
  type LoyaltyCardRow,
} from '../services/loyaltyCardService';
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

/** Convert a snake_case DB row to the camelCase API response shape. */
function toApi(card: LoyaltyCardRow) {
  return {
    id:             card.id,
    householdId:    card.household_id,
    addedByUserId:  card.added_by_user_id,
    brandId:        card.brand_id,
    cardNumber:     card.card_number,
    barcodeFormat:  card.barcode_format,
    notes:          card.notes,
    updatedAt:      card.updated_at,
    syncedAt:       card.synced_at,
    clientId:       card.client_id,
    isDeleted:      card.is_deleted,
  };
}

// ── GET / ─────────────────────────────────────────────────────────────────────

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const cards = await getCards(req.user!.userId);
    res.json({ cards: cards.map(toApi) });
  } catch (err) {
    console.error('[SQIRL-LOYAL-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-LOYAL-SERVER-001' });
  }
});

// ── POST / ────────────────────────────────────────────────────────────────────

router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { brandId, cardNumber, barcodeFormat, notes, clientId } = req.body as {
      brandId?: unknown;
      cardNumber?: unknown;
      barcodeFormat?: unknown;
      notes?: unknown;
      clientId?: unknown;
    };

    if (!brandId || typeof brandId !== 'string' || !cardNumber || typeof cardNumber !== 'string') {
      res.status(400).json({ error: 'brandId and cardNumber are required', errorCode: 'SQIRL-LOYAL-CREATE-001' });
      return;
    }

    const fmt = barcodeFormat ?? 'CODE128';
    if (typeof fmt !== 'string' || !isValidBarcodeFormat(fmt)) {
      res.status(400).json({ error: 'Invalid barcode format', errorCode: 'SQIRL-LOYAL-CREATE-002' });
      return;
    }

    const isTest = !!(req as Request & { isTest?: boolean }).isTest;
    const card = await addCard(
      req.user!.userId,
      brandId,
      cardNumber,
      fmt as BarcodeFormat,
      typeof notes === 'string' ? notes : undefined,
      typeof clientId === 'string' ? clientId : undefined,
      isTest
    );
    res.status(201).json({ card: toApi(card) });
    broadcast('loyaltyCards:changed', req.user!.userId, card.household_id ?? undefined);
  } catch (err) {
    console.error('[SQIRL-LOYAL-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-LOYAL-SERVER-001' });
  }
});

// ── PUT /:cardId ──────────────────────────────────────────────────────────────

router.put('/:cardId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { cardId } = req.params;
    const { cardNumber, barcodeFormat, notes } = req.body as {
      cardNumber?: unknown;
      barcodeFormat?: unknown;
      notes?: unknown;
    };

    if (barcodeFormat !== undefined) {
      if (typeof barcodeFormat !== 'string' || !isValidBarcodeFormat(barcodeFormat)) {
        res.status(400).json({ error: 'Invalid barcode format', errorCode: 'SQIRL-LOYAL-CREATE-002' });
        return;
      }
    }

    const fields: Parameters<typeof updateCard>[2] = {};
    if (typeof cardNumber === 'string')    fields.cardNumber    = cardNumber;
    if (typeof barcodeFormat === 'string') fields.barcodeFormat = barcodeFormat as BarcodeFormat;
    if (notes !== undefined)               fields.notes         = typeof notes === 'string' ? notes : null;

    const card = await updateCard(cardId, req.user!.userId, fields);
    res.json({ card: toApi(card) });
    broadcast('loyaltyCards:changed', req.user!.userId, card.household_id ?? undefined);
  } catch (err) {
    const e = err as Error & { errorCode?: string };
    if (e.errorCode === 'SQIRL-LOYAL-ACCESS-001') {
      res.status(404).json({ error: e.message, errorCode: 'SQIRL-LOYAL-ACCESS-001' });
      return;
    }
    console.error('[SQIRL-LOYAL-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-LOYAL-SERVER-001' });
  }
});

// ── DELETE /:cardId ───────────────────────────────────────────────────────────

router.delete('/:cardId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { cardId } = req.params;
    const userId = req.user!.userId;
    await deleteCard(cardId, userId);
    res.json({ success: true });
    void getUserHhId(userId).then((hhId) => broadcast('loyaltyCards:changed', userId, hhId ?? undefined));
  } catch (err) {
    const e = err as Error & { errorCode?: string };
    if (e.errorCode === 'SQIRL-LOYAL-ACCESS-001') {
      res.status(404).json({ error: e.message, errorCode: 'SQIRL-LOYAL-ACCESS-001' });
      return;
    }
    console.error('[SQIRL-LOYAL-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-LOYAL-SERVER-001' });
  }
});

export default router;
