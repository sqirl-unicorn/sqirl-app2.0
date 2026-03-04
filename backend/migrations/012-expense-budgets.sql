/**
 * Migration 012 — Expense budgets
 *
 * Monthly budget targets per category, per scope (personal or household).
 * budget_month is stored as the first day of the month (e.g. 2026-03-01).
 *
 * Uniqueness is enforced by two partial indexes (one per scope) so there
 * is exactly one budget row per category per month per scope-owner.
 *
 * Lazy carry-forward: when a month has no budgets, the service auto-copies
 * the previous month's budgets on the first GET for that month.
 */

CREATE TABLE expense_budgets (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   UUID         NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  household_id  UUID         REFERENCES households(id) ON DELETE CASCADE,
  owner_user_id UUID         REFERENCES users(id) ON DELETE CASCADE,
  scope         TEXT         NOT NULL CHECK (scope IN ('household', 'personal')),
  budget_month  DATE         NOT NULL,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  is_test_data  BOOLEAN      NOT NULL DEFAULT FALSE
);

-- One budget per category per month per personal owner
CREATE UNIQUE INDEX idx_expense_budgets_uniq_personal
  ON expense_budgets(category_id, budget_month, owner_user_id)
  WHERE scope = 'personal';

-- One budget per category per month per household
CREATE UNIQUE INDEX idx_expense_budgets_uniq_household
  ON expense_budgets(category_id, budget_month, household_id)
  WHERE scope = 'household';

CREATE INDEX idx_expense_budgets_category  ON expense_budgets(category_id);
CREATE INDEX idx_expense_budgets_household ON expense_budgets(household_id, budget_month);
CREATE INDEX idx_expense_budgets_owner     ON expense_budgets(owner_user_id, budget_month);
