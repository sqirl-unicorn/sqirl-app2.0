-- Migration 009: Loyalty Cards
--
-- Household-shared loyalty cards with barcode encoding support.
-- Cards are scoped to a household (all members can view/edit/delete).
-- brand_id references the shared loyaltyBrands catalog (client-side slug, no DB FK).
-- barcode_format stores the encoding needed to render the barcode correctly.
-- Offline-first: every row carries updated_at, synced_at, client_id, is_deleted.

CREATE TABLE IF NOT EXISTS loyalty_cards (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         UUID         REFERENCES households(id) ON DELETE CASCADE,
  added_by_user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
  brand_id             TEXT         NOT NULL,
  card_number          TEXT         NOT NULL,
  barcode_format       TEXT         NOT NULL DEFAULT 'CODE128'
                         CHECK (barcode_format IN (
                           'CODE128','EAN13','EAN8','QR','CODABAR',
                           'ITF','CODE39','UPC_A','UPC_E','PDF417',
                           'AZTEC','DATA_MATRIX'
                         )),
  notes                TEXT,
  -- Sync
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  synced_at            TIMESTAMPTZ,
  client_id            TEXT,
  is_deleted           BOOLEAN      NOT NULL DEFAULT FALSE,
  -- Test isolation
  is_test_data         BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_loyalty_cards_household ON loyalty_cards(household_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_cards_deleted   ON loyalty_cards(is_deleted) WHERE is_deleted = FALSE;
