/**
 * Gift Card Service — CRUD, balance management, and transaction history.
 *
 * All gift cards are scoped to the user's household so every member can
 * view, edit, transact, archive, and delete any card in the household.
 * Personal cards (no household) belong solely to the adding user.
 *
 * Auto-archive: when a card's balance reaches exactly 0 after a transaction
 * or balance update, the service atomically sets is_archived = TRUE.
 *
 * Offline-first: every gift_cards row carries updated_at, synced_at,
 * client_id, is_deleted (soft-delete).
 *
 * Expense integration: when a 'spend' transaction is recorded with
 * addAsExpense=true, the service inserts a stub personal expense row.
 *
 * Pure helper exports (for unit tests):
 *   isValidGiftBarcodeFormat(format)          → boolean
 *   canAccessGiftCard(userId, hhId, card)     → boolean
 *   computeTransactionType(amount)            → TransactionType
 *
 * Error codes:
 *   SQIRL-GIFT-CREATE-001   Missing required brandId, cardNumber, or balance
 *   SQIRL-GIFT-CREATE-002   Invalid barcode format
 *   SQIRL-GIFT-CREATE-003   Balance must be a non-negative number
 *   SQIRL-GIFT-ACCESS-001   Card not found or user lacks access
 *   SQIRL-GIFT-TXN-001      Transaction amount must not be zero
 *   SQIRL-GIFT-TXN-002      Transaction date is required for spend/reload
 *   SQIRL-GIFT-BAL-001      New balance must be a non-negative number
 *   SQIRL-GIFT-SERVER-001   Unexpected server error
 */

import { pool } from '../db';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BarcodeFormat =
  | 'CODE128' | 'EAN13' | 'EAN8' | 'QR' | 'CODABAR'
  | 'ITF' | 'CODE39' | 'UPC_A' | 'UPC_E' | 'PDF417'
  | 'AZTEC' | 'DATA_MATRIX';

export type TransactionType = 'balance_update' | 'spend' | 'reload';

/** DB row shape (snake_case — never exposed directly to API consumers). */
export interface GiftCardRow {
  id: string;
  household_id: string | null;
  added_by_user_id: string | null;
  brand_id: string;
  card_number: string;
  barcode_format: BarcodeFormat;
  pin: string | null;
  /** PostgreSQL NUMERIC returns as string — always wrap with Number() before arithmetic. */
  balance: string;
  expiry_date: string | null;
  notes: string | null;
  is_archived: boolean;
  updated_at: string;
  synced_at: string | null;
  client_id: string | null;
  is_deleted: boolean;
  is_test_data: boolean;
}

export interface GiftCardTransactionRow {
  id: string;
  gift_card_id: string;
  user_id: string | null;
  type: TransactionType;
  amount: string;
  balance_before: string;
  balance_after: string;
  transaction_date: string;
  location: string | null;
  description: string | null;
  expense_id: string | null;
  is_test_data: boolean;
  created_at: string;
}

// ── Barcode format registry ───────────────────────────────────────────────────

const VALID_FORMATS: ReadonlySet<string> = new Set<BarcodeFormat>([
  'CODE128', 'EAN13', 'EAN8', 'QR', 'CODABAR',
  'ITF', 'CODE39', 'UPC_A', 'UPC_E', 'PDF417',
  'AZTEC', 'DATA_MATRIX',
]);

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Returns true when the format string is a recognised BarcodeFormat.
 * Mirrors the CHECK constraint in the DB so we can reject early at the route.
 *
 * @param format - Raw string from the request body
 */
export function isValidGiftBarcodeFormat(format: string): format is BarcodeFormat {
  return VALID_FORMATS.has(format);
}

/**
 * Returns true when the user may read/write/delete/transact on the given card.
 * Access is granted when:
 *   - Card is NOT deleted AND
 *   - Card belongs to user's household, OR user is the adder.
 *
 * @param userId      - Authenticated user's ID
 * @param householdId - The user's current household ID (null if none)
 * @param card        - The DB row to check
 */
export function canAccessGiftCard(
  userId: string,
  householdId: string | null,
  card: GiftCardRow
): boolean {
  if (card.is_deleted) return false;
  if (card.household_id && householdId && card.household_id === householdId) return true;
  if (card.added_by_user_id === userId) return true;
  return false;
}

/**
 * Classifies a numeric delta as a transaction type.
 *   negative → 'spend'
 *   positive → 'reload'
 *   zero     → 'balance_update' (used for manual set operations)
 *
 * @param amount - Signed amount (negative = debit)
 */
export function computeTransactionType(amount: number): TransactionType {
  if (amount < 0) return 'spend';
  if (amount > 0) return 'reload';
  return 'balance_update';
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Resolve the user's household ID or null. */
async function resolveHousehold(userId: string): Promise<string | null> {
  const r = await pool.query<{ household_id: string }>(
    `SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.household_id ?? null;
}

/** Fetch a card by id and throw SQIRL-GIFT-ACCESS-001 if missing. */
async function fetchCard(cardId: string): Promise<GiftCardRow> {
  const r = await pool.query<GiftCardRow>(`SELECT * FROM gift_cards WHERE id = $1`, [cardId]);
  if (!r.rows[0]) {
    const err = new Error('Gift card not found');
    (err as Error & { errorCode: string }).errorCode = 'SQIRL-GIFT-ACCESS-001';
    throw err;
  }
  return r.rows[0];
}

/** Throw SQIRL-GIFT-ACCESS-001 when the user cannot access the card. */
async function assertAccess(userId: string, card: GiftCardRow): Promise<void> {
  const householdId = await resolveHousehold(userId);
  if (!canAccessGiftCard(userId, householdId, card)) {
    const err = new Error('Gift card not found or user lacks access');
    (err as Error & { errorCode: string }).errorCode = 'SQIRL-GIFT-ACCESS-001';
    throw err;
  }
}

// ── DB operations ─────────────────────────────────────────────────────────────

/**
 * Returns all non-deleted gift cards visible to the user (active + archived).
 * If in a household, returns all household cards; otherwise personal cards only.
 *
 * @param userId - Authenticated user ID
 */
export async function getGiftCards(userId: string): Promise<GiftCardRow[]> {
  const result = await pool.query<GiftCardRow>(
    `SELECT gc.*
     FROM gift_cards gc
     LEFT JOIN household_members hm ON hm.household_id = gc.household_id
       AND hm.user_id = $1
     WHERE gc.is_deleted = FALSE
       AND (
         (gc.household_id IS NOT NULL AND hm.user_id IS NOT NULL)
         OR (gc.household_id IS NULL AND gc.added_by_user_id = $1)
       )
     ORDER BY gc.is_archived ASC, gc.updated_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Adds a new gift card for the user, linked to their household if applicable.
 *
 * @param userId        - Authenticated user ID
 * @param brandId       - Brand slug from giftBrands catalog
 * @param cardNumber    - The card number (may be scanned)
 * @param barcodeFormat - Encoding format for barcode rendering
 * @param balance       - Opening balance (non-negative)
 * @param pin           - Optional PIN
 * @param expiryDate    - Optional ISO date string (YYYY-MM-DD)
 * @param notes         - Optional free-text notes
 * @param clientId      - Optional offline client ID for sync
 * @param isTest        - Whether this is test data
 */
export async function addGiftCard(
  userId: string,
  brandId: string,
  cardNumber: string,
  barcodeFormat: BarcodeFormat,
  balance: number,
  pin?: string,
  expiryDate?: string,
  notes?: string,
  clientId?: string,
  isTest?: boolean
): Promise<GiftCardRow> {
  const householdId = await resolveHousehold(userId);

  const result = await pool.query<GiftCardRow>(
    `INSERT INTO gift_cards
       (household_id, added_by_user_id, brand_id, card_number, barcode_format,
        pin, balance, expiry_date, notes, client_id, is_test_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      householdId,
      userId,
      brandId,
      cardNumber,
      barcodeFormat,
      pin ?? null,
      balance,
      expiryDate ?? null,
      notes ?? null,
      clientId ?? null,
      isTest ?? false,
    ]
  );
  return result.rows[0];
}

/**
 * Updates mutable fields on a gift card.
 * Throws SQIRL-GIFT-ACCESS-001 if not found or inaccessible.
 *
 * @param cardId  - Card UUID to update
 * @param userId  - Authenticated user ID
 * @param fields  - Partial update payload
 */
export async function updateGiftCard(
  cardId: string,
  userId: string,
  fields: {
    cardNumber?: string;
    barcodeFormat?: BarcodeFormat;
    pin?: string | null;
    expiryDate?: string | null;
    notes?: string | null;
  }
): Promise<GiftCardRow> {
  const card = await fetchCard(cardId);
  await assertAccess(userId, card);

  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let idx = 1;

  if (fields.cardNumber  !== undefined) { sets.push(`card_number    = $${idx++}`); params.push(fields.cardNumber); }
  if (fields.barcodeFormat !== undefined) { sets.push(`barcode_format = $${idx++}`); params.push(fields.barcodeFormat); }
  if (fields.pin !== undefined)         { sets.push(`pin            = $${idx++}`); params.push(fields.pin); }
  if (fields.expiryDate !== undefined)  { sets.push(`expiry_date    = $${idx++}`); params.push(fields.expiryDate); }
  if (fields.notes !== undefined)       { sets.push(`notes          = $${idx++}`); params.push(fields.notes); }

  params.push(cardId);
  const result = await pool.query<GiftCardRow>(
    `UPDATE gift_cards SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return result.rows[0];
}

/**
 * Manually sets the balance on a gift card and records a 'balance_update'
 * transaction. If newBalance reaches 0, the card is auto-archived.
 * All operations are in a single DB transaction for consistency.
 *
 * @param cardId     - Card UUID
 * @param userId     - Authenticated user ID
 * @param newBalance - Non-negative new balance
 * @param note       - Optional note to store as transaction description
 * @returns Updated card row and the transaction row
 */
export async function updateGiftCardBalance(
  cardId: string,
  userId: string,
  newBalance: number,
  note?: string
): Promise<{ card: GiftCardRow; transaction: GiftCardTransactionRow }> {
  const card = await fetchCard(cardId);
  await assertAccess(userId, card);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const balanceBefore = Number(card.balance);
    const delta = newBalance - balanceBefore;
    const shouldArchive = newBalance === 0;

    const updatedCard = await client.query<GiftCardRow>(
      `UPDATE gift_cards
       SET balance = $1, is_archived = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [newBalance, shouldArchive, cardId]
    );

    const txn = await client.query<GiftCardTransactionRow>(
      `INSERT INTO gift_card_transactions
         (gift_card_id, user_id, type, amount, balance_before, balance_after,
          transaction_date, description, is_test_data)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8)
       RETURNING *`,
      [
        cardId,
        userId,
        'balance_update',
        delta,
        balanceBefore,
        newBalance,
        note ?? null,
        card.is_test_data,
      ]
    );

    await client.query('COMMIT');
    return { card: updatedCard.rows[0], transaction: txn.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Records a spend or reload transaction against a gift card.
 * A positive amount adds to the balance (reload); negative deducts (spend).
 * If the resulting balance reaches 0 the card is auto-archived.
 * Optionally creates a stub personal expense row when addAsExpense=true.
 * All operations are atomic.
 *
 * @param cardId          - Card UUID
 * @param userId          - Authenticated user ID
 * @param amount          - Signed delta (negative=spend, positive=reload)
 * @param transactionDate - ISO datetime string
 * @param location        - Optional location label
 * @param description     - Optional description
 * @param addAsExpense    - If true, create a personal expense record for spend amounts
 * @param isTest          - Whether this is test data
 */
export async function addGiftCardTransaction(
  cardId: string,
  userId: string,
  amount: number,
  transactionDate: string,
  location?: string,
  description?: string,
  addAsExpense?: boolean,
  isTest?: boolean
): Promise<{ card: GiftCardRow; transaction: GiftCardTransactionRow; expenseId?: string }> {
  const card = await fetchCard(cardId);
  await assertAccess(userId, card);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const balanceBefore = Number(card.balance);
    const balanceAfter = Math.max(0, balanceBefore + amount);
    const type = computeTransactionType(amount);
    const shouldArchive = balanceAfter === 0;

    const updatedCard = await client.query<GiftCardRow>(
      `UPDATE gift_cards
       SET balance = $1, is_archived = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [balanceAfter, shouldArchive, cardId]
    );

    const txn = await client.query<GiftCardTransactionRow>(
      `INSERT INTO gift_card_transactions
         (gift_card_id, user_id, type, amount, balance_before, balance_after,
          transaction_date, location, description, is_test_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        cardId,
        userId,
        type,
        amount,
        balanceBefore,
        balanceAfter,
        transactionDate,
        location ?? null,
        description ?? null,
        isTest ?? card.is_test_data,
      ]
    );

    let expenseId: string | undefined;

    // Insert a stub personal expense when the user opts in (spend only).
    // Wrapped in try/catch so it degrades gracefully if the personal_expenses
    // table does not yet exist (expenses feature not yet built).
    if (addAsExpense && type === 'spend') {
      try {
        const expenseRes = await client.query<{ id: string }>(
          `INSERT INTO personal_expenses
             (user_id, amount, description, expense_date, source, source_ref_id, is_test_data)
           VALUES ($1, $2, $3, $4, 'gift_card', $5, $6)
           RETURNING id`,
          [
            userId,
            Math.abs(amount),
            description ?? `Gift card spend — ${card.brand_id}`,
            transactionDate,
            cardId,
            isTest ?? card.is_test_data,
          ]
        );
        expenseId = expenseRes.rows[0]?.id;

        // Back-link the transaction to the expense
        if (expenseId) {
          await client.query(
            `UPDATE gift_card_transactions SET expense_id = $1 WHERE id = $2`,
            [expenseId, txn.rows[0].id]
          );
        }
      } catch {
        // personal_expenses table not yet available — silently skip
      }
    }

    await client.query('COMMIT');
    return { card: updatedCard.rows[0], transaction: txn.rows[0], expenseId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Returns all transactions for a gift card in reverse chronological order.
 * Requires the requesting user to have access to the card.
 *
 * @param cardId - Card UUID
 * @param userId - Authenticated user ID
 */
export async function getGiftCardTransactions(
  cardId: string,
  userId: string
): Promise<GiftCardTransactionRow[]> {
  const card = await fetchCard(cardId);
  await assertAccess(userId, card);

  const result = await pool.query<GiftCardTransactionRow>(
    `SELECT * FROM gift_card_transactions
     WHERE gift_card_id = $1
     ORDER BY transaction_date DESC, created_at DESC`,
    [cardId]
  );
  return result.rows;
}

/**
 * Manually archives a gift card (regardless of balance).
 * Throws SQIRL-GIFT-ACCESS-001 if not found or inaccessible.
 *
 * @param cardId - Card UUID
 * @param userId - Authenticated user ID
 */
export async function archiveGiftCard(cardId: string, userId: string): Promise<GiftCardRow> {
  const card = await fetchCard(cardId);
  await assertAccess(userId, card);

  const result = await pool.query<GiftCardRow>(
    `UPDATE gift_cards SET is_archived = TRUE, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [cardId]
  );
  return result.rows[0];
}

/**
 * Soft-deletes a gift card the user can access.
 * Throws SQIRL-GIFT-ACCESS-001 if not found or inaccessible.
 *
 * @param cardId - Card UUID
 * @param userId - Authenticated user ID
 */
export async function deleteGiftCard(cardId: string, userId: string): Promise<void> {
  const card = await fetchCard(cardId);
  await assertAccess(userId, card);

  await pool.query(
    `UPDATE gift_cards SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1`,
    [cardId]
  );
}
