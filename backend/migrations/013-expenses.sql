/**
 * Migration 013 — Expenses
 *
 * Unified expense table for both personal (household_id IS NULL) and
 * household (household_id IS NOT NULL) expenses.
 * Offline-first: carries updated_at, synced_at, client_id, is_deleted.
 *
 * Also wires the previously-placeholder FK on gift_card_transactions.expense_id
 * now that the expenses table exists.
 */

CREATE TABLE expenses (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID          REFERENCES households(id) ON DELETE CASCADE,
  owner_user_id UUID          REFERENCES users(id) ON DELETE SET NULL,
  category_id   UUID          REFERENCES expense_categories(id) ON DELETE SET NULL,
  amount        NUMERIC(12,2) NOT NULL,
  description   TEXT          NOT NULL,
  expense_date  DATE          NOT NULL,
  pack_size     NUMERIC(10,3),
  unit          TEXT,
  quantity      NUMERIC(10,3),
  business      TEXT,
  location      TEXT,
  notes         TEXT,
  is_deleted    BOOLEAN       NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  synced_at     TIMESTAMPTZ,
  client_id     TEXT,
  is_test_data  BOOLEAN       NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_expenses_household ON expenses(household_id);
CREATE INDEX idx_expenses_owner     ON expenses(owner_user_id);
CREATE INDEX idx_expenses_category  ON expenses(category_id);
CREATE INDEX idx_expenses_date      ON expenses(expense_date DESC);
CREATE INDEX idx_expenses_deleted   ON expenses(is_deleted) WHERE is_deleted = FALSE;

-- Wire the FK that gift_card_transactions.expense_id has been waiting for.
-- ON DELETE SET NULL keeps the transaction record when an expense is deleted.
ALTER TABLE gift_card_transactions
  ADD CONSTRAINT fk_gc_txn_expense
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL;
