/**
 * Loyalty Card Service — CRUD for household-shared loyalty cards.
 *
 * All cards are scoped to the user's household so every member can view,
 * edit, and delete any card in the household. Personal cards (no household)
 * belong solely to the adding user.
 *
 * Offline-first: every row carries updated_at, synced_at, client_id,
 * is_deleted (soft-delete).
 *
 * Pure helper exports (for unit tests):
 *   isValidBarcodeFormat(format)       → boolean
 *   canAccessCard(userId, hhId, card)  → boolean
 *
 * Error codes:
 *   SQIRL-LOYAL-CREATE-001   Missing required brandId or cardNumber
 *   SQIRL-LOYAL-CREATE-002   Invalid barcode format
 *   SQIRL-LOYAL-ACCESS-001   Card not found or user lacks access
 *   SQIRL-LOYAL-SERVER-001   Unexpected server error
 */

import { pool } from '../db';

// ── Barcode format registry ───────────────────────────────────────────────────

export type BarcodeFormat =
  | 'CODE128' | 'EAN13' | 'EAN8' | 'QR' | 'CODABAR'
  | 'ITF' | 'CODE39' | 'UPC_A' | 'UPC_E' | 'PDF417'
  | 'AZTEC' | 'DATA_MATRIX';

const VALID_FORMATS: ReadonlySet<string> = new Set<BarcodeFormat>([
  'CODE128', 'EAN13', 'EAN8', 'QR', 'CODABAR',
  'ITF', 'CODE39', 'UPC_A', 'UPC_E', 'PDF417',
  'AZTEC', 'DATA_MATRIX',
]);

// ── Row type (snake_case — DB layer) ──────────────────────────────────────────

export interface LoyaltyCardRow {
  id: string;
  household_id: string | null;
  added_by_user_id: string | null;
  brand_id: string;
  card_number: string;
  barcode_format: BarcodeFormat;
  notes: string | null;
  updated_at: string;
  synced_at: string | null;
  client_id: string | null;
  is_deleted: boolean;
  is_test_data: boolean;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Returns true when the provided format string is a recognised BarcodeFormat.
 * Used at the route layer to validate incoming payloads before hitting the DB.
 *
 * @param format - Raw string from the request body
 * @returns true if the format is valid
 */
export function isValidBarcodeFormat(format: string): format is BarcodeFormat {
  return VALID_FORMATS.has(format);
}

/**
 * Returns true when the user is allowed to read/write/delete the given card.
 * Access is granted when:
 *   - Card is not deleted AND (card belongs to user's household OR user is the adder)
 *
 * @param userId      - Authenticated user's ID
 * @param householdId - The user's current household ID (null if none)
 * @param card        - The DB row to check
 */
export function canAccessCard(
  userId: string,
  householdId: string | null,
  card: LoyaltyCardRow
): boolean {
  if (card.is_deleted) return false;
  if (card.household_id && householdId && card.household_id === householdId) return true;
  if (card.added_by_user_id === userId) return true;
  return false;
}

// ── DB operations ─────────────────────────────────────────────────────────────

/**
 * Returns all non-deleted loyalty cards visible to the user.
 * If the user is in a household, returns all household cards.
 * If not, returns only cards added by the user directly.
 *
 * @param userId - Authenticated user ID
 * @returns Array of loyalty card rows ordered by updated_at DESC
 */
export async function getCards(userId: string): Promise<LoyaltyCardRow[]> {
  const result = await pool.query<LoyaltyCardRow>(
    `SELECT lc.*
     FROM loyalty_cards lc
     LEFT JOIN household_members hm ON hm.household_id = lc.household_id
       AND hm.user_id = $1
     WHERE lc.is_deleted = FALSE
       AND (
         (lc.household_id IS NOT NULL AND hm.user_id IS NOT NULL)
         OR (lc.household_id IS NULL AND lc.added_by_user_id = $1)
       )
     ORDER BY lc.updated_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Adds a new loyalty card for the user.
 * If the user belongs to a household, the card is linked to that household
 * so all members can see it.
 *
 * @param userId        - Authenticated user ID
 * @param brandId       - Brand slug from the shared loyaltyBrands catalog
 * @param cardNumber    - The loyalty card number
 * @param barcodeFormat - Encoding format for barcode rendering
 * @param notes         - Optional user notes
 * @param clientId      - Optional offline client ID for sync
 * @param isTest        - Whether this is test data
 * @returns The newly created card row
 */
export async function addCard(
  userId: string,
  brandId: string,
  cardNumber: string,
  barcodeFormat: BarcodeFormat,
  notes?: string,
  clientId?: string,
  isTest?: boolean
): Promise<LoyaltyCardRow> {
  // Resolve household for the user
  const hhRes = await pool.query<{ household_id: string }>(
    `SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const householdId = hhRes.rows[0]?.household_id ?? null;

  const result = await pool.query<LoyaltyCardRow>(
    `INSERT INTO loyalty_cards
       (household_id, added_by_user_id, brand_id, card_number, barcode_format,
        notes, client_id, is_test_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      householdId,
      userId,
      brandId,
      cardNumber,
      barcodeFormat,
      notes ?? null,
      clientId ?? null,
      isTest ?? false,
    ]
  );
  return result.rows[0];
}

/**
 * Updates mutable fields on a loyalty card the user can access.
 * Throws with SQIRL-LOYAL-ACCESS-001 if the card is not found or inaccessible.
 *
 * @param cardId      - Card UUID to update
 * @param userId      - Authenticated user ID
 * @param fields      - Partial update payload
 * @returns Updated card row
 */
export async function updateCard(
  cardId: string,
  userId: string,
  fields: {
    cardNumber?: string;
    barcodeFormat?: BarcodeFormat;
    notes?: string | null;
  }
): Promise<LoyaltyCardRow> {
  // Fetch the card first
  const existing = await pool.query<LoyaltyCardRow>(
    `SELECT * FROM loyalty_cards WHERE id = $1`,
    [cardId]
  );
  if (!existing.rows[0]) {
    const err = new Error('Card not found');
    (err as Error & { errorCode: string }).errorCode = 'SQIRL-LOYAL-ACCESS-001';
    throw err;
  }
  const card = existing.rows[0];

  // Check access via household membership
  const hhRes = await pool.query<{ household_id: string }>(
    `SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const householdId = hhRes.rows[0]?.household_id ?? null;

  if (!canAccessCard(userId, householdId, card)) {
    const err = new Error('Card not found or user lacks access');
    (err as Error & { errorCode: string }).errorCode = 'SQIRL-LOYAL-ACCESS-001';
    throw err;
  }

  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let idx = 1;

  if (fields.cardNumber !== undefined) {
    sets.push(`card_number = $${idx++}`);
    params.push(fields.cardNumber);
  }
  if (fields.barcodeFormat !== undefined) {
    sets.push(`barcode_format = $${idx++}`);
    params.push(fields.barcodeFormat);
  }
  if (fields.notes !== undefined) {
    sets.push(`notes = $${idx++}`);
    params.push(fields.notes);
  }

  params.push(cardId);
  const result = await pool.query<LoyaltyCardRow>(
    `UPDATE loyalty_cards SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return result.rows[0];
}

/**
 * Soft-deletes a loyalty card the user can access.
 * Throws with SQIRL-LOYAL-ACCESS-001 if the card is not found or inaccessible.
 *
 * @param cardId  - Card UUID to delete
 * @param userId  - Authenticated user ID
 */
export async function deleteCard(cardId: string, userId: string): Promise<void> {
  const existing = await pool.query<LoyaltyCardRow>(
    `SELECT * FROM loyalty_cards WHERE id = $1`,
    [cardId]
  );
  if (!existing.rows[0]) {
    const err = new Error('Card not found');
    (err as Error & { errorCode: string }).errorCode = 'SQIRL-LOYAL-ACCESS-001';
    throw err;
  }
  const card = existing.rows[0];

  const hhRes = await pool.query<{ household_id: string }>(
    `SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const householdId = hhRes.rows[0]?.household_id ?? null;

  if (!canAccessCard(userId, householdId, card)) {
    const err = new Error('Card not found or user lacks access');
    (err as Error & { errorCode: string }).errorCode = 'SQIRL-LOYAL-ACCESS-001';
    throw err;
  }

  await pool.query(
    `UPDATE loyalty_cards SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1`,
    [cardId]
  );
}
