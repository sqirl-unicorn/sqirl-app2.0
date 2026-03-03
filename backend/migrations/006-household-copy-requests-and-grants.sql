-- Migration 006: Household copy requests and grants
--
-- Copy requests: async approval flow for "exit with copies".
--   - Member submits a copy request (status=pending)
--   - Any owner (or another owner if requester is owner) approves/denies
--   - First approval wins; member then exits
--   - Exiting without copies (voluntary) skips this flow entirely
--
-- Copy grants: audit record of what was actually copied to a departing member.
--   - household_id is stored as plain UUID (no FK) because the household
--     may be deleted before the grant record is read (e.g. last-member auto-delete).
--
-- copy_scope shape (JSONB):
--   { lists: 'all'|'none', giftCards: 'active_only'|'none',
--     loyaltyCards: 'all'|'none', expenses: '12months'|'none' }

-- ── Copy requests ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS household_copy_requests (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        UUID    NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  requester_user_id   UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_scope     JSONB   NOT NULL,
  status              TEXT    NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  reviewed_by_user_id UUID    REFERENCES users(id),
  approved_scope      JSONB,              -- null until approved (may be subset of requested_scope)
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_test_data        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_hcr_household  ON household_copy_requests(household_id);
CREATE INDEX IF NOT EXISTS idx_hcr_requester  ON household_copy_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_hcr_status     ON household_copy_requests(status) WHERE status = 'pending';

-- ── Copy grants ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS household_copy_grants (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored as TEXT (not FK) so deletion of household doesn't break audit trail
  household_id        UUID    NOT NULL,
  recipient_user_id   UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- NULL = auto-grant (last-member auto-delete scenario)
  granted_by_user_id  UUID    REFERENCES users(id),
  copy_scope          JSONB   NOT NULL DEFAULT '{}',
  granted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_test_data        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_hcg_recipient ON household_copy_grants(recipient_user_id);
