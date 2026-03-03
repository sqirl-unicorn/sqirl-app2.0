-- Migration 007: Shopping lists and To-Do lists
--
-- Three list types: 'general' | 'grocery' | 'todo'
-- Lists are scoped to a household (shared) or to an individual user (personal).
-- Sync columns (updated_at, synced_at, client_id, is_deleted) enable offline-first
-- behaviour on all clients.
--
-- General + Grocery lists:
--   Items have description (required), pack_size, unit, quantity, is_purchased.
--   Purchased items are displayed in a separate "purchased" section with strikethrough.
--   Items have a position for manual reordering.
--
-- To-Do lists:
--   Tasks + subtasks; both have optional due dates.
--   Subtask due date must not exceed task due date (enforced at service layer).
--   Task progress is either auto-computed from subtasks or manually overridden.

-- ── Lists ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lists (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   UUID         REFERENCES households(id) ON DELETE CASCADE,
  owner_user_id  UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT         NOT NULL,
  list_type      TEXT         NOT NULL CHECK (list_type IN ('general', 'grocery', 'todo')),
  -- Sync
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  synced_at      TIMESTAMPTZ,
  client_id      TEXT,
  is_deleted     BOOLEAN      NOT NULL DEFAULT FALSE,
  -- Test isolation
  is_test_data   BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_lists_household  ON lists(household_id)  WHERE household_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lists_owner      ON lists(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_lists_type       ON lists(list_type);
CREATE INDEX IF NOT EXISTS idx_lists_deleted    ON lists(is_deleted) WHERE is_deleted = FALSE;

-- ── List items (General + Grocery) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS list_items (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id         UUID         NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  description     TEXT         NOT NULL,
  pack_size       TEXT,
  unit            TEXT,
  quantity        DECIMAL(10,3),
  is_purchased    BOOLEAN      NOT NULL DEFAULT FALSE,
  position        INTEGER      NOT NULL DEFAULT 0,
  added_by_user_id UUID        REFERENCES users(id) ON DELETE SET NULL,
  -- Sync
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  client_id       TEXT,
  is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
  -- Test isolation
  is_test_data    BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_list_items_list    ON list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_list_items_deleted ON list_items(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_list_items_pos     ON list_items(list_id, position);
