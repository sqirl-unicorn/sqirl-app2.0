/**
 * Migration 011 — Expense categories
 *
 * Three-level hierarchy: system (level 1, fixed) → household/personal (level 2-3, user-managed).
 * The 7 root categories are seeded with deterministic UUIDs so they can be referenced
 * in budgets and expenses without relying on name lookups.
 *
 * Scoping rules:
 *   scope='system'    — global, read-only, parent_id=NULL, level=1
 *   scope='household' — custom sub-cats under a household; only owners may manage
 *   scope='personal'  — custom sub-cats for a single user
 */

CREATE TABLE expense_categories (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id       UUID        REFERENCES expense_categories(id) ON DELETE CASCADE,
  household_id    UUID        REFERENCES households(id) ON DELETE CASCADE,
  owner_user_id   UUID        REFERENCES users(id) ON DELETE CASCADE,
  scope           TEXT        NOT NULL CHECK (scope IN ('system', 'household', 'personal')),
  name            TEXT        NOT NULL,
  level           INT         NOT NULL CHECK (level IN (1, 2, 3)),
  icon_name       TEXT,
  position        INT         NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  client_id       TEXT,
  is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
  is_test_data    BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_expense_categories_parent    ON expense_categories(parent_id);
CREATE INDEX idx_expense_categories_household ON expense_categories(household_id);
CREATE INDEX idx_expense_categories_owner     ON expense_categories(owner_user_id);
CREATE INDEX idx_expense_categories_deleted   ON expense_categories(is_deleted) WHERE is_deleted = FALSE;

-- ── Seed 7 fixed system categories (deterministic UUIDs, never deleted) ─────
INSERT INTO expense_categories (id, scope, name, level, icon_name, position) VALUES
  ('00000000-0000-ec00-0000-000000000001', 'system', 'Housing',                    1, 'Home',          1),
  ('00000000-0000-ec00-0000-000000000002', 'system', 'Education',                  1, 'GraduationCap', 2),
  ('00000000-0000-ec00-0000-000000000003', 'system', 'Transportation',             1, 'Car',           3),
  ('00000000-0000-ec00-0000-000000000004', 'system', 'Food',                       1, 'UtensilsCrossed', 4),
  ('00000000-0000-ec00-0000-000000000005', 'system', 'Health & Insurance',         1, 'HeartPulse',    5),
  ('00000000-0000-ec00-0000-000000000006', 'system', 'Lifestyle & Entertainment',  1, 'Tv',            6),
  ('00000000-0000-ec00-0000-000000000007', 'system', 'Personal Care & Clothing',   1, 'Shirt',         7);
