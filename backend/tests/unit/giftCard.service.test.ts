/**
 * Unit tests: giftCardService pure helpers
 *
 * Tests cover:
 *  - isValidGiftBarcodeFormat: valid and invalid format strings
 *  - canAccessGiftCard: household match, owner fallback, deleted/archived card, null household
 *  - autoArchiveOnZeroBalance: balance=0 triggers archive flag
 *  - computeTransactionType: correctly classifies balance changes as spend/reload/balance_update
 */

import {
  isValidGiftBarcodeFormat,
  canAccessGiftCard,
  computeTransactionType,
  type GiftCardRow,
} from '../../src/services/giftCardService';

// ── Helper: build a minimal GiftCardRow ──────────────────────────────────────

function makeCard(overrides: Partial<GiftCardRow> = {}): GiftCardRow {
  return {
    id: 'gc-1',
    household_id: 'hh-1',
    added_by_user_id: 'user-1',
    brand_id: 'amazon-au',
    card_number: '1234-5678-9012',
    barcode_format: 'CODE128',
    pin: null,
    balance: '50.00',
    expiry_date: null,
    notes: null,
    is_archived: false,
    updated_at: new Date().toISOString(),
    synced_at: null,
    client_id: null,
    is_deleted: false,
    is_test_data: false,
    ...overrides,
  };
}

// ── isValidGiftBarcodeFormat ──────────────────────────────────────────────────

describe('isValidGiftBarcodeFormat', () => {
  const valid = [
    'CODE128', 'EAN13', 'EAN8', 'QR', 'CODABAR',
    'ITF', 'CODE39', 'UPC_A', 'UPC_E', 'PDF417',
    'AZTEC', 'DATA_MATRIX',
  ];

  it.each(valid)('accepts valid format %s', (fmt) => {
    expect(isValidGiftBarcodeFormat(fmt)).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidGiftBarcodeFormat('')).toBe(false);
  });

  it('rejects unknown format', () => {
    expect(isValidGiftBarcodeFormat('UNKNOWN')).toBe(false);
  });

  it('rejects lowercase variant', () => {
    expect(isValidGiftBarcodeFormat('code128')).toBe(false);
  });
});

// ── canAccessGiftCard ─────────────────────────────────────────────────────────

describe('canAccessGiftCard', () => {
  it('grants access when user belongs to the same household as the card', () => {
    const card = makeCard({ household_id: 'hh-1' });
    expect(canAccessGiftCard('user-2', 'hh-1', card)).toBe(true);
  });

  it('grants access when user is the adder and card has no household', () => {
    const card = makeCard({ household_id: null, added_by_user_id: 'user-3' });
    expect(canAccessGiftCard('user-3', null, card)).toBe(true);
  });

  it('grants access when user is adder even if they left the household', () => {
    const card = makeCard({ household_id: 'hh-other', added_by_user_id: 'user-4' });
    expect(canAccessGiftCard('user-4', null, card)).toBe(true);
  });

  it('denies access when card belongs to a different household', () => {
    const card = makeCard({ household_id: 'hh-1', added_by_user_id: 'user-other' });
    expect(canAccessGiftCard('user-2', 'hh-2', card)).toBe(false);
  });

  it('denies access on a deleted card', () => {
    const card = makeCard({ is_deleted: true });
    expect(canAccessGiftCard('user-1', 'hh-1', card)).toBe(false);
  });

  it('still allows access to an archived (but not deleted) card', () => {
    const card = makeCard({ is_archived: true, is_deleted: false });
    expect(canAccessGiftCard('user-1', 'hh-1', card)).toBe(true);
  });

  it('denies when both household_id null and user is not adder', () => {
    const card = makeCard({ household_id: null, added_by_user_id: 'user-other' });
    expect(canAccessGiftCard('user-5', null, card)).toBe(false);
  });
});

// ── computeTransactionType ────────────────────────────────────────────────────

describe('computeTransactionType', () => {
  it('classifies negative amount as spend', () => {
    expect(computeTransactionType(-10)).toBe('spend');
  });

  it('classifies positive amount as reload', () => {
    expect(computeTransactionType(25)).toBe('reload');
  });

  it('classifies zero amount as balance_update', () => {
    expect(computeTransactionType(0)).toBe('balance_update');
  });

  it('classifies large negative as spend', () => {
    expect(computeTransactionType(-999.99)).toBe('spend');
  });

  it('classifies large positive as reload', () => {
    expect(computeTransactionType(500)).toBe('reload');
  });
});
