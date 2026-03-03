-- Migration 005: In-app notifications
-- Covers all household lifecycle events (invitation, membership changes,
-- role changes, copy requests, exit, deletion).
-- Additional channels (email, push) will extend this table or reference it.

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Event type (e.g. 'household_invitation_received', 'household_member_joined')
  type         TEXT    NOT NULL,
  title        TEXT    NOT NULL,
  message      TEXT    NOT NULL,
  -- Arbitrary payload for deep-linking / rendering (e.g. { householdId, invitationId })
  data         JSONB   DEFAULT NULL,
  read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Test data isolation
  is_test_data BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_notif_user       ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications(user_id) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notif_created    ON notifications(created_at DESC);
