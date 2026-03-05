/**
 * Migration 014 — Analytics Events
 *
 * Stores behavioural analytics events emitted by all clients (web, mobile, tablet).
 * No PII is stored here — the service layer strips sensitive fields before insert.
 *
 * Columns:
 *   user_id      — linked user (SET NULL on delete so history is retained)
 *   session_id   — client-generated anonymous session UUID (not tied to user identity)
 *   event_type   — dot-separated action name e.g. 'expense.added', 'auth.login'
 *   properties   — non-PII JSONB payload (amounts, dates, brand IDs, boolean flags)
 *   platform     — originating client
 *   app_version  — optional semver string for version-cohort analysis
 *   occurred_at  — client-side timestamp (may differ slightly from received_at)
 *   received_at  — server-side ingestion time
 *   is_test_data — excluded from real metrics and analytics dashboards
 */

CREATE TABLE analytics_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  session_id   TEXT        NOT NULL,
  event_type   TEXT        NOT NULL,
  properties   JSONB       NOT NULL DEFAULT '{}',
  platform     TEXT        NOT NULL CHECK (platform IN ('web', 'mobile', 'tablet')),
  app_version  TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_test_data BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_analytics_user    ON analytics_events(user_id);
CREATE INDEX idx_analytics_type    ON analytics_events(event_type);
CREATE INDEX idx_analytics_date    ON analytics_events(occurred_at DESC);
CREATE INDEX idx_analytics_test    ON analytics_events(is_test_data) WHERE is_test_data = FALSE;
CREATE INDEX idx_analytics_session ON analytics_events(session_id);
