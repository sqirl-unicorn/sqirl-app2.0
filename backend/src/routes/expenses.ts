/**
 * Expenses routes — /api/v1/expenses
 *
 * All routes require authentication via the `authenticate` middleware.
 *
 * Category routes:
 *   GET    /categories          — full tree for ?scope=personal|household
 *   POST   /categories          — create a sub-category (level 2 or 3)
 *   PUT    /categories/:id      — rename / update icon
 *   DELETE /categories/:id      — soft-delete (cascade to children)
 *
 * Budget routes:
 *   GET    /budgets             — list budgets for ?scope&?month=YYYY-MM
 *   PUT    /budgets/:categoryId — upsert budget for a category+month
 *   POST   /budgets/carry-forward — manually carry budgets from one month to next
 *
 * Expense routes:
 *   GET    /                   — list expenses for ?scope&?month=YYYY-MM
 *   POST   /                   — create an expense
 *   PUT    /:id                — update an expense
 *   DELETE /:id                — soft-delete an expense
 *   GET    /:id/move-check     — check category conflict before move
 *   POST   /:id/move           — move expense to another scope
 *
 * Error codes:
 *   SQIRL-EXP-ACCESS-001   Expense not found or no access
 *   SQIRL-EXP-CREATE-001   Missing required fields
 *   SQIRL-EXP-CREATE-002   Amount must be positive
 *   SQIRL-EXP-CAT-001      Category not found
 *   SQIRL-EXP-CAT-002      Cannot modify or delete a system category
 *   SQIRL-EXP-CAT-003      Category depth limit reached
 *   SQIRL-EXP-CAT-004      Household owner required
 *   SQIRL-EXP-BUDGET-001   Budget month format invalid
 *   SQIRL-EXP-BUDGET-002   Budget amount must be non-negative
 *   SQIRL-EXP-MOVE-001     No household found
 *   SQIRL-EXP-MOVE-002     Category mismatch — targetCategoryId required
 *   SQIRL-EXP-MOVE-003     Only household owners can push HH→personal
 *   SQIRL-EXP-SERVER-001   Unexpected server error
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { pool } from '../db';
import { broadcast } from '../ws/wsServer';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getBudgets,
  setBudget,
  carryForwardBudgets,
  getExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  checkCategoryConflict,
  moveExpense,
  isCategorySystem,
  type ExpenseCategoryRow,
  type ExpenseBudgetRow,
  type ExpenseRow,
  type ExpenseScope,
  type ExpenseCategoryNode,
} from '../services/expenseService';

const router = Router();

/** Convert a snake_case category node to camelCase API shape (recursive). */
function categoryNodeToApi(node: ExpenseCategoryNode): unknown {
  return {
    id:          node.id,
    parentId:    node.parent_id,
    householdId: node.household_id,
    ownerUserId: node.owner_user_id,
    scope:       node.scope,
    name:        node.name,
    level:       node.level,
    iconName:    node.icon_name,
    position:    node.position,
    isDeleted:   node.is_deleted,
    children:    node.children.map(categoryNodeToApi),
  };
}

/** Convert a snake_case category row to camelCase API shape (flat). */
function categoryRowToApi(c: ExpenseCategoryRow) {
  return {
    id:          c.id,
    parentId:    c.parent_id,
    householdId: c.household_id,
    ownerUserId: c.owner_user_id,
    scope:       c.scope,
    name:        c.name,
    level:       c.level,
    iconName:    c.icon_name,
    position:    c.position,
    isDeleted:   c.is_deleted,
  };
}

/** Convert a snake_case budget row to camelCase API shape. */
function budgetToApi(b: ExpenseBudgetRow) {
  return {
    id:           b.id,
    categoryId:   b.category_id,
    householdId:  b.household_id,
    ownerUserId:  b.owner_user_id,
    scope:        b.scope,
    budgetMonth:  b.budget_month,
    amount:       Number(b.amount),
  };
}

/** Convert a snake_case expense row to camelCase API shape. */
function expenseToApi(e: ExpenseRow) {
  return {
    id:           e.id,
    householdId:  e.household_id,
    ownerUserId:  e.owner_user_id,
    categoryId:   e.category_id,
    amount:       Number(e.amount),
    description:  e.description,
    expenseDate:  e.expense_date,
    packSize:     e.pack_size  != null ? Number(e.pack_size)  : null,
    unit:         e.unit,
    quantity:     e.quantity   != null ? Number(e.quantity)   : null,
    business:     e.business,
    location:     e.location,
    notes:        e.notes,
    isDeleted:    e.is_deleted,
    updatedAt:    e.updated_at,
    syncedAt:     e.synced_at,
    clientId:     e.client_id,
  };
}

/** Typed service error. */
interface ServiceError extends Error {
  errorCode?: string;
}

/**
 * Resolves the user's household ID and role, or null.
 * Used by multiple routes that need to know the calling user's household context.
 */
async function resolveHousehold(
  userId: string
): Promise<{ householdId: string; role: string } | null> {
  const r = await pool.query<{ household_id: string; role: string }>(
    `SELECT household_id, role FROM household_members WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  if (!r.rows[0]) return null;
  return { householdId: r.rows[0].household_id, role: r.rows[0].role };
}

// ── GET /categories ───────────────────────────────────────────────────────────

router.get('/categories', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = (req.query.scope as string) === 'household' ? 'household' : 'personal';
    const userId = req.user!.userId;

    let householdId: string | null = null;
    if (scope === 'household') {
      const hh = await resolveHousehold(userId);
      if (!hh) {
        res.status(400).json({ error: 'No household found', errorCode: 'SQIRL-EXP-MOVE-001' });
        return;
      }
      householdId = hh.householdId;
    }

    const tree = await getCategories(userId, scope, householdId);
    res.json({ categories: tree.map(categoryNodeToApi) });
  } catch (err) {
    console.error('[SQIRL-EXP-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-EXP-SERVER-001' });
  }
});

// ── POST /categories ──────────────────────────────────────────────────────────

router.post('/categories', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { parentId, name, iconName, scope, clientId } = req.body as {
      parentId?: unknown;
      name?: unknown;
      iconName?: unknown;
      scope?: unknown;
      clientId?: unknown;
    };

    if (!parentId || typeof parentId !== 'string' || !name || typeof name !== 'string') {
      res.status(400).json({ error: 'parentId and name are required', errorCode: 'SQIRL-EXP-CREATE-001' });
      return;
    }

    const scopeVal: ExpenseScope =
      scope === 'household' ? 'household' : 'personal';

    const userId = req.user!.userId;
    let householdId: string | null = null;

    if (scopeVal === 'household') {
      const hh = await resolveHousehold(userId);
      if (!hh) {
        res.status(400).json({ error: 'No household found', errorCode: 'SQIRL-EXP-MOVE-001' });
        return;
      }
      if (hh.role !== 'owner') {
        res.status(403).json({ error: 'Household owner required to manage household categories', errorCode: 'SQIRL-EXP-CAT-004' });
        return;
      }
      householdId = hh.householdId;
    }

    const isTest = !!(req as Request & { isTest?: boolean }).isTest;
    const cat = await createCategory(
      userId,
      parentId,
      name as string,
      typeof iconName === 'string' ? iconName : null,
      scopeVal,
      householdId,
      typeof clientId === 'string' ? clientId : undefined,
      isTest
    );
    res.status(201).json({ category: categoryRowToApi(cat) });
    broadcast('expenses:changed', userId, householdId ?? undefined);
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-EXP-CAT-001') {
      res.status(404).json({ error: e.message, errorCode: 'SQIRL-EXP-CAT-001' }); return;
    }
    if (e.errorCode === 'SQIRL-EXP-CAT-003') {
      res.status(400).json({ error: e.message, errorCode: 'SQIRL-EXP-CAT-003' }); return;
    }
    console.error('[SQIRL-EXP-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-EXP-SERVER-001' });
  }
});

// ── PUT /categories/:id ───────────────────────────────────────────────────────

router.put('/categories/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, iconName } = req.body as { name?: unknown; iconName?: unknown };

    if (isCategorySystem(id)) {
      res.status(403).json({ error: 'Cannot modify a system category', errorCode: 'SQIRL-EXP-CAT-002' });
      return;
    }

    // Household category: require owner role
    const cat = await pool.query<{ scope: string; household_id: string | null }>(
      `SELECT scope, household_id FROM expense_categories WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (!cat.rows[0]) {
      res.status(404).json({ error: 'Category not found', errorCode: 'SQIRL-EXP-CAT-001' }); return;
    }
    if (cat.rows[0].scope === 'household') {
      const hh = await resolveHousehold(req.user!.userId);
      if (!hh || hh.role !== 'owner') {
        res.status(403).json({ error: 'Household owner required', errorCode: 'SQIRL-EXP-CAT-004' }); return;
      }
    }

    const updated = await updateCategory(id, {
      name:     typeof name     === 'string' ? name     : undefined,
      iconName: typeof iconName === 'string' ? iconName : iconName === null ? null : undefined,
    });
    res.json({ category: categoryRowToApi(updated) });
    void (async () => {
      const hh = await resolveHousehold(req.user!.userId);
      broadcast('expenses:changed', req.user!.userId, hh?.householdId ?? undefined);
    })();
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-EXP-CAT-001') {
      res.status(404).json({ error: e.message, errorCode: 'SQIRL-EXP-CAT-001' }); return;
    }
    if (e.errorCode === 'SQIRL-EXP-CAT-002') {
      res.status(403).json({ error: e.message, errorCode: 'SQIRL-EXP-CAT-002' }); return;
    }
    console.error('[SQIRL-EXP-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-EXP-SERVER-001' });
  }
});

// ── DELETE /categories/:id ────────────────────────────────────────────────────

router.delete('/categories/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (isCategorySystem(id)) {
      res.status(403).json({ error: 'Cannot delete a system category', errorCode: 'SQIRL-EXP-CAT-002' });
      return;
    }

    // Household category: require owner role
    const cat = await pool.query<{ scope: string }>(
      `SELECT scope FROM expense_categories WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (!cat.rows[0]) {
      res.status(404).json({ error: 'Category not found', errorCode: 'SQIRL-EXP-CAT-001' }); return;
    }
    if (cat.rows[0].scope === 'household') {
      const hh = await resolveHousehold(req.user!.userId);
      if (!hh || hh.role !== 'owner') {
        res.status(403).json({ error: 'Household owner required', errorCode: 'SQIRL-EXP-CAT-004' }); return;
      }
    }

    await deleteCategory(id);
    res.json({ success: true });
    void (async () => {
      const hh = await resolveHousehold(req.user!.userId);
      broadcast('expenses:changed', req.user!.userId, hh?.householdId ?? undefined);
    })();
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-EXP-CAT-001') {
      res.status(404).json({ error: e.message, errorCode: 'SQIRL-EXP-CAT-001' }); return;
    }
    if (e.errorCode === 'SQIRL-EXP-CAT-002') {
      res.status(403).json({ error: e.message, errorCode: 'SQIRL-EXP-CAT-002' }); return;
    }
    console.error('[SQIRL-EXP-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-EXP-SERVER-001' });
  }
});

// ── GET /budgets ──────────────────────────────────────────────────────────────

router.get('/budgets', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const scope: ExpenseScope =
      (req.query.scope as string) === 'household' ? 'household' : 'personal';
    const month = (req.query.month as string) ?? new Date().toISOString().slice(0, 7);
    const userId = req.user!.userId;

    let householdId: string | null = null;
    if (scope === 'household') {
      const hh = await resolveHousehold(userId);
      if (!hh) {
        res.status(400).json({ error: 'No household found', errorCode: 'SQIRL-EXP-MOVE-001' }); return;
      }
      householdId = hh.householdId;
    }

    const budgets = await getBudgets(scope, userId, householdId, month);
    res.json({ budgets: budgets.map(budgetToApi) });
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-EXP-BUDGET-001') {
      res.status(400).json({ error: e.message, errorCode: 'SQIRL-EXP-BUDGET-001' }); return;
    }
    console.error('[SQIRL-EXP-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-EXP-SERVER-001' });
  }
});

// ── PUT /budgets/:categoryId ──────────────────────────────────────────────────

router.put('/budgets/:categoryId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId } = req.params;
    const { scope, budgetMonth, amount } = req.body as {
      scope?: unknown; budgetMonth?: unknown; amount?: unknown;
    };

    const scopeVal: ExpenseScope =
      scope === 'household' ? 'household' : 'personal';

    if (!budgetMonth || typeof budgetMonth !== 'string') {
      res.status(400).json({ error: 'budgetMonth is required (YYYY-MM)', errorCode: 'SQIRL-EXP-BUDGET-001' }); return;
    }

    const amountNum = Number(amount);
    if (amount === undefined || amount === null || isNaN(amountNum) || amountNum < 0) {
      res.status(400).json({ error: 'amount must be a non-negative number', errorCode: 'SQIRL-EXP-BUDGET-002' }); return;
    }

    const userId = req.user!.userId;
    let householdId: string | null = null;

    if (scopeVal === 'household') {
      const hh = await resolveHousehold(userId);
      if (!hh) {
        res.status(400).json({ error: 'No household found', errorCode: 'SQIRL-EXP-MOVE-001' }); return;
      }
      if (hh.role !== 'owner') {
        res.status(403).json({ error: 'Household owner required', errorCode: 'SQIRL-EXP-CAT-004' }); return;
      }
      householdId = hh.householdId;
    }

    const isTest = !!(req as Request & { isTest?: boolean }).isTest;
    const budget = await setBudget(categoryId, scopeVal, userId, householdId, budgetMonth, amountNum, isTest);
    res.json({ budget: budgetToApi(budget) });
    broadcast('expenses:changed', userId, householdId ?? undefined);
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-EXP-BUDGET-001') {
      res.status(400).json({ error: e.message, errorCode: 'SQIRL-EXP-BUDGET-001' }); return;
    }
    if (e.errorCode === 'SQIRL-EXP-BUDGET-002') {
      res.status(400).json({ error: e.message, errorCode: 'SQIRL-EXP-BUDGET-002' }); return;
    }
    console.error('[SQIRL-EXP-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-EXP-SERVER-001' });
  }
});

// ── POST /budgets/carry-forward ───────────────────────────────────────────────

router.post('/budgets/carry-forward', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { scope, fromMonth, toMonth } = req.body as {
      scope?: unknown; fromMonth?: unknown; toMonth?: unknown;
    };

    const scopeVal: ExpenseScope =
      scope === 'household' ? 'household' : 'personal';

    if (!fromMonth || typeof fromMonth !== 'string' || !toMonth || typeof toMonth !== 'string') {
      res.status(400).json({ error: 'fromMonth and toMonth are required (YYYY-MM)', errorCode: 'SQIRL-EXP-BUDGET-001' }); return;
    }

    const userId = req.user!.userId;
    let householdId: string | null = null;

    if (scopeVal === 'household') {
      const hh = await resolveHousehold(userId);
      if (!hh) {
        res.status(400).json({ error: 'No household found', errorCode: 'SQIRL-EXP-MOVE-001' }); return;
      }
      if (hh.role !== 'owner') {
        res.status(403).json({ error: 'Household owner required', errorCode: 'SQIRL-EXP-CAT-004' }); return;
      }
      householdId = hh.householdId;
    }

    const count = await carryForwardBudgets(scopeVal, userId, householdId, fromMonth as string, toMonth as string);
    res.json({ count });
    broadcast('expenses:changed', userId, householdId ?? undefined);
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-EXP-BUDGET-001') {
      res.status(400).json({ error: e.message, errorCode: 'SQIRL-EXP-BUDGET-001' }); return;
    }
    console.error('[SQIRL-EXP-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-EXP-SERVER-001' });
  }
});

// ── GET / ─────────────────────────────────────────────────────────────────────

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const scope: ExpenseScope =
      (req.query.scope as string) === 'household' ? 'household' : 'personal';
    const month = (req.query.month as string) ?? new Date().toISOString().slice(0, 7);
    const userId = req.user!.userId;

    let householdId: string | null = null;
    if (scope === 'household') {
      const hh = await resolveHousehold(userId);
      if (!hh) {
        res.status(400).json({ error: 'No household found', errorCode: 'SQIRL-EXP-MOVE-001' }); return;
      }
      householdId = hh.householdId;
    }

    const expenses = await getExpenses(userId, scope, householdId, month);
    res.json({ expenses: expenses.map(expenseToApi) });
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-EXP-BUDGET-001') {
      res.status(400).json({ error: e.message, errorCode: 'SQIRL-EXP-BUDGET-001' }); return;
    }
    console.error('[SQIRL-EXP-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-EXP-SERVER-001' });
  }
});

// ── POST / ────────────────────────────────────────────────────────────────────

router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      scope, categoryId, amount, description, expenseDate,
      packSize, unit, quantity, business, location, notes, clientId,
    } = req.body as {
      scope?: unknown; categoryId?: unknown; amount?: unknown; description?: unknown;
      expenseDate?: unknown; packSize?: unknown; unit?: unknown; quantity?: unknown;
      business?: unknown; location?: unknown; notes?: unknown; clientId?: unknown;
    };

    if (
      !categoryId || typeof categoryId !== 'string' ||
      !description || typeof description !== 'string' ||
      !expenseDate || typeof expenseDate !== 'string' ||
      amount === undefined || amount === null
    ) {
      res.status(400).json({
        error: 'description, expenseDate, amount, and categoryId are required',
        errorCode: 'SQIRL-EXP-CREATE-001',
      });
      return;
    }

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      res.status(400).json({ error: 'amount must be a positive number', errorCode: 'SQIRL-EXP-CREATE-002' }); return;
    }

    const scopeVal: ExpenseScope = scope === 'household' ? 'household' : 'personal';
    const userId = req.user!.userId;
    let householdId: string | null = null;

    if (scopeVal === 'household') {
      const hh = await resolveHousehold(userId);
      if (!hh) {
        res.status(400).json({ error: 'No household found', errorCode: 'SQIRL-EXP-MOVE-001' }); return;
      }
      householdId = hh.householdId;
    }

    const isTest = !!(req as Request & { isTest?: boolean }).isTest;
    const expense = await addExpense(userId, scopeVal, householdId, {
      categoryId:  categoryId as string,
      amount:      amountNum,
      description: description as string,
      expenseDate: expenseDate as string,
      packSize:    packSize != null ? Number(packSize) : null,
      unit:        typeof unit     === 'string' ? unit     : null,
      quantity:    quantity != null ? Number(quantity) : null,
      business:    typeof business === 'string' ? business : null,
      location:    typeof location === 'string' ? location : null,
      notes:       typeof notes    === 'string' ? notes    : null,
      clientId:    typeof clientId === 'string' ? clientId : undefined,
    }, isTest);

    res.status(201).json({ expense: expenseToApi(expense) });
    broadcast('expenses:changed', userId, householdId ?? undefined);
  } catch (err) {
    console.error('[SQIRL-EXP-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-EXP-SERVER-001' });
  }
});

// ── PUT /:id ──────────────────────────────────────────────────────────────────

router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      categoryId, amount, description, expenseDate,
      packSize, unit, quantity, business, location, notes,
    } = req.body as {
      categoryId?: unknown; amount?: unknown; description?: unknown; expenseDate?: unknown;
      packSize?: unknown; unit?: unknown; quantity?: unknown;
      business?: unknown; location?: unknown; notes?: unknown;
    };

    if (amount !== undefined) {
      const amountNum = Number(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        res.status(400).json({ error: 'amount must be a positive number', errorCode: 'SQIRL-EXP-CREATE-002' }); return;
      }
    }

    const fields: Parameters<typeof updateExpense>[2] = {};
    if (categoryId !== undefined) fields.categoryId  = typeof categoryId  === 'string' ? categoryId  : null;
    if (amount     !== undefined) fields.amount      = Number(amount);
    if (description !== undefined && typeof description === 'string') fields.description = description;
    if (expenseDate !== undefined && typeof expenseDate === 'string')  fields.expenseDate = expenseDate;
    if (packSize   !== undefined) fields.packSize    = packSize  != null ? Number(packSize)  : null;
    if (unit       !== undefined) fields.unit        = typeof unit     === 'string' ? unit     : null;
    if (quantity   !== undefined) fields.quantity    = quantity  != null ? Number(quantity)  : null;
    if (business   !== undefined) fields.business    = typeof business === 'string' ? business : null;
    if (location   !== undefined) fields.location    = typeof location === 'string' ? location : null;
    if (notes      !== undefined) fields.notes       = typeof notes    === 'string' ? notes    : null;

    const userId = req.user!.userId;
    const expense = await updateExpense(id, userId, fields);
    res.json({ expense: expenseToApi(expense) });
    void (async () => {
      const hh = await resolveHousehold(userId);
      broadcast('expenses:changed', userId, hh?.householdId ?? undefined);
    })();
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-EXP-ACCESS-001') {
      res.status(404).json({ error: e.message, errorCode: 'SQIRL-EXP-ACCESS-001' }); return;
    }
    console.error('[SQIRL-EXP-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-EXP-SERVER-001' });
  }
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────

router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    await deleteExpense(id, userId);
    res.json({ success: true });
    void (async () => {
      const hh = await resolveHousehold(userId);
      broadcast('expenses:changed', userId, hh?.householdId ?? undefined);
    })();
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-EXP-ACCESS-001') {
      res.status(404).json({ error: e.message, errorCode: 'SQIRL-EXP-ACCESS-001' }); return;
    }
    console.error('[SQIRL-EXP-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-EXP-SERVER-001' });
  }
});

// ── GET /:id/move-check ───────────────────────────────────────────────────────

router.get('/:id/move-check', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const targetScope: ExpenseScope =
      (req.query.targetScope as string) === 'household' ? 'household' : 'personal';
    const userId = req.user!.userId;

    let householdId: string | null = null;
    if (targetScope === 'household') {
      const hh = await resolveHousehold(userId);
      if (!hh) {
        res.status(400).json({ error: 'No household found', errorCode: 'SQIRL-EXP-MOVE-001' }); return;
      }
      householdId = hh.householdId;
    }

    const result = await checkCategoryConflict(id, userId, targetScope, householdId);
    res.json({
      needsRemap:          result.needsRemap,
      suggestedCategories: result.suggestedCategories.map(categoryRowToApi),
    });
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-EXP-ACCESS-001') {
      res.status(404).json({ error: e.message, errorCode: 'SQIRL-EXP-ACCESS-001' }); return;
    }
    console.error('[SQIRL-EXP-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-EXP-SERVER-001' });
  }
});

// ── POST /:id/move ────────────────────────────────────────────────────────────

router.post('/:id/move', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { targetScope, targetCategoryId } = req.body as {
      targetScope?: unknown;
      targetCategoryId?: unknown;
    };

    const targetScopeVal: ExpenseScope =
      targetScope === 'household' ? 'household' : 'personal';

    const userId = req.user!.userId;
    let targetHouseholdId: string | null = null;

    if (targetScopeVal === 'household') {
      const hh = await resolveHousehold(userId);
      if (!hh) {
        res.status(400).json({ error: 'No household found', errorCode: 'SQIRL-EXP-MOVE-001' }); return;
      }
      targetHouseholdId = hh.householdId;
    }

    // Check if moving HH→personal: only owners may do this
    if (targetScopeVal === 'personal') {
      // Fetch the expense to determine if it's currently in a household
      const expRes = await pool.query<{ household_id: string | null }>(
        `SELECT household_id FROM expenses WHERE id = $1 AND is_deleted = FALSE`,
        [id]
      );
      if (!expRes.rows[0]) {
        res.status(404).json({ error: 'Expense not found', errorCode: 'SQIRL-EXP-ACCESS-001' }); return;
      }
      if (expRes.rows[0].household_id) {
        const hh = await resolveHousehold(userId);
        if (!hh || hh.role !== 'owner') {
          res.status(403).json({
            error: 'Only household owners can push household transactions to personal',
            errorCode: 'SQIRL-EXP-MOVE-003',
          });
          return;
        }
      }
    }

    const expense = await moveExpense(
      id,
      userId,
      targetScopeVal,
      targetHouseholdId,
      typeof targetCategoryId === 'string' ? targetCategoryId : undefined
    );
    res.json({ expense: expenseToApi(expense) });
    void (async () => {
      const hh = await resolveHousehold(userId);
      broadcast('expenses:changed', userId, hh?.householdId ?? undefined);
    })();
  } catch (err) {
    const e = err as ServiceError;
    if (e.errorCode === 'SQIRL-EXP-ACCESS-001') {
      res.status(404).json({ error: e.message, errorCode: 'SQIRL-EXP-ACCESS-001' }); return;
    }
    if (e.errorCode === 'SQIRL-EXP-MOVE-001') {
      res.status(400).json({ error: e.message, errorCode: 'SQIRL-EXP-MOVE-001' }); return;
    }
    if (e.errorCode === 'SQIRL-EXP-MOVE-002') {
      res.status(400).json({ error: e.message, errorCode: 'SQIRL-EXP-MOVE-002' }); return;
    }
    console.error('[SQIRL-EXP-SERVER-001]', err);
    res.status(500).json({ error: 'Unexpected server error', errorCode: 'SQIRL-EXP-SERVER-001' });
  }
});

export default router;
