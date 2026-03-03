-- Migration 008: To-Do tasks and subtasks
--
-- Tasks belong to a list (type='todo').
-- Subtasks belong to a task.
-- Subtask due_date must not exceed task due_date (enforced at service layer).
-- Task progress: computed automatically from subtasks completed/total unless
--   use_manual_progress=true, in which case manual_progress (0–100) is used.

-- ── Todo tasks ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS todo_tasks (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id              UUID         NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  title                TEXT         NOT NULL,
  due_date             DATE,
  is_completed         BOOLEAN      NOT NULL DEFAULT FALSE,
  manual_progress      INTEGER      CHECK (manual_progress BETWEEN 0 AND 100),
  use_manual_progress  BOOLEAN      NOT NULL DEFAULT FALSE,
  position             INTEGER      NOT NULL DEFAULT 0,
  added_by_user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
  -- Sync
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  synced_at            TIMESTAMPTZ,
  client_id            TEXT,
  is_deleted           BOOLEAN      NOT NULL DEFAULT FALSE,
  -- Test isolation
  is_test_data         BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_todo_tasks_list    ON todo_tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_todo_tasks_deleted ON todo_tasks(is_deleted) WHERE is_deleted = FALSE;

-- ── Todo subtasks ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS todo_subtasks (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID         NOT NULL REFERENCES todo_tasks(id) ON DELETE CASCADE,
  title            TEXT         NOT NULL,
  due_date         DATE,
  is_completed     BOOLEAN      NOT NULL DEFAULT FALSE,
  position         INTEGER      NOT NULL DEFAULT 0,
  added_by_user_id UUID         REFERENCES users(id) ON DELETE SET NULL,
  -- Sync
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  synced_at        TIMESTAMPTZ,
  client_id        TEXT,
  is_deleted       BOOLEAN      NOT NULL DEFAULT FALSE,
  -- Test isolation
  is_test_data     BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_todo_subtasks_task    ON todo_subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_todo_subtasks_deleted ON todo_subtasks(is_deleted) WHERE is_deleted = FALSE;
