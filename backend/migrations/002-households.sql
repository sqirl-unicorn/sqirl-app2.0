-- Migration 002: Households table + user profile extensions
-- Household is a first-class shared space, separate from groups.
-- Created on acceptance of the first invitation (not on send).
-- No circular FK: user→household membership is tracked via household_members,
-- so households can be deleted without touching users rows.
-- last_name is optional — used to name the household on creation.

-- ── Users table extensions ────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;

-- ── Households ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS households (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT    NOT NULL,
  -- Offline-sync fields
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Test data isolation
  is_test_data BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_households_updated   ON households(updated_at);
CREATE INDEX IF NOT EXISTS idx_households_test_data ON households(is_test_data) WHERE is_test_data = TRUE;
