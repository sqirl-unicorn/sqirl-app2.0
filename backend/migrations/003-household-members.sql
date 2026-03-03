-- Migration 003: Household members
-- Two roles: 'owner' | 'member'.
-- At least one owner must always remain (enforced at service layer).
-- Deleting a household cascades to remove all member rows.

CREATE TABLE IF NOT EXISTS household_members (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID    NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id      UUID    NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  role         TEXT    NOT NULL DEFAULT 'member'
                CHECK (role IN ('owner', 'member')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Test data isolation
  is_test_data BOOLEAN NOT NULL DEFAULT FALSE,
  -- One row per user per household
  CONSTRAINT uq_household_members UNIQUE (household_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hm_household ON household_members(household_id);
CREATE INDEX IF NOT EXISTS idx_hm_user      ON household_members(user_id);
