/**
 * Unit tests: loyaltyCardService pure helpers
 *
 * Tests cover:
 *  - isValidBarcodeFormat: valid and invalid format strings
 *  - canAccessCard: household match, owner fallback, deleted card, null household
 */

import {
  isValidBarcodeFormat,
  canAccessCard,
  type LoyaltyCardRow,
} from '../../src/services/loyaltyCardService';

// ── Helper: build a minimal LoyaltyCardRow ────────────────────────────────────

function makeCard(overrides: Partial<LoyaltyCardRow> = {}): LoyaltyCardRow {
  return {
    id: 'card-1',
    household_id: 'hh-1',
    added_by_user_id: 'user-1',
    brand_id: 'woolworths-au',
    card_number: '123456789',
    barcode_format: 'CODE128',
    notes: null,
    updated_at: new Date().toISOString(),
    synced_at: null,
    client_id: null,
    is_deleted: false,
    is_test_data: false,
    ...overrides,
  };
}

// ── isValidBarcodeFormat ──────────────────────────────────────────────────────

describe('isValidBarcodeFormat', () => {
  const valid = [
    'CODE128', 'EAN13', 'EAN8', 'QR', 'CODABAR',
    'ITF', 'CODE39', 'UPC_A', 'UPC_E', 'PDF417',
    'AZTEC', 'DATA_MATRIX',
  ];

  it.each(valid)('accepts valid format %s', (fmt) => {
    expect(isValidBarcodeFormat(fmt)).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidBarcodeFormat('')).toBe(false);
  });

  it('rejects unknown format', () => {
    expect(isValidBarcodeFormat('UNKNOWN')).toBe(false);
  });

  it('rejects lowercase variant', () => {
    expect(isValidBarcodeFormat('code128')).toBe(false);
  });

  it('rejects mixed case', () => {
    expect(isValidBarcodeFormat('Code128')).toBe(false);
  });
});

// ── canAccessCard ─────────────────────────────────────────────────────────────

describe('canAccessCard', () => {
  it('returns true when card belongs to the user household', () => {
    const card = makeCard({ household_id: 'hh-1', added_by_user_id: 'user-2' });
    expect(canAccessCard('user-1', 'hh-1', card)).toBe(true);
  });

  it('returns true when user is the card owner (no household)', () => {
    const card = makeCard({ household_id: null, added_by_user_id: 'user-1' });
    expect(canAccessCard('user-1', null, card)).toBe(true);
  });

  it('returns true when user is the card owner regardless of their household', () => {
    const card = makeCard({ household_id: null, added_by_user_id: 'user-1' });
    expect(canAccessCard('user-1', 'hh-2', card)).toBe(true);
  });

  it('returns false when household does not match and user is not the owner', () => {
    const card = makeCard({ household_id: 'hh-1', added_by_user_id: 'user-2' });
    expect(canAccessCard('user-3', 'hh-2', card)).toBe(false);
  });

  it('returns false for a deleted card', () => {
    const card = makeCard({ household_id: 'hh-1', is_deleted: true });
    expect(canAccessCard('user-1', 'hh-1', card)).toBe(false);
  });

  it('returns false when both household_id and added_by_user_id are null', () => {
    const card = makeCard({ household_id: null, added_by_user_id: null });
    expect(canAccessCard('user-1', 'hh-1', card)).toBe(false);
  });
});
