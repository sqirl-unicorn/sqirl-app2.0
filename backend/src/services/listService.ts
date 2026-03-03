/**
 * List Service — CRUD for shopping lists, list items, todo tasks, and subtasks.
 *
 * Lists are scoped to a household (shared) or individual user (personal).
 * When a user belongs to a household, new lists are automatically linked to
 * that household so all members can view and edit them.
 *
 * Offline-first sync: every mutable row carries updated_at, synced_at,
 * client_id, and is_deleted (soft-delete).
 *
 * Pure helper exports (for unit tests):
 *   computeProgress(subtasks)            → 0-100 integer
 *   validateSubtaskDueDate(s, t)         → boolean
 *   canAccessList(userId, hhId, list)    → boolean
 *
 * Error codes:
 *   SQIRL-LIST-ACCESS-001   List not found or user lacks access
 *   SQIRL-LIST-CREATE-001   Missing required name
 *   SQIRL-LIST-CREATE-002   Invalid list type
 *   SQIRL-LIST-ITEM-001     Item not found in list
 *   SQIRL-LIST-ITEM-002     Missing item description
 *   SQIRL-LIST-ITEM-003     Source and target list must be the same type
 *   SQIRL-LIST-MOVE-001     Target list not found or inaccessible
 *   SQIRL-LIST-TASK-001     Task not found in list
 *   SQIRL-LIST-TASK-002     Missing task title
 *   SQIRL-LIST-TASK-003     Progress must be 0–100
 *   SQIRL-LIST-SUB-001      Subtask not found
 *   SQIRL-LIST-SUB-002      Missing subtask title
 *   SQIRL-LIST-SUB-003      Subtask due date cannot exceed task due date
 *   SQIRL-LIST-SERVER-001   Unexpected server error
 */

import { pool } from '../db';

// ── Row types (snake_case — DB layer) ─────────────────────────────────────────

export interface ListRow {
  id: string;
  household_id: string | null;
  owner_user_id: string;
  name: string;
  list_type: 'general' | 'grocery' | 'todo';
  updated_at: string;
  synced_at: string | null;
  client_id: string | null;
  is_deleted: boolean;
  is_test_data: boolean;
}

export interface ListItemRow {
  id: string;
  list_id: string;
  description: string;
  pack_size: string | null;
  unit: string | null;
  quantity: string | null; // DECIMAL returns string from pg
  is_purchased: boolean;
  position: number;
  added_by_user_id: string | null;
  updated_at: string;
  synced_at: string | null;
  client_id: string | null;
  is_deleted: boolean;
  is_test_data: boolean;
}

export interface TodoTaskRow {
  id: string;
  list_id: string;
  title: string;
  due_date: string | null;
  is_completed: boolean;
  manual_progress: number | null;
  use_manual_progress: boolean;
  position: number;
  added_by_user_id: string | null;
  updated_at: string;
  synced_at: string | null;
  client_id: string | null;
  is_deleted: boolean;
  is_test_data: boolean;
}

export interface TodoSubtaskRow {
  id: string;
  task_id: string;
  title: string;
  due_date: string | null;
  is_completed: boolean;
  position: number;
  added_by_user_id: string | null;
  updated_at: string;
  synced_at: string | null;
  client_id: string | null;
  is_deleted: boolean;
  is_test_data: boolean;
}

// ── camelCase API shapes ───────────────────────────────────────────────────────

export interface ListApiShape {
  id: string;
  householdId: string | null;
  ownerUserId: string;
  name: string;
  listType: string;
  updatedAt: string;
  isDeleted: boolean;
  clientId: string | null;
}

export interface ListItemApiShape {
  id: string;
  listId: string;
  description: string;
  packSize: string | null;
  unit: string | null;
  quantity: number | null;
  isPurchased: boolean;
  position: number;
  addedByUserId: string | null;
  updatedAt: string;
  isDeleted: boolean;
  clientId: string | null;
}

export interface SubtaskApiShape {
  id: string;
  taskId: string;
  title: string;
  dueDate: string | null;
  isCompleted: boolean;
  position: number;
  addedByUserId: string | null;
  updatedAt: string;
  isDeleted: boolean;
  clientId: string | null;
}

export interface TaskApiShape {
  id: string;
  listId: string;
  title: string;
  dueDate: string | null;
  isCompleted: boolean;
  manualProgress: number | null;
  useManualProgress: boolean;
  progress: number;
  position: number;
  addedByUserId: string | null;
  updatedAt: string;
  isDeleted: boolean;
  clientId: string | null;
  subtasks: SubtaskApiShape[];
}

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Compute task progress as an integer 0–100 based on completed subtask ratio.
 * Returns 0 when there are no subtasks.
 *
 * @param subtasks - Array of objects with is_completed boolean
 * @returns Integer progress percentage
 */
export function computeProgress(subtasks: { is_completed: boolean }[]): number {
  if (subtasks.length === 0) return 0;
  const completed = subtasks.filter(s => s.is_completed).length;
  return Math.floor((completed / subtasks.length) * 100);
}

/**
 * Validate that a subtask due date does not exceed the parent task's due date.
 * If either date is null the constraint is waived.
 *
 * @param subtaskDueDate - ISO date string or null
 * @param taskDueDate    - ISO date string or null
 * @returns true if the dates are compatible
 */
export function validateSubtaskDueDate(
  subtaskDueDate: string | null,
  taskDueDate: string | null
): boolean {
  if (!subtaskDueDate || !taskDueDate) return true;
  return subtaskDueDate <= taskDueDate;
}

/**
 * Check whether a user may read/write a list.
 * Access is granted if the user owns the list OR if the list belongs to the
 * user's current household.
 *
 * @param userId      - The requesting user's ID
 * @param householdId - The user's household ID (null = no household)
 * @param list        - The list DB row
 * @returns true if the user may access the list
 */
export function canAccessList(
  userId: string,
  householdId: string | null,
  list: ListRow
): boolean {
  if (list.owner_user_id === userId) return true;
  if (list.household_id && householdId && list.household_id === householdId) return true;
  return false;
}

// ── Row → API shape converters ────────────────────────────────────────────────

function rowToList(row: ListRow): ListApiShape {
  return {
    id: row.id,
    householdId: row.household_id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    listType: row.list_type,
    updatedAt: row.updated_at,
    isDeleted: row.is_deleted,
    clientId: row.client_id,
  };
}

function rowToItem(row: ListItemRow): ListItemApiShape {
  return {
    id: row.id,
    listId: row.list_id,
    description: row.description,
    packSize: row.pack_size,
    unit: row.unit,
    quantity: row.quantity !== null ? Number(row.quantity) : null,
    isPurchased: row.is_purchased,
    position: row.position,
    addedByUserId: row.added_by_user_id,
    updatedAt: row.updated_at,
    isDeleted: row.is_deleted,
    clientId: row.client_id,
  };
}

function rowToSubtask(row: TodoSubtaskRow): SubtaskApiShape {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    dueDate: row.due_date,
    isCompleted: row.is_completed,
    position: row.position,
    addedByUserId: row.added_by_user_id,
    updatedAt: row.updated_at,
    isDeleted: row.is_deleted,
    clientId: row.client_id,
  };
}

function rowToTask(row: TodoTaskRow, subtasks: TodoSubtaskRow[]): TaskApiShape {
  const progress = row.use_manual_progress
    ? (row.manual_progress ?? 0)
    : computeProgress(subtasks);
  return {
    id: row.id,
    listId: row.list_id,
    title: row.title,
    dueDate: row.due_date,
    isCompleted: row.is_completed,
    manualProgress: row.manual_progress,
    useManualProgress: row.use_manual_progress,
    progress,
    position: row.position,
    addedByUserId: row.added_by_user_id,
    updatedAt: row.updated_at,
    isDeleted: row.is_deleted,
    clientId: row.client_id,
    subtasks: subtasks.map(rowToSubtask),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch a user's current household ID (null if not a member). */
async function getUserHouseholdId(userId: string): Promise<string | null> {
  const res = await pool.query<{ household_id: string }>(
    `SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return res.rows[0]?.household_id ?? null;
}

/**
 * Fetch a list row by ID and verify the requesting user has access.
 * Throws SQIRL-LIST-ACCESS-001 if the list is not found or user lacks access.
 */
async function requireList(listId: string, userId: string): Promise<ListRow> {
  const res = await pool.query<ListRow>(
    `SELECT * FROM lists WHERE id = $1 AND is_deleted = false`,
    [listId]
  );
  const list = res.rows[0];
  if (!list) throw new Error('SQIRL-LIST-ACCESS-001');

  const hhId = await getUserHouseholdId(userId);
  if (!canAccessList(userId, hhId, list)) throw new Error('SQIRL-LIST-ACCESS-001');
  return list;
}

// ── Lists CRUD ────────────────────────────────────────────────────────────────

const VALID_TYPES = ['general', 'grocery', 'todo'] as const;

/**
 * Create a new list. If the user is in a household, the list is automatically
 * linked to that household so all members can see it.
 */
export async function createList(
  userId: string,
  name: string,
  listType: string,
  clientId: string | null,
  isTest: boolean
): Promise<ListApiShape> {
  if (!name?.trim()) throw new Error('SQIRL-LIST-CREATE-001');
  if (!VALID_TYPES.includes(listType as (typeof VALID_TYPES)[number])) {
    throw new Error('SQIRL-LIST-CREATE-002');
  }

  const householdId = await getUserHouseholdId(userId);

  const res = await pool.query<ListRow>(
    `INSERT INTO lists (household_id, owner_user_id, name, list_type, client_id, is_test_data)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [householdId, userId, name.trim(), listType, clientId, isTest]
  );
  return rowToList(res.rows[0]);
}

/**
 * Get all non-deleted lists visible to a user: their personal lists plus all
 * lists belonging to their household.
 */
export async function getLists(userId: string): Promise<ListApiShape[]> {
  const householdId = await getUserHouseholdId(userId);

  const res = await pool.query<ListRow>(
    `SELECT * FROM lists
     WHERE is_deleted = false
       AND (owner_user_id = $1
            OR (household_id IS NOT NULL AND household_id = $2))
     ORDER BY updated_at DESC`,
    [userId, householdId]
  );
  return res.rows.map(rowToList);
}

/**
 * Rename a list. Only accessible users may rename.
 */
export async function renameList(
  listId: string,
  userId: string,
  name: string
): Promise<ListApiShape> {
  if (!name?.trim()) throw new Error('SQIRL-LIST-CREATE-001');
  await requireList(listId, userId);

  const res = await pool.query<ListRow>(
    `UPDATE lists SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [name.trim(), listId]
  );
  return rowToList(res.rows[0]);
}

/**
 * Soft-delete a list (and cascade-deletes items/tasks via DB ON DELETE CASCADE).
 */
export async function deleteList(listId: string, userId: string): Promise<void> {
  await requireList(listId, userId);
  await pool.query(
    `UPDATE lists SET is_deleted = true, updated_at = NOW() WHERE id = $1`,
    [listId]
  );
}

// ── List items ────────────────────────────────────────────────────────────────

/**
 * Get all non-deleted items for a list, ordered by purchased status then position.
 * Unpurchased items come first; purchased items follow (for the "purchased" section).
 */
export async function getItems(listId: string, userId: string): Promise<ListItemApiShape[]> {
  await requireList(listId, userId);

  const res = await pool.query<ListItemRow>(
    `SELECT * FROM list_items
     WHERE list_id = $1 AND is_deleted = false
     ORDER BY is_purchased ASC, position ASC`,
    [listId]
  );
  return res.rows.map(rowToItem);
}

/**
 * Add a new item to a list.
 */
export async function addItem(
  listId: string,
  userId: string,
  description: string,
  packSize: string | null,
  unit: string | null,
  quantity: number | null,
  clientId: string | null,
  isTest: boolean
): Promise<ListItemApiShape> {
  if (!description?.trim()) throw new Error('SQIRL-LIST-ITEM-002');
  await requireList(listId, userId);

  // Place at end of existing items
  const posRes = await pool.query<{ max: number }>(
    `SELECT COALESCE(MAX(position), -1) AS max FROM list_items
     WHERE list_id = $1 AND is_deleted = false`,
    [listId]
  );
  const position = (posRes.rows[0]?.max ?? -1) + 1;

  const res = await pool.query<ListItemRow>(
    `INSERT INTO list_items
       (list_id, description, pack_size, unit, quantity, position,
        added_by_user_id, client_id, is_test_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [listId, description.trim(), packSize, unit, quantity, position, userId, clientId, isTest]
  );
  return rowToItem(res.rows[0]);
}

/**
 * Update an existing item. Partial update — only provided fields are changed.
 */
export async function updateItem(
  listId: string,
  itemId: string,
  userId: string,
  fields: {
    description?: string;
    packSize?: string | null;
    unit?: string | null;
    quantity?: number | null;
    isPurchased?: boolean;
    position?: number;
  }
): Promise<ListItemApiShape> {
  await requireList(listId, userId);

  const itemRes = await pool.query<ListItemRow>(
    `SELECT * FROM list_items WHERE id = $1 AND list_id = $2 AND is_deleted = false`,
    [itemId, listId]
  );
  if (!itemRes.rows[0]) throw new Error('SQIRL-LIST-ITEM-001');

  const { description, packSize, unit, quantity, isPurchased, position } = fields;
  const res = await pool.query<ListItemRow>(
    `UPDATE list_items SET
       description  = COALESCE($1, description),
       pack_size    = CASE WHEN $2::boolean THEN $3 ELSE pack_size END,
       unit         = CASE WHEN $4::boolean THEN $5 ELSE unit END,
       quantity     = CASE WHEN $6::boolean THEN $7 ELSE quantity END,
       is_purchased = COALESCE($8, is_purchased),
       position     = COALESCE($9, position),
       updated_at   = NOW()
     WHERE id = $10
     RETURNING *`,
    [
      description?.trim() ?? null,
      'packSize' in fields, packSize,
      'unit' in fields, unit,
      'quantity' in fields, quantity,
      isPurchased ?? null,
      position ?? null,
      itemId,
    ]
  );
  return rowToItem(res.rows[0]);
}

/**
 * Soft-delete an item.
 */
export async function deleteItem(listId: string, itemId: string, userId: string): Promise<void> {
  await requireList(listId, userId);

  const itemRes = await pool.query(
    `SELECT id FROM list_items WHERE id = $1 AND list_id = $2 AND is_deleted = false`,
    [itemId, listId]
  );
  if (!itemRes.rows[0]) throw new Error('SQIRL-LIST-ITEM-001');

  await pool.query(
    `UPDATE list_items SET is_deleted = true, updated_at = NOW() WHERE id = $1`,
    [itemId]
  );
}

/**
 * Move an item from its current list to a target list of the same type.
 */
export async function moveItem(
  itemId: string,
  targetListId: string,
  userId: string
): Promise<ListItemApiShape> {
  const itemRes = await pool.query<ListItemRow>(
    `SELECT * FROM list_items WHERE id = $1 AND is_deleted = false`,
    [itemId]
  );
  const item = itemRes.rows[0];
  if (!item) throw new Error('SQIRL-LIST-ITEM-001');

  // Verify access to source list
  const sourceList = await requireList(item.list_id, userId);

  // Verify access to target list and that types match
  const targetRes = await pool.query<ListRow>(
    `SELECT * FROM lists WHERE id = $1 AND is_deleted = false`,
    [targetListId]
  );
  const targetList = targetRes.rows[0];
  if (!targetList) throw new Error('SQIRL-LIST-MOVE-001');

  const hhId = await getUserHouseholdId(userId);
  if (!canAccessList(userId, hhId, targetList)) throw new Error('SQIRL-LIST-MOVE-001');
  if (targetList.list_type !== sourceList.list_type) throw new Error('SQIRL-LIST-ITEM-003');

  // Place at end of target list
  const posRes = await pool.query<{ max: number }>(
    `SELECT COALESCE(MAX(position), -1) AS max FROM list_items
     WHERE list_id = $1 AND is_deleted = false`,
    [targetListId]
  );
  const position = (posRes.rows[0]?.max ?? -1) + 1;

  const res = await pool.query<ListItemRow>(
    `UPDATE list_items SET list_id = $1, position = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [targetListId, position, itemId]
  );
  return rowToItem(res.rows[0]);
}

// ── Todo tasks ────────────────────────────────────────────────────────────────

/**
 * Get all non-deleted tasks for a todo list, including their subtasks.
 */
export async function getTasks(listId: string, userId: string): Promise<TaskApiShape[]> {
  await requireList(listId, userId);

  const taskRes = await pool.query<TodoTaskRow>(
    `SELECT * FROM todo_tasks
     WHERE list_id = $1 AND is_deleted = false
     ORDER BY position ASC`,
    [listId]
  );
  if (taskRes.rows.length === 0) return [];

  const taskIds = taskRes.rows.map(r => r.id);
  const subtaskRes = await pool.query<TodoSubtaskRow>(
    `SELECT * FROM todo_subtasks
     WHERE task_id = ANY($1) AND is_deleted = false
     ORDER BY position ASC`,
    [taskIds]
  );

  const subtasksByTask = new Map<string, TodoSubtaskRow[]>();
  for (const s of subtaskRes.rows) {
    if (!subtasksByTask.has(s.task_id)) subtasksByTask.set(s.task_id, []);
    subtasksByTask.get(s.task_id)!.push(s);
  }

  return taskRes.rows.map(t => rowToTask(t, subtasksByTask.get(t.id) ?? []));
}

/**
 * Add a new task to a todo list.
 */
export async function addTask(
  listId: string,
  userId: string,
  title: string,
  dueDate: string | null,
  clientId: string | null,
  isTest: boolean
): Promise<TaskApiShape> {
  if (!title?.trim()) throw new Error('SQIRL-LIST-TASK-002');
  await requireList(listId, userId);

  const posRes = await pool.query<{ max: number }>(
    `SELECT COALESCE(MAX(position), -1) AS max FROM todo_tasks
     WHERE list_id = $1 AND is_deleted = false`,
    [listId]
  );
  const position = (posRes.rows[0]?.max ?? -1) + 1;

  const res = await pool.query<TodoTaskRow>(
    `INSERT INTO todo_tasks (list_id, title, due_date, position, added_by_user_id, client_id, is_test_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [listId, title.trim(), dueDate, position, userId, clientId, isTest]
  );
  return rowToTask(res.rows[0], []);
}

/**
 * Update a task. Partial update — only provided fields are changed.
 * Validates manualProgress is 0–100.
 */
export async function updateTask(
  listId: string,
  taskId: string,
  userId: string,
  fields: {
    title?: string;
    dueDate?: string | null;
    isCompleted?: boolean;
    manualProgress?: number | null;
    useManualProgress?: boolean;
    position?: number;
  }
): Promise<TaskApiShape> {
  await requireList(listId, userId);

  const taskRes = await pool.query<TodoTaskRow>(
    `SELECT * FROM todo_tasks WHERE id = $1 AND list_id = $2 AND is_deleted = false`,
    [taskId, listId]
  );
  if (!taskRes.rows[0]) throw new Error('SQIRL-LIST-TASK-001');

  if (fields.manualProgress !== undefined && fields.manualProgress !== null) {
    if (fields.manualProgress < 0 || fields.manualProgress > 100) {
      throw new Error('SQIRL-LIST-TASK-003');
    }
  }

  const res = await pool.query<TodoTaskRow>(
    `UPDATE todo_tasks SET
       title              = COALESCE($1, title),
       due_date           = CASE WHEN $2::boolean THEN $3 ELSE due_date END,
       is_completed       = COALESCE($4, is_completed),
       manual_progress    = CASE WHEN $5::boolean THEN $6 ELSE manual_progress END,
       use_manual_progress = COALESCE($7, use_manual_progress),
       position           = COALESCE($8, position),
       updated_at         = NOW()
     WHERE id = $9
     RETURNING *`,
    [
      fields.title?.trim() ?? null,
      'dueDate' in fields, fields.dueDate,
      fields.isCompleted ?? null,
      'manualProgress' in fields, fields.manualProgress,
      fields.useManualProgress ?? null,
      fields.position ?? null,
      taskId,
    ]
  );

  // Re-fetch subtasks to compute progress
  const subtaskRes = await pool.query<TodoSubtaskRow>(
    `SELECT * FROM todo_subtasks WHERE task_id = $1 AND is_deleted = false ORDER BY position ASC`,
    [taskId]
  );
  return rowToTask(res.rows[0], subtaskRes.rows);
}

/**
 * Soft-delete a task and its subtasks.
 */
export async function deleteTask(listId: string, taskId: string, userId: string): Promise<void> {
  await requireList(listId, userId);

  const taskRes = await pool.query(
    `SELECT id FROM todo_tasks WHERE id = $1 AND list_id = $2 AND is_deleted = false`,
    [taskId, listId]
  );
  if (!taskRes.rows[0]) throw new Error('SQIRL-LIST-TASK-001');

  await pool.query(
    `UPDATE todo_subtasks SET is_deleted = true, updated_at = NOW() WHERE task_id = $1`,
    [taskId]
  );
  await pool.query(
    `UPDATE todo_tasks SET is_deleted = true, updated_at = NOW() WHERE id = $1`,
    [taskId]
  );
}

// ── Todo subtasks ─────────────────────────────────────────────────────────────

/**
 * Add a subtask to a task. Validates due date against task due date.
 */
export async function addSubtask(
  listId: string,
  taskId: string,
  userId: string,
  title: string,
  dueDate: string | null,
  clientId: string | null,
  isTest: boolean
): Promise<SubtaskApiShape> {
  if (!title?.trim()) throw new Error('SQIRL-LIST-SUB-002');
  await requireList(listId, userId);

  const taskRes = await pool.query<TodoTaskRow>(
    `SELECT * FROM todo_tasks WHERE id = $1 AND list_id = $2 AND is_deleted = false`,
    [taskId, listId]
  );
  if (!taskRes.rows[0]) throw new Error('SQIRL-LIST-TASK-001');

  if (!validateSubtaskDueDate(dueDate, taskRes.rows[0].due_date)) {
    throw new Error('SQIRL-LIST-SUB-003');
  }

  const posRes = await pool.query<{ max: number }>(
    `SELECT COALESCE(MAX(position), -1) AS max FROM todo_subtasks
     WHERE task_id = $1 AND is_deleted = false`,
    [taskId]
  );
  const position = (posRes.rows[0]?.max ?? -1) + 1;

  const res = await pool.query<TodoSubtaskRow>(
    `INSERT INTO todo_subtasks (task_id, title, due_date, position, added_by_user_id, client_id, is_test_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [taskId, title.trim(), dueDate, position, userId, clientId, isTest]
  );
  return rowToSubtask(res.rows[0]);
}

/**
 * Update a subtask. Validates due date if task has one.
 */
export async function updateSubtask(
  listId: string,
  taskId: string,
  subtaskId: string,
  userId: string,
  fields: {
    title?: string;
    dueDate?: string | null;
    isCompleted?: boolean;
    position?: number;
  }
): Promise<SubtaskApiShape> {
  await requireList(listId, userId);

  const taskRes = await pool.query<TodoTaskRow>(
    `SELECT * FROM todo_tasks WHERE id = $1 AND list_id = $2 AND is_deleted = false`,
    [taskId, listId]
  );
  if (!taskRes.rows[0]) throw new Error('SQIRL-LIST-TASK-001');

  const subRes = await pool.query<TodoSubtaskRow>(
    `SELECT * FROM todo_subtasks WHERE id = $1 AND task_id = $2 AND is_deleted = false`,
    [subtaskId, taskId]
  );
  if (!subRes.rows[0]) throw new Error('SQIRL-LIST-SUB-001');

  const newDueDate = 'dueDate' in fields ? fields.dueDate : subRes.rows[0].due_date;
  if (!validateSubtaskDueDate(newDueDate ?? null, taskRes.rows[0].due_date)) {
    throw new Error('SQIRL-LIST-SUB-003');
  }

  const res = await pool.query<TodoSubtaskRow>(
    `UPDATE todo_subtasks SET
       title        = COALESCE($1, title),
       due_date     = CASE WHEN $2::boolean THEN $3 ELSE due_date END,
       is_completed = COALESCE($4, is_completed),
       position     = COALESCE($5, position),
       updated_at   = NOW()
     WHERE id = $6
     RETURNING *`,
    [
      fields.title?.trim() ?? null,
      'dueDate' in fields, fields.dueDate,
      fields.isCompleted ?? null,
      fields.position ?? null,
      subtaskId,
    ]
  );
  return rowToSubtask(res.rows[0]);
}

/**
 * Soft-delete a subtask.
 */
export async function deleteSubtask(
  listId: string,
  taskId: string,
  subtaskId: string,
  userId: string
): Promise<void> {
  await requireList(listId, userId);

  const subRes = await pool.query(
    `SELECT id FROM todo_subtasks WHERE id = $1 AND task_id = $2 AND is_deleted = false`,
    [subtaskId, taskId]
  );
  if (!subRes.rows[0]) throw new Error('SQIRL-LIST-SUB-001');

  await pool.query(
    `UPDATE todo_subtasks SET is_deleted = true, updated_at = NOW() WHERE id = $1`,
    [subtaskId]
  );
}
