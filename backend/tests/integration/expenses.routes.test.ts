/**
 * Integration tests: Expenses routes (/api/v1/expenses)
 *
 * Tests cover:
 *  - GET  /categories (personal + household scope)
 *  - POST /categories (create sub-category, depth limit, owner-only for HH)
 *  - PUT  /categories/:id (update, system category protection)
 *  - DELETE /categories/:id (soft-delete, system category protection)
 *  - GET  /budgets (with lazy carry-forward)
 *  - PUT  /budgets/:categoryId (upsert, validation)
 *  - POST /budgets/carry-forward (manual)
 *  - GET  / (list expenses for month/scope)
 *  - POST / (create expense, validation)
 *  - PUT  /:id (update expense)
 *  - DELETE /:id (soft-delete)
 *  - GET  /:id/move-check
 *  - POST /:id/move (personal→HH, HH→personal owner-only)
 *  - All error codes validated
 */

import request from 'supertest';
import app from '../../src/app';
import { pool } from '../../src/db';
import { connectTestDb, teardownTestDb } from '../helpers/testSetup';
import { createTestUsers, cleanTestData } from '../fixtures/factory';
import { Personas } from '../fixtures/personas';
import { generateToken } from '../../src/services/authService';

const BASE = '/api/v1/expenses';
const FOOD_ID = '00000000-0000-ec00-0000-000000000004';

let aliceToken: string;
let bobToken: string;
let daveToken: string;
let householdId: string;

beforeAll(async () => {
  await connectTestDb();
  await cleanTestData();
  await createTestUsers(['alice', 'bob', 'dave']);

  aliceToken = generateToken(Personas.alice.id, Personas.alice.email ?? null);
  bobToken   = generateToken(Personas.bob.id,   Personas.bob.email   ?? null);
  daveToken  = generateToken(Personas.dave.id,  Personas.dave.email  ?? null);

  // Create household with alice=owner, bob=member
  const hhRes = await pool.query<{ id: string }>(
    `INSERT INTO households (name, is_test_data) VALUES ('Test HH', true) RETURNING id`
  );
  householdId = hhRes.rows[0].id;

  await pool.query(
    `INSERT INTO household_members (household_id, user_id, role)
     VALUES ($1, $2, 'owner'), ($1, $3, 'member')`,
    [householdId, Personas.alice.id, Personas.bob.id]
  );
});

afterAll(() => teardownTestDb());

// ── GET /categories ───────────────────────────────────────────────────────────

describe('GET /categories', () => {
  it('returns 7 system categories for personal scope', async () => {
    const res = await request(app)
      .get(`${BASE}/categories?scope=personal`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(7);
    expect(res.body.categories[0].scope).toBe('system');
  });

  it('returns categories for household scope (alice in household)', async () => {
    const res = await request(app)
      .get(`${BASE}/categories?scope=household`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(7);
  });

  it('returns SQIRL-EXP-MOVE-001 when household requested but user has none', async () => {
    const res = await request(app)
      .get(`${BASE}/categories?scope=household`)
      .set('Authorization', `Bearer ${daveToken}`);
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-EXP-MOVE-001');
  });
});

// ── POST /categories ──────────────────────────────────────────────────────────

let personalSubCatId: string;
let hhSubCatId: string;

describe('POST /categories', () => {
  it('alice creates a personal sub-category under Food', async () => {
    const res = await request(app)
      .post(`${BASE}/categories`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ parentId: FOOD_ID, name: 'Groceries', scope: 'personal', iconName: 'ShoppingCart' });
    expect(res.status).toBe(201);
    expect(res.body.category.name).toBe('Groceries');
    expect(res.body.category.scope).toBe('personal');
    expect(res.body.category.level).toBe(2);
    personalSubCatId = res.body.category.id as string;
  });

  it('alice (owner) creates a household sub-category under Food', async () => {
    const res = await request(app)
      .post(`${BASE}/categories`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ parentId: FOOD_ID, name: 'Household Groceries', scope: 'household' });
    expect(res.status).toBe(201);
    expect(res.body.category.scope).toBe('household');
    hhSubCatId = res.body.category.id as string;
  });

  it('bob (member) cannot create household sub-category — SQIRL-EXP-CAT-004', async () => {
    const res = await request(app)
      .post(`${BASE}/categories`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ parentId: FOOD_ID, name: 'Bob Sub', scope: 'household' });
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('SQIRL-EXP-CAT-004');
  });

  it('rejects missing parentId — SQIRL-EXP-CREATE-001', async () => {
    const res = await request(app)
      .post(`${BASE}/categories`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'No Parent', scope: 'personal' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-EXP-CREATE-001');
  });

  it('rejects depth beyond 3 levels — SQIRL-EXP-CAT-003', async () => {
    // Create a level-3 sub-category first
    const l3Res = await request(app)
      .post(`${BASE}/categories`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ parentId: personalSubCatId, name: 'Level 3 Cat', scope: 'personal' });
    expect(l3Res.status).toBe(201);
    const l3Id = l3Res.body.category.id as string;

    const res = await request(app)
      .post(`${BASE}/categories`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ parentId: l3Id, name: 'Level 4 Cat', scope: 'personal' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-EXP-CAT-003');
  });
});

// ── PUT /categories/:id ───────────────────────────────────────────────────────

describe('PUT /categories/:id', () => {
  it('alice updates her personal sub-category name', async () => {
    const res = await request(app)
      .put(`${BASE}/categories/${personalSubCatId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Supermarket' });
    expect(res.status).toBe(200);
    expect(res.body.category.name).toBe('Supermarket');
  });

  it('alice updates household category icon', async () => {
    const res = await request(app)
      .put(`${BASE}/categories/${hhSubCatId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ iconName: 'Home' });
    expect(res.status).toBe(200);
    expect(res.body.category.iconName).toBe('Home');
  });

  it('bob cannot update household category — SQIRL-EXP-CAT-004', async () => {
    const res = await request(app)
      .put(`${BASE}/categories/${hhSubCatId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ name: 'Bob Rename' });
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('SQIRL-EXP-CAT-004');
  });

  it('cannot update system category — SQIRL-EXP-CAT-002', async () => {
    const res = await request(app)
      .put(`${BASE}/categories/${FOOD_ID}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Hacked Food' });
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('SQIRL-EXP-CAT-002');
  });
});

// ── DELETE /categories/:id ────────────────────────────────────────────────────

describe('DELETE /categories/:id', () => {
  it('cannot delete system category — SQIRL-EXP-CAT-002', async () => {
    const res = await request(app)
      .delete(`${BASE}/categories/${FOOD_ID}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('SQIRL-EXP-CAT-002');
  });

  it('alice deletes her personal sub-category', async () => {
    const tempCat = await request(app)
      .post(`${BASE}/categories`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ parentId: FOOD_ID, name: 'Temp Cat', scope: 'personal' });
    const tempId = tempCat.body.category.id as string;

    const res = await request(app)
      .delete(`${BASE}/categories/${tempId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('bob cannot delete household category — SQIRL-EXP-CAT-004', async () => {
    const res = await request(app)
      .delete(`${BASE}/categories/${hhSubCatId}`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('SQIRL-EXP-CAT-004');
  });
});

// ── GET /budgets ──────────────────────────────────────────────────────────────

describe('GET /budgets', () => {
  it('returns empty array when no budgets set', async () => {
    const res = await request(app)
      .get(`${BASE}/budgets?scope=personal&month=2026-01`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.budgets).toEqual([]);
  });

  it('returns SQIRL-EXP-BUDGET-001 for invalid month format', async () => {
    const res = await request(app)
      .get(`${BASE}/budgets?scope=personal&month=2026/01`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-EXP-BUDGET-001');
  });
});

// ── PUT /budgets/:categoryId ──────────────────────────────────────────────────

describe('PUT /budgets/:categoryId', () => {
  it('alice sets a personal budget for Food', async () => {
    const res = await request(app)
      .put(`${BASE}/budgets/${FOOD_ID}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ scope: 'personal', budgetMonth: '2026-03', amount: 500 });
    expect(res.status).toBe(200);
    expect(res.body.budget.amount).toBe(500);
    expect(res.body.budget.categoryId).toBe(FOOD_ID);
  });

  it('upserts (update existing budget)', async () => {
    const res = await request(app)
      .put(`${BASE}/budgets/${FOOD_ID}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ scope: 'personal', budgetMonth: '2026-03', amount: 600 });
    expect(res.status).toBe(200);
    expect(res.body.budget.amount).toBe(600);
  });

  it('rejects negative amount — SQIRL-EXP-BUDGET-002', async () => {
    const res = await request(app)
      .put(`${BASE}/budgets/${FOOD_ID}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ scope: 'personal', budgetMonth: '2026-03', amount: -100 });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-EXP-BUDGET-002');
  });

  it('alice (owner) sets household budget', async () => {
    const res = await request(app)
      .put(`${BASE}/budgets/${FOOD_ID}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ scope: 'household', budgetMonth: '2026-03', amount: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.budget.scope).toBe('household');
  });

  it('bob (member) cannot set household budget — SQIRL-EXP-CAT-004', async () => {
    const res = await request(app)
      .put(`${BASE}/budgets/${FOOD_ID}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ scope: 'household', budgetMonth: '2026-03', amount: 999 });
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('SQIRL-EXP-CAT-004');
  });
});

// ── POST /budgets/carry-forward ───────────────────────────────────────────────

describe('POST /budgets/carry-forward', () => {
  it('alice carries forward personal budgets from 2026-03 to 2026-04', async () => {
    const res = await request(app)
      .post(`${BASE}/budgets/carry-forward`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ scope: 'personal', fromMonth: '2026-03', toMonth: '2026-04' });
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });

  it('verifies carried-forward budget appears in 2026-04', async () => {
    const res = await request(app)
      .get(`${BASE}/budgets?scope=personal&month=2026-04`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.budgets.some((b: { categoryId: string }) => b.categoryId === FOOD_ID)).toBe(true);
  });
});

// ── POST / (create expense) ───────────────────────────────────────────────────

let personalExpenseId: string;
let hhExpenseId: string;

describe('POST /', () => {
  it('alice creates a personal expense', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        scope: 'personal',
        categoryId: FOOD_ID,
        amount: 85.50,
        description: 'Weekly groceries',
        expenseDate: '2026-03-15',
        business: 'Woolworths',
        location: 'Bondi Junction',
      });
    expect(res.status).toBe(201);
    expect(res.body.expense.amount).toBe(85.5);
    expect(res.body.expense.description).toBe('Weekly groceries');
    expect(res.body.expense.householdId).toBeNull();
    personalExpenseId = res.body.expense.id as string;
  });

  it('bob creates a household expense', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({
        scope: 'household',
        categoryId: FOOD_ID,
        amount: 120,
        description: 'Family dinner',
        expenseDate: '2026-03-16',
      });
    expect(res.status).toBe(201);
    expect(res.body.expense.householdId).toBe(householdId);
    hhExpenseId = res.body.expense.id as string;
  });

  it('rejects missing description — SQIRL-EXP-CREATE-001', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ scope: 'personal', categoryId: FOOD_ID, amount: 10, expenseDate: '2026-03-01' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-EXP-CREATE-001');
  });

  it('rejects zero amount — SQIRL-EXP-CREATE-002', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ scope: 'personal', categoryId: FOOD_ID, amount: 0, description: 'Test', expenseDate: '2026-03-01' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-EXP-CREATE-002');
  });

  it('dave (no household) gets SQIRL-EXP-MOVE-001 for household scope', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${daveToken}`)
      .send({ scope: 'household', categoryId: FOOD_ID, amount: 50, description: 'Dave HH', expenseDate: '2026-03-01' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-EXP-MOVE-001');
  });
});

// ── GET / (list expenses) ─────────────────────────────────────────────────────

describe('GET /', () => {
  it('alice fetches personal expenses for 2026-03', async () => {
    const res = await request(app)
      .get(`${BASE}?scope=personal&month=2026-03`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.expenses.some((e: { id: string }) => e.id === personalExpenseId)).toBe(true);
  });

  it('bob fetches household expenses for 2026-03', async () => {
    const res = await request(app)
      .get(`${BASE}?scope=household&month=2026-03`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(res.status).toBe(200);
    expect(res.body.expenses.some((e: { id: string }) => e.id === hhExpenseId)).toBe(true);
  });

  it("alice cannot see bob's personal expenses", async () => {
    // Dave has his own personal expense
    await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${daveToken}`)
      .send({ scope: 'personal', categoryId: FOOD_ID, amount: 30, description: 'Dave personal', expenseDate: '2026-03-10' });

    const res = await request(app)
      .get(`${BASE}?scope=personal&month=2026-03`)
      .set('Authorization', `Bearer ${aliceToken}`);
    // Alice should NOT see dave's personal expenses
    const ids = res.body.expenses.map((e: { ownerUserId: string }) => e.ownerUserId) as string[];
    expect(ids.every(id => id === Personas.alice.id)).toBe(true);
  });
});

// ── PUT /:id ──────────────────────────────────────────────────────────────────

describe('PUT /:id', () => {
  it('alice updates her personal expense amount', async () => {
    const res = await request(app)
      .put(`${BASE}/${personalExpenseId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ amount: 90, business: 'Coles' });
    expect(res.status).toBe(200);
    expect(res.body.expense.amount).toBe(90);
    expect(res.body.expense.business).toBe('Coles');
  });

  it('bob updates a household expense', async () => {
    const res = await request(app)
      .put(`${BASE}/${hhExpenseId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ notes: 'Updated by bob' });
    expect(res.status).toBe(200);
    expect(res.body.expense.notes).toBe('Updated by bob');
  });

  it('dave cannot update alice personal expense — SQIRL-EXP-ACCESS-001', async () => {
    const res = await request(app)
      .put(`${BASE}/${personalExpenseId}`)
      .set('Authorization', `Bearer ${daveToken}`)
      .send({ amount: 1 });
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('SQIRL-EXP-ACCESS-001');
  });
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────

describe('DELETE /:id', () => {
  it('alice soft-deletes her personal expense', async () => {
    const createRes = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ scope: 'personal', categoryId: FOOD_ID, amount: 10, description: 'To delete', expenseDate: '2026-03-20' });
    const deleteId = createRes.body.expense.id as string;

    const res = await request(app)
      .delete(`${BASE}/${deleteId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Should not appear in list anymore
    const listRes = await request(app)
      .get(`${BASE}?scope=personal&month=2026-03`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(listRes.body.expenses.some((e: { id: string }) => e.id === deleteId)).toBe(false);
  });

  it('dave cannot delete alice personal expense — SQIRL-EXP-ACCESS-001', async () => {
    const res = await request(app)
      .delete(`${BASE}/${personalExpenseId}`)
      .set('Authorization', `Bearer ${daveToken}`);
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('SQIRL-EXP-ACCESS-001');
  });
});

// ── GET /:id/move-check ───────────────────────────────────────────────────────

describe('GET /:id/move-check', () => {
  it('returns needsRemap=false for system category expense moving to household', async () => {
    const res = await request(app)
      .get(`${BASE}/${personalExpenseId}/move-check?targetScope=household`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.needsRemap).toBe(false);
  });

  it('returns SQIRL-EXP-ACCESS-001 for unknown expense', async () => {
    const res = await request(app)
      .get(`${BASE}/00000000-0000-0000-0000-000000000099/move-check?targetScope=household`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('SQIRL-EXP-ACCESS-001');
  });
});

// ── POST /:id/move ────────────────────────────────────────────────────────────

describe('POST /:id/move', () => {
  it('alice moves personal→household expense', async () => {
    const res = await request(app)
      .post(`${BASE}/${personalExpenseId}/move`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ targetScope: 'household' });
    expect(res.status).toBe(200);
    expect(res.body.expense.householdId).toBe(householdId);
  });

  it('alice (owner) moves household→personal expense', async () => {
    const res = await request(app)
      .post(`${BASE}/${hhExpenseId}/move`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ targetScope: 'personal' });
    expect(res.status).toBe(200);
    expect(res.body.expense.householdId).toBeNull();
  });

  it('bob (member) cannot move HH→personal — SQIRL-EXP-MOVE-003', async () => {
    // Re-add hhExpenseId to household first
    await pool.query(
      `UPDATE expenses SET household_id = $1, owner_user_id = $2 WHERE id = $3`,
      [householdId, Personas.bob.id, hhExpenseId]
    );

    const res = await request(app)
      .post(`${BASE}/${hhExpenseId}/move`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ targetScope: 'personal' });
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('SQIRL-EXP-MOVE-003');
  });

  it('moving to household scope without household — SQIRL-EXP-MOVE-001', async () => {
    // Create dave personal expense (dave has no household)
    const createRes = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${daveToken}`)
      .send({ scope: 'personal', categoryId: FOOD_ID, amount: 50, description: 'Dave exp', expenseDate: '2026-03-05' });
    const daveExpId = createRes.body.expense.id as string;

    const res = await request(app)
      .post(`${BASE}/${daveExpId}/move`)
      .set('Authorization', `Bearer ${daveToken}`)
      .send({ targetScope: 'household' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-EXP-MOVE-001');
  });
});
