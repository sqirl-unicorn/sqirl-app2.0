-- Migration 010: Gift Cards + Gift Card Transactions
--
-- Household-shared gift cards with balance tracking and transaction history.
-- Cards are scoped to a household (all members can view/edit/delete/transact).
-- brand_id references the shared giftBrands catalog (client-side slug, no DB FK).
-- barcode_format stores the encoding needed to render the barcode correctly.
-- Offline-first: every gift_cards row carries updated_at, synced_at, client_id, is_deleted.
-- Auto-archive: when balance reaches 0 the service sets is_archived = TRUE.
-- Transactions: every balance change (spend, reload, manual update) records a row in
--   gift_card_transactions with before/after balance for a full audit trail.

CREATE TABLE IF NOT EXISTS gift_cards (
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
  pin                  TEXT,
  balance              NUMERIC(12,2) NOT NULL DEFAULT 0,
  expiry_date          DATE,
  notes                TEXT,
  is_archived          BOOLEAN      NOT NULL DEFAULT FALSE,
  -- Sync
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  synced_at            TIMESTAMPTZ,
  client_id            TEXT,
  is_deleted           BOOLEAN      NOT NULL DEFAULT FALSE,
  -- Test isolation
  is_test_data         BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_gift_cards_household   ON gift_cards(household_id);
CREATE INDEX IF NOT EXISTS idx_gift_cards_deleted     ON gift_cards(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_gift_cards_archived    ON gift_cards(is_archived);

-- Gift card transaction history.
-- type:
--   'balance_update' — manual balance set (note only, no transaction date required)
--   'spend'          — debit from card (requires amount, date)
--   'reload'         — credit to card (requires amount, date)
-- expense_id is set when the user elects to add the spend as a personal expense.

CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id     UUID          NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
  user_id          UUID          REFERENCES users(id) ON DELETE SET NULL,
  type             TEXT          NOT NULL
                     CHECK (type IN ('balance_update','spend','reload')),
  amount           NUMERIC(12,2) NOT NULL,
  balance_before   NUMERIC(12,2) NOT NULL,
  balance_after    NUMERIC(12,2) NOT NULL,
  transaction_date TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  location         TEXT,
  description      TEXT,
  expense_id       UUID,
  -- Test isolation
  is_test_data     BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gc_txn_gift_card ON gift_card_transactions(gift_card_id);
CREATE INDEX IF NOT EXISTS idx_gc_txn_date      ON gift_card_transactions(transaction_date DESC);
