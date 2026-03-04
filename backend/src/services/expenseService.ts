/**
 * Expense Service — categories, budgets, and expense CRUD with move support.
 *
 * Scoping model:
 *   personal  — expenses owned by a single user (household_id IS NULL)
 *   household — expenses shared across all household members
 *
 * Category hierarchy:
 *   Level 1 — 7 fixed system categories (scope='system', read-only)
 *   Level 2 — user/household sub-categories under a system category
 *   Level 3 — user/household sub-categories under a level-2 category
 *   Maximum depth is 3. System categories cannot be edited or deleted.
 *
 * Budget carry-forward:
 *   On the first GET for a new month, the service auto-copies the previous
 *   month's budgets atomically so the user starts with last month's targets.
 *
 * Move semantics:
 *   moveExpense deletes the expense from its source scope and re-inserts it
 *   under the target scope. If the category does not exist in the target scope,
 *   the caller must first resolve via checkCategoryConflict and supply
 *   targetCategoryId. HH→personal moves require the actor to be a household owner
 *   (enforced in the route layer, not here).
 *
 * Pure helper exports (for unit tests):
 *   SYSTEM_CATEGORY_IDS              — frozen set of system UUID strings
 *   isCategorySystem(id)             → boolean
 *   canManageHouseholdCategory(role) → boolean
 *   validateCategoryDepth(level)     → boolean
 *   buildCategoryTree(rows)          → ExpenseCategoryNode[]
 *   computeMonthFirstDay(yearMonth)  → Date
 *
 * Error codes:
 *   SQIRL-EXP-ACCESS-001   Expense not found or no access
 *   SQIRL-EXP-CREATE-001   Missing required fields
 *   SQIRL-EXP-CREATE-002   Amount must be positive
 *   SQIRL-EXP-CAT-001      Category not found
 *   SQIRL-EXP-CAT-002      Cannot modify or delete a system category
 *   SQIRL-EXP-CAT-003      Category depth limit reached (max 3 levels)
 *   SQIRL-EXP-CAT-004      Household owner required
 *   SQIRL-EXP-BUDGET-001   Budget month format invalid
 *   SQIRL-EXP-BUDGET-002   Budget amount must be non-negative
 *   SQIRL-EXP-MOVE-001     No household found
 *   SQIRL-EXP-MOVE-002     Category mismatch — targetCategoryId required
 *   SQIRL-EXP-SERVER-001   Unexpected server error
 */

import { pool } from '../db';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Deterministic UUIDs for the 7 seeded system categories (from migration 011). */
export const SYSTEM_CATEGORY_IDS: ReadonlySet<string> = new Set([
  '00000000-0000-ec00-0000-000000000001',
  '00000000-0000-ec00-0000-000000000002',
  '00000000-0000-ec00-0000-000000000003',
  '00000000-0000-ec00-0000-000000000004',
  '00000000-0000-ec00-0000-000000000005',
  '00000000-0000-ec00-0000-000000000006',
  '00000000-0000-ec00-0000-000000000007',
]);

// ── DB row types ──────────────────────────────────────────────────────────────

export interface ExpenseCategoryRow {
  id: string;
  parent_id: string | null;
  household_id: string | null;
  owner_user_id: string | null;
  scope: 'system' | 'household' | 'personal';
  name: string;
  level: 1 | 2 | 3;
  icon_name: string | null;
  position: number;
  updated_at: string;
  synced_at: string | null;
  client_id: string | null;
  is_deleted: boolean;
  is_test_data: boolean;
}

export interface ExpenseBudgetRow {
  id: string;
  category_id: string;
  household_id: string | null;
  owner_user_id: string | null;
  scope: 'household' | 'personal';
  budget_month: string;
  amount: string; // NUMERIC → string in PG
  updated_at: string;
  is_test_data: boolean;
}

export interface ExpenseRow {
  id: string;
  household_id: string | null;
  owner_user_id: string | null;
  category_id: string | null;
  amount: string; // NUMERIC → string in PG
  description: string;
  expense_date: string;
  pack_size: string | null;
  unit: string | null;
  quantity: string | null;
  business: string | null;
  location: string | null;
  notes: string | null;
  is_deleted: boolean;
  updated_at: string;
  synced_at: string | null;
  client_id: string | null;
  is_test_data: boolean;
}

export type ExpenseScope = 'personal' | 'household';

/** Tree node shape returned by buildCategoryTree — children nested inline. */
export interface ExpenseCategoryNode extends ExpenseCategoryRow {
  children: ExpenseCategoryNode[];
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Returns true when the category UUID is one of the 7 seeded system categories.
 * System categories are immutable — they cannot be edited, deleted, or re-parented.
 *
 * @param id - Category UUID string
 */
export function isCategorySystem(id: string): boolean {
  return SYSTEM_CATEGORY_IDS.has(id);
}

/**
 * Returns true when the role allows managing household-scoped categories.
 * Only 'owner' role may create/update/delete household sub-categories.
 *
 * @param role - The member's role in the household ('owner' | 'member')
 */
export function canManageHouseholdCategory(role: string): boolean {
  return role === 'owner';
}

/**
 * Returns true when a new sub-category at the given parent level is allowed.
 * The hierarchy cap is 3, so a parent at level 2 can have children (level 3),
 * but a parent at level 3 cannot (would be level 4).
 *
 * @param parentLevel - The level of the prospective parent category (1 | 2)
 */
export function validateCategoryDepth(parentLevel: number): boolean {
  return parentLevel < 3;
}

/**
 * Assembles a flat list of category rows into a nested tree.
 * System roots (level=1) are always at the top; non-system children
 * are nested under their parent. Only non-deleted rows are included.
 *
 * @param rows - Flat list from the DB query (any order)
 */
export function buildCategoryTree(rows: ExpenseCategoryRow[]): ExpenseCategoryNode[] {
  const byId = new Map<string, ExpenseCategoryNode>();
  for (const r of rows) {
    byId.set(r.id, { ...r, children: [] });
  }

  const roots: ExpenseCategoryNode[] = [];
  for (const node of byId.values()) {
    if (!node.parent_id) {
      roots.push(node);
    } else {
      const parent = byId.get(node.parent_id);
      if (parent) parent.children.push(node);
    }
  }

  // Sort each level by position
  const sortByPosition = (nodes: ExpenseCategoryNode[]): void => {
    nodes.sort((a, b) => a.position - b.position);
    for (const n of nodes) sortByPosition(n.children);
  };
  sortByPosition(roots);

  return roots;
}

/**
 * Parses a 'YYYY-MM' string and returns a Date set to the first of that month.
 * Throws a plain Error with errorCode SQIRL-EXP-BUDGET-001 for invalid input.
 *
 * @param yearMonth - e.g. '2026-03'
 */
export function computeMonthFirstDay(yearMonth: string): Date {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    const err = new Error('budgetMonth must be in YYYY-MM format');
    (err as Error & { errorCode: string }).errorCode = 'SQIRL-EXP-BUDGET-001';
    throw err;
  }
  const d = new Date(`${yearMonth}-01T00:00:00.000Z`);
  if (isNaN(d.getTime())) {
    const err = new Error('budgetMonth must be in YYYY-MM format');
    (err as Error & { errorCode: string }).errorCode = 'SQIRL-EXP-BUDGET-001';
    throw err;
  }
  return d;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Throw a typed error with an errorCode property. */
function throwErr(msg: string, code: string): never {
  const err = new Error(msg);
  (err as Error & { errorCode: string }).errorCode = code;
  throw err;
}

/** Fetch a category row by ID, throwing SQIRL-EXP-CAT-001 if missing. */
async function fetchCategory(categoryId: string): Promise<ExpenseCategoryRow> {
  const r = await pool.query<ExpenseCategoryRow>(
    `SELECT * FROM expense_categories WHERE id = $1`,
    [categoryId]
  );
  if (!r.rows[0]) throwErr('Category not found', 'SQIRL-EXP-CAT-001');
  return r.rows[0];
}

/** Fetch an expense row by ID, throwing SQIRL-EXP-ACCESS-001 if missing. */
async function fetchExpense(expenseId: string): Promise<ExpenseRow> {
  const r = await pool.query<ExpenseRow>(
    `SELECT * FROM expenses WHERE id = $1 AND is_deleted = FALSE`,
    [expenseId]
  );
  if (!r.rows[0]) throwErr('Expense not found or no access', 'SQIRL-EXP-ACCESS-001');
  return r.rows[0];
}

/**
 * Asserts the user may access the expense.
 * Personal expenses: must be owner_user_id.
 * Household expenses: must be a member of the expense's household.
 */
async function assertExpenseAccess(userId: string, expense: ExpenseRow): Promise<void> {
  if (expense.household_id === null) {
    if (expense.owner_user_id !== userId) {
      throwErr('Expense not found or no access', 'SQIRL-EXP-ACCESS-001');
    }
  } else {
    const r = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM household_members WHERE household_id = $1 AND user_id = $2`,
      [expense.household_id, userId]
    );
    if (!r.rows[0]) throwErr('Expense not found or no access', 'SQIRL-EXP-ACCESS-001');
  }
}

// ── Categories ────────────────────────────────────────────────────────────────

/**
 * Returns the full category tree for the given scope.
 * Always includes level-1 system categories as roots.
 * For 'personal': also includes the user's personal sub-categories.
 * For 'household': also includes the household's sub-categories.
 *
 * @param userId      - Authenticated user ID
 * @param scope       - 'personal' or 'household'
 * @param householdId - Required for household scope (caller resolves it)
 */
export async function getCategories(
  userId: string,
  scope: ExpenseScope,
  householdId?: string | null
): Promise<ExpenseCategoryNode[]> {
  let rows: ExpenseCategoryRow[];

  if (scope === 'personal') {
    const r = await pool.query<ExpenseCategoryRow>(
      `SELECT * FROM expense_categories
       WHERE is_deleted = FALSE
         AND (scope = 'system' OR (scope = 'personal' AND owner_user_id = $1))
       ORDER BY level ASC, position ASC`,
      [userId]
    );
    rows = r.rows;
  } else {
    if (!householdId) throwErr('No household found — cannot load household categories', 'SQIRL-EXP-MOVE-001');
    const r = await pool.query<ExpenseCategoryRow>(
      `SELECT * FROM expense_categories
       WHERE is_deleted = FALSE
         AND (scope = 'system' OR (scope = 'household' AND household_id = $1))
       ORDER BY level ASC, position ASC`,
      [householdId]
    );
    rows = r.rows;
  }

  return buildCategoryTree(rows);
}

/**
 * Creates a new sub-category under an existing parent.
 * Enforces: parent must exist, parent is not at level 3, scope must match.
 * For household scope, requires the user to be an owner (caller must enforce via route).
 *
 * @param userId      - Authenticated user ID
 * @param parentId    - UUID of the parent category (level 1 or 2)
 * @param name        - Display name for the new category
 * @param iconName    - Optional Lucide / Ionicons icon name
 * @param scope       - 'personal' or 'household'
 * @param householdId - Required for household scope
 * @param clientId    - Optional client-side ID for offline sync
 * @param isTest      - Whether this is test data
 */
export async function createCategory(
  userId: string,
  parentId: string,
  name: string,
  iconName: string | null,
  scope: ExpenseScope,
  householdId?: string | null,
  clientId?: string,
  isTest?: boolean
): Promise<ExpenseCategoryRow> {
  const parent = await fetchCategory(parentId);
  if (!validateCategoryDepth(parent.level)) {
    throwErr('Category depth limit reached (max 3 levels)', 'SQIRL-EXP-CAT-003');
  }

  const newLevel = (parent.level + 1) as 1 | 2 | 3;

  // Determine max position among siblings for auto-ordering
  const posRes = await pool.query<{ max: string | null }>(
    `SELECT MAX(position) AS max FROM expense_categories
     WHERE parent_id = $1 AND is_deleted = FALSE`,
    [parentId]
  );
  const position = posRes.rows[0]?.max != null ? Number(posRes.rows[0].max) + 1 : 0;

  const r = await pool.query<ExpenseCategoryRow>(
    `INSERT INTO expense_categories
       (parent_id, household_id, owner_user_id, scope, name, level, icon_name, position, client_id, is_test_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      parentId,
      scope === 'household' ? (householdId ?? null) : null,
      scope === 'personal' ? userId : null,
      scope,
      name,
      newLevel,
      iconName ?? null,
      position,
      clientId ?? null,
      isTest ?? false,
    ]
  );
  return r.rows[0];
}

/**
 * Updates the name and/or icon of a custom sub-category.
 * System categories are immutable — throws SQIRL-EXP-CAT-002.
 * Household categories require owner role (enforced in route).
 *
 * @param categoryId - UUID of the category to update
 * @param fields     - Fields to update (name, iconName)
 */
export async function updateCategory(
  categoryId: string,
  fields: { name?: string; iconName?: string | null }
): Promise<ExpenseCategoryRow> {
  if (isCategorySystem(categoryId)) {
    throwErr('Cannot modify a system category', 'SQIRL-EXP-CAT-002');
  }

  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let idx = 1;

  if (fields.name !== undefined)     { sets.push(`name = $${idx++}`);      params.push(fields.name); }
  if (fields.iconName !== undefined) { sets.push(`icon_name = $${idx++}`); params.push(fields.iconName); }

  params.push(categoryId);
  const r = await pool.query<ExpenseCategoryRow>(
    `UPDATE expense_categories SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  if (!r.rows[0]) throwErr('Category not found', 'SQIRL-EXP-CAT-001');
  return r.rows[0];
}

/**
 * Soft-deletes a custom sub-category (and cascades to its children via DB CASCADE).
 * System categories are immutable — throws SQIRL-EXP-CAT-002.
 *
 * @param categoryId - UUID of the category to delete
 */
export async function deleteCategory(categoryId: string): Promise<void> {
  if (isCategorySystem(categoryId)) {
    throwErr('Cannot delete a system category', 'SQIRL-EXP-CAT-002');
  }
  const r = await pool.query(
    `UPDATE expense_categories SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1`,
    [categoryId]
  );
  if (r.rowCount === 0) throwErr('Category not found', 'SQIRL-EXP-CAT-001');
}

// ── Budgets ───────────────────────────────────────────────────────────────────

/**
 * Returns budgets for the requested scope and month.
 * If no budgets exist for this month and previous-month budgets are present,
 * auto-carries them forward (lazy carry-forward) atomically.
 *
 * @param scope       - 'personal' or 'household'
 * @param userId      - Required for personal scope
 * @param householdId - Required for household scope
 * @param yearMonth   - 'YYYY-MM' string
 */
export async function getBudgets(
  scope: ExpenseScope,
  userId: string,
  householdId: string | null,
  yearMonth: string
): Promise<ExpenseBudgetRow[]> {
  const monthDate = computeMonthFirstDay(yearMonth);
  const monthStr = monthDate.toISOString().slice(0, 10); // YYYY-MM-DD

  // Compute the previous month's date string
  const prevDate = new Date(monthDate);
  prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
  const prevMonthStr = prevDate.toISOString().slice(0, 10);

  const scopeFilter =
    scope === 'personal'
      ? `scope = 'personal' AND owner_user_id = $1`
      : `scope = 'household' AND household_id = $1`;
  const scopeParam = scope === 'personal' ? userId : householdId;

  const existing = await pool.query<ExpenseBudgetRow>(
    `SELECT * FROM expense_budgets
     WHERE ${scopeFilter} AND budget_month = $2
     ORDER BY category_id`,
    [scopeParam, monthStr]
  );

  if (existing.rows.length > 0) return existing.rows;

  // Lazy carry-forward: check if previous month has budgets to copy
  const prev = await pool.query<ExpenseBudgetRow>(
    `SELECT * FROM expense_budgets
     WHERE ${scopeFilter} AND budget_month = $2`,
    [scopeParam, prevMonthStr]
  );

  if (prev.rows.length === 0) return [];

  // Atomically copy previous-month budgets to this month
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Re-check under lock to avoid duplicate inserts from concurrent requests
    const recheck = await client.query<ExpenseBudgetRow>(
      `SELECT id FROM expense_budgets
       WHERE ${scopeFilter} AND budget_month = $2 LIMIT 1`,
      [scopeParam, monthStr]
    );
    if (recheck.rows.length > 0) {
      await client.query('ROLLBACK');
      // Another request already carried forward — just return current data
      const all = await pool.query<ExpenseBudgetRow>(
        `SELECT * FROM expense_budgets WHERE ${scopeFilter} AND budget_month = $2`,
        [scopeParam, monthStr]
      );
      return all.rows;
    }

    const newRows: ExpenseBudgetRow[] = [];
    for (const b of prev.rows) {
      const ins = await client.query<ExpenseBudgetRow>(
        `INSERT INTO expense_budgets
           (category_id, household_id, owner_user_id, scope, budget_month, amount, is_test_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [
          b.category_id,
          b.household_id,
          b.owner_user_id,
          b.scope,
          monthStr,
          b.amount,
          b.is_test_data,
        ]
      );
      if (ins.rows[0]) newRows.push(ins.rows[0]);
    }
    await client.query('COMMIT');
    return newRows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Upserts a budget for a specific category + month + scope.
 * Throws SQIRL-EXP-BUDGET-002 if amount is negative.
 *
 * @param categoryId  - Category UUID
 * @param scope       - 'personal' or 'household'
 * @param userId      - Authenticated user ID
 * @param householdId - Required for household scope
 * @param yearMonth   - 'YYYY-MM' string
 * @param amount      - Non-negative budget amount
 * @param isTest      - Whether this is test data
 */
export async function setBudget(
  categoryId: string,
  scope: ExpenseScope,
  userId: string,
  householdId: string | null,
  yearMonth: string,
  amount: number,
  isTest?: boolean
): Promise<ExpenseBudgetRow> {
  if (amount < 0) throwErr('Budget amount must be non-negative', 'SQIRL-EXP-BUDGET-002');

  const monthDate = computeMonthFirstDay(yearMonth);
  const monthStr = monthDate.toISOString().slice(0, 10);

  const conflictCol = scope === 'personal' ? 'owner_user_id' : 'household_id';

  const r = await pool.query<ExpenseBudgetRow>(
    `INSERT INTO expense_budgets
       (category_id, household_id, owner_user_id, scope, budget_month, amount, is_test_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (category_id, budget_month, ${conflictCol})
       WHERE scope = $4
     DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW()
     RETURNING *`,
    [
      categoryId,
      scope === 'household' ? (householdId ?? null) : null,
      scope === 'personal' ? userId : null,
      scope,
      monthStr,
      amount,
      isTest ?? false,
    ]
  );
  return r.rows[0];
}

/**
 * Manually copies all budgets from fromMonth to toMonth for the given scope.
 * Skips categories that already have a budget in toMonth (no overwrite).
 * Returns the number of rows copied.
 *
 * @param scope       - 'personal' or 'household'
 * @param userId      - Authenticated user ID
 * @param householdId - Required for household scope
 * @param fromMonth   - 'YYYY-MM' source month
 * @param toMonth     - 'YYYY-MM' destination month
 */
export async function carryForwardBudgets(
  scope: ExpenseScope,
  userId: string,
  householdId: string | null,
  fromMonth: string,
  toMonth: string
): Promise<number> {
  const from = computeMonthFirstDay(fromMonth).toISOString().slice(0, 10);
  const to   = computeMonthFirstDay(toMonth).toISOString().slice(0, 10);

  const scopeFilter =
    scope === 'personal'
      ? `scope = 'personal' AND owner_user_id = $1`
      : `scope = 'household' AND household_id = $1`;
  const scopeParam = scope === 'personal' ? userId : householdId;

  const r = await pool.query<{ count: string }>(
    `WITH inserted AS (
       INSERT INTO expense_budgets
         (category_id, household_id, owner_user_id, scope, budget_month, amount, is_test_data)
       SELECT category_id, household_id, owner_user_id, scope, $2, amount, is_test_data
       FROM expense_budgets
       WHERE ${scopeFilter} AND budget_month = $3
       ON CONFLICT DO NOTHING
       RETURNING id
     )
     SELECT COUNT(*) AS count FROM inserted`,
    [scopeParam, to, from]
  );
  return Number(r.rows[0]?.count ?? 0);
}

// ── Expenses ──────────────────────────────────────────────────────────────────

/**
 * Returns all non-deleted expenses for the given scope and month.
 * Personal: returns only the user's own expenses.
 * Household: returns all household expenses for the month.
 *
 * @param userId      - Authenticated user ID
 * @param scope       - 'personal' or 'household'
 * @param householdId - Required for household scope
 * @param yearMonth   - 'YYYY-MM' string
 */
export async function getExpenses(
  userId: string,
  scope: ExpenseScope,
  householdId: string | null,
  yearMonth: string
): Promise<ExpenseRow[]> {
  const monthDate = computeMonthFirstDay(yearMonth);
  const monthStr = monthDate.toISOString().slice(0, 10); // YYYY-MM-DD (first of month)

  // Compute last day of month by going to first of next month minus 1 day
  const nextMonth = new Date(monthDate);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const lastDayStr = new Date(nextMonth.getTime() - 86400000).toISOString().slice(0, 10);

  if (scope === 'personal') {
    const r = await pool.query<ExpenseRow>(
      `SELECT * FROM expenses
       WHERE is_deleted = FALSE
         AND household_id IS NULL
         AND owner_user_id = $1
         AND expense_date BETWEEN $2 AND $3
       ORDER BY expense_date DESC, updated_at DESC`,
      [userId, monthStr, lastDayStr]
    );
    return r.rows;
  } else {
    if (!householdId) throwErr('No household found', 'SQIRL-EXP-MOVE-001');
    const r = await pool.query<ExpenseRow>(
      `SELECT * FROM expenses
       WHERE is_deleted = FALSE
         AND household_id = $1
         AND expense_date BETWEEN $2 AND $3
       ORDER BY expense_date DESC, updated_at DESC`,
      [householdId, monthStr, lastDayStr]
    );
    return r.rows;
  }
}

/**
 * Creates a new expense in the given scope.
 * For household scope, links the expense to the household.
 *
 * @param userId      - Authenticated user ID
 * @param scope       - 'personal' or 'household'
 * @param householdId - Required for household scope
 * @param payload     - Expense fields
 * @param isTest      - Whether this is test data
 */
export async function addExpense(
  userId: string,
  scope: ExpenseScope,
  householdId: string | null,
  payload: {
    categoryId: string;
    amount: number;
    description: string;
    expenseDate: string;
    packSize?: number | null;
    unit?: string | null;
    quantity?: number | null;
    business?: string | null;
    location?: string | null;
    notes?: string | null;
    clientId?: string;
  },
  isTest?: boolean
): Promise<ExpenseRow> {
  const r = await pool.query<ExpenseRow>(
    `INSERT INTO expenses
       (household_id, owner_user_id, category_id, amount, description, expense_date,
        pack_size, unit, quantity, business, location, notes, client_id, is_test_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      scope === 'household' ? (householdId ?? null) : null,
      userId,
      payload.categoryId,
      payload.amount,
      payload.description,
      payload.expenseDate,
      payload.packSize ?? null,
      payload.unit ?? null,
      payload.quantity ?? null,
      payload.business ?? null,
      payload.location ?? null,
      payload.notes ?? null,
      payload.clientId ?? null,
      isTest ?? false,
    ]
  );
  return r.rows[0];
}

/**
 * Updates mutable fields on an expense.
 * Throws SQIRL-EXP-ACCESS-001 if not found or inaccessible.
 *
 * @param expenseId - Expense UUID
 * @param userId    - Authenticated user ID
 * @param fields    - Partial update payload
 */
export async function updateExpense(
  expenseId: string,
  userId: string,
  fields: {
    categoryId?: string | null;
    amount?: number;
    description?: string;
    expenseDate?: string;
    packSize?: number | null;
    unit?: string | null;
    quantity?: number | null;
    business?: string | null;
    location?: string | null;
    notes?: string | null;
  }
): Promise<ExpenseRow> {
  const expense = await fetchExpense(expenseId);
  await assertExpenseAccess(userId, expense);

  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let idx = 1;

  if (fields.categoryId !== undefined)  { sets.push(`category_id  = $${idx++}`); params.push(fields.categoryId); }
  if (fields.amount !== undefined)      { sets.push(`amount       = $${idx++}`); params.push(fields.amount); }
  if (fields.description !== undefined) { sets.push(`description  = $${idx++}`); params.push(fields.description); }
  if (fields.expenseDate !== undefined) { sets.push(`expense_date = $${idx++}`); params.push(fields.expenseDate); }
  if (fields.packSize !== undefined)    { sets.push(`pack_size    = $${idx++}`); params.push(fields.packSize); }
  if (fields.unit !== undefined)        { sets.push(`unit         = $${idx++}`); params.push(fields.unit); }
  if (fields.quantity !== undefined)    { sets.push(`quantity     = $${idx++}`); params.push(fields.quantity); }
  if (fields.business !== undefined)    { sets.push(`business     = $${idx++}`); params.push(fields.business); }
  if (fields.location !== undefined)    { sets.push(`location     = $${idx++}`); params.push(fields.location); }
  if (fields.notes !== undefined)       { sets.push(`notes        = $${idx++}`); params.push(fields.notes); }

  params.push(expenseId);
  const r = await pool.query<ExpenseRow>(
    `UPDATE expenses SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return r.rows[0];
}

/**
 * Soft-deletes an expense the user can access.
 * Throws SQIRL-EXP-ACCESS-001 if not found or inaccessible.
 *
 * @param expenseId - Expense UUID
 * @param userId    - Authenticated user ID
 */
export async function deleteExpense(expenseId: string, userId: string): Promise<void> {
  const expense = await fetchExpense(expenseId);
  await assertExpenseAccess(userId, expense);
  await pool.query(
    `UPDATE expenses SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1`,
    [expenseId]
  );
}

/**
 * Checks whether moving an expense to the target scope requires a category remap.
 * A remap is needed when the expense's current category belongs exclusively to the
 * source scope (i.e. it's a personal or household custom category that doesn't exist
 * in the target scope). System categories (level=1) never need remapping.
 *
 * Returns suggested categories from the target scope to help the UI prompt the user.
 *
 * @param expenseId   - Expense UUID
 * @param userId      - Authenticated user ID
 * @param targetScope - The scope the user wants to move to
 * @param householdId - The user's household ID (null if no household)
 */
export async function checkCategoryConflict(
  expenseId: string,
  userId: string,
  targetScope: ExpenseScope,
  householdId: string | null
): Promise<{ needsRemap: boolean; suggestedCategories: ExpenseCategoryRow[] }> {
  const expense = await fetchExpense(expenseId);
  await assertExpenseAccess(userId, expense);

  if (!expense.category_id) return { needsRemap: false, suggestedCategories: [] };
  if (isCategorySystem(expense.category_id)) return { needsRemap: false, suggestedCategories: [] };

  // Category is custom — check if it exists in target scope
  const cat = await fetchCategory(expense.category_id);
  const targetScopeValue = targetScope;

  // If category already matches target scope, no remap needed
  if (cat.scope === targetScopeValue) return { needsRemap: false, suggestedCategories: [] };

  // Suggest categories in the target scope at same level under same parent
  const suggestRes = await pool.query<ExpenseCategoryRow>(
    `SELECT * FROM expense_categories
     WHERE is_deleted = FALSE
       AND scope = $1
       AND ($2::UUID IS NULL OR household_id = $2)
       AND ($3::UUID IS NULL OR owner_user_id = $3)
       AND level = $4
     ORDER BY position ASC
     LIMIT 20`,
    [
      targetScopeValue,
      targetScope === 'household' ? householdId : null,
      targetScope === 'personal' ? userId : null,
      cat.level,
    ]
  );

  return { needsRemap: true, suggestedCategories: suggestRes.rows };
}

/**
 * Moves an expense from its current scope to the target scope.
 * This is a destructive UPDATE (not a copy) — the expense's household_id and
 * owner_user_id are updated in-place, preserving its UUID and history.
 *
 * If the current category is incompatible with the target scope, targetCategoryId
 * must be supplied (use checkCategoryConflict to determine this).
 *
 * @param expenseId        - Expense UUID
 * @param userId           - Authenticated user ID (the actor performing the move)
 * @param targetScope      - Destination scope ('personal' | 'household')
 * @param targetHouseholdId - The household to move into (required for HH target)
 * @param targetCategoryId - Override category (required if checkCategoryConflict returns needsRemap=true)
 */
export async function moveExpense(
  expenseId: string,
  userId: string,
  targetScope: ExpenseScope,
  targetHouseholdId: string | null,
  targetCategoryId?: string | null
): Promise<ExpenseRow> {
  const expense = await fetchExpense(expenseId);
  await assertExpenseAccess(userId, expense);

  if (targetScope === 'household' && !targetHouseholdId) {
    throwErr('No household found — cannot move to household scope', 'SQIRL-EXP-MOVE-001');
  }

  // Determine the final category for the moved expense
  let finalCategoryId: string | null = expense.category_id;
  if (targetCategoryId !== undefined) {
    finalCategoryId = targetCategoryId;
  } else if (expense.category_id && !isCategorySystem(expense.category_id)) {
    // Custom category — verify it belongs to target scope; if not, throw
    const cat = await fetchCategory(expense.category_id);
    const needsRemap = cat.scope !== targetScope;
    if (needsRemap) {
      throwErr(
        'Category mismatch: provide targetCategoryId to remap this expense',
        'SQIRL-EXP-MOVE-002'
      );
    }
  }

  const r = await pool.query<ExpenseRow>(
    `UPDATE expenses
     SET household_id  = $1,
         owner_user_id = $2,
         category_id   = $3,
         updated_at    = NOW()
     WHERE id = $4
     RETURNING *`,
    [
      targetScope === 'household' ? targetHouseholdId : null,
      userId,
      finalCategoryId,
      expenseId,
    ]
  );
  return r.rows[0];
}
