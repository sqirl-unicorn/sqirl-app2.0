-- Migration 004: Household invitations
-- household_id is NULLABLE:
--   NULL  → "founding" invitation (household created on acceptance)
--   set   → invitation into an existing household
-- Default expiry: 7 days; inviter can choose 1–30 days at send time.
-- token is a unique slug for future deep-link / email support.

CREATE TABLE IF NOT EXISTS household_invitations (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID    REFERENCES households(id) ON DELETE CASCADE,  -- nullable for first invite
  inviter_id   UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_email TEXT,
  invitee_phone TEXT,
  token        TEXT    NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  status       TEXT    NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Test data isolation
  is_test_data BOOLEAN NOT NULL DEFAULT FALSE,
  -- At least one contact method required
  CONSTRAINT inv_email_or_phone CHECK (invitee_email IS NOT NULL OR invitee_phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_hi_household  ON household_invitations(household_id) WHERE household_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hi_inviter    ON household_invitations(inviter_id);
CREATE INDEX IF NOT EXISTS idx_hi_email      ON household_invitations(invitee_email) WHERE invitee_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hi_phone      ON household_invitations(invitee_phone) WHERE invitee_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hi_status     ON household_invitations(status);
CREATE INDEX IF NOT EXISTS idx_hi_expires    ON household_invitations(expires_at) WHERE status = 'pending';
