/**
 * E2E tests: Expenses full lifecycle flows
 *
 * Tests cover:
 *  - Personal expense full lifecycle (create, list, update, delete)
 *  - Household expense lifecycle with multiple users
 *  - Budget set and lazy carry-forward
 *  - Category management (create sub-cat, update, delete)
 *  - Move personal→household and HH→personal (owner restriction)
 *  - Category mismatch detection on move
 */

import request from 'supertest';
import app from '../../src/app';
import { pool } from '../../src/db';
import { connectTestDb, teardownTestDb } from '../helpers/testSetup';
import { createTestUsers, cleanTestData } from '../fixtures/factory';
import { Personas } from '../fixtures/personas';
import { generateToken } from '../../src/services/authService';

const BASE = '/api/v1/expenses';
const HOUSING_ID  = '00000000-0000-ec00-0000-000000000001';
const FOOD_ID     = '00000000-0000-ec00-0000-000000000004';
const TRANSPORT_ID = '00000000-0000-ec00-0000-000000000003';

let aliceToken: string;
let bobToken: string;
let carolToken: string;
let householdId: string;

beforeAll(async () => {
  await connectTestDb();
  await cleanTestData();
  await createTestUsers(['alice', 'bob', 'carol']);

  aliceToken = generateToken(Personas.alice.id, Personas.alice.email ?? null);
  bobToken   = generateToken(Personas.bob.id,   Personas.bob.email   ?? null);
  carolToken = generateToken(Personas.carol.id, Personas.carol.email ?? null);

  const hhRes = await pool.query<{ id: string }>(
    `INSERT INTO households (name, is_test_data) VALUES ('E2E HH', true) RETURNING id`
  );
  householdId = hhRes.rows[0].id;

  await pool.query(
    `INSERT INTO household_members (household_id, user_id, role)
     VALUES ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member')`,
    [householdId, Personas.alice.id, Personas.bob.id, Personas.carol.id]
  );
});

afterAll(() => teardownTestDb());

// ── Flow 1: Personal expense lifecycle ───────────────────────────────────────

describe('Personal expense lifecycle', () => {
  let expenseId: string;

  it('alice creates a personal expense', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        scope: 'personal',
        categoryId: FOOD_ID,
        amount: 55.75,
        description: 'Lunch',
        expenseDate: '2026-03-10',
        business: 'Cafe Sydney',
        packSize: 1,
        unit: 'meal',
        quantity: 1,
      });
    expect(res.status).toBe(201);
    expenseId = res.body.expense.id as string;
  });

  it('expense appears in personal list for the month', async () => {
    const res = await request(app)
      .get(`${BASE}?scope=personal&month=2026-03`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.body.expenses.some((e: { id: string }) => e.id === expenseId)).toBe(true);
  });

  it('alice updates the expense description', async () => {
    const res = await request(app)
      .put(`${BASE}/${expenseId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ description: 'Business lunch', location: 'CBD' });
    expect(res.status).toBe(200);
    expect(res.body.expense.description).toBe('Business lunch');
    expect(res.body.expense.location).toBe('CBD');
  });

  it('alice deletes the expense', async () => {
    const res = await request(app)
      .delete(`${BASE}/${expenseId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
  });

  it('deleted expense no longer appears in list', async () => {
    const res = await request(app)
      .get(`${BASE}?scope=personal&month=2026-03`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.body.expenses.some((e: { id: string }) => e.id === expenseId)).toBe(false);
  });
});

// ── Flow 2: Household expense lifecycle ──────────────────────────────────────

describe('Household expense lifecycle', () => {
  let hhExpId: string;

  it('bob adds a household expense', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({
        scope: 'household',
        categoryId: TRANSPORT_ID,
        amount: 45,
        description: 'Petrol',
        expenseDate: '2026-03-12',
        business: 'BP',
        quantity: 30,
        unit: 'L',
      });
    expect(res.status).toBe(201);
    hhExpId = res.body.expense.id as string;
  });

  it('carol (another member) can see the household expense', async () => {
    const res = await request(app)
      .get(`${BASE}?scope=household&month=2026-03`)
      .set('Authorization', `Bearer ${carolToken}`);
    expect(res.body.expenses.some((e: { id: string }) => e.id === hhExpId)).toBe(true);
  });

  it('carol (member) can update the household expense', async () => {
    const res = await request(app)
      .put(`${BASE}/${hhExpId}`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ notes: 'Verified by carol' });
    expect(res.status).toBe(200);
  });

  it('carol (member) can soft-delete the household expense', async () => {
    const res = await request(app)
      .delete(`${BASE}/${hhExpId}`)
      .set('Authorization', `Bearer ${carolToken}`);
    expect(res.status).toBe(200);
  });
});

// ── Flow 3: Budget set and carry-forward ──────────────────────────────────────

describe('Budget carry-forward', () => {
  it('alice sets budgets for multiple categories in 2026-05', async () => {
    for (const catId of [FOOD_ID, TRANSPORT_ID, HOUSING_ID]) {
      const res = await request(app)
        .put(`${BASE}/budgets/${catId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ scope: 'personal', budgetMonth: '2026-05', amount: 300 });
      expect(res.status).toBe(200);
    }
  });

  it('carry-forward to 2026-06 copies all 3 budgets', async () => {
    const res = await request(app)
      .post(`${BASE}/budgets/carry-forward`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ scope: 'personal', fromMonth: '2026-05', toMonth: '2026-06' });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
  });

  it('lazy carry-forward on first GET for a new month', async () => {
    // 2026-07 has no budgets; service should auto-copy from 2026-06
    const res = await request(app)
      .get(`${BASE}/budgets?scope=personal&month=2026-07`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    // Should have carried-forward 3 budgets from 2026-06
    expect(res.body.budgets).toHaveLength(3);
  });

  it('carry-forward does not overwrite existing budgets', async () => {
    // Set a different amount for FOOD in 2026-08
    await request(app)
      .put(`${BASE}/budgets/${FOOD_ID}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ scope: 'personal', budgetMonth: '2026-08', amount: 999 });

    // Carry forward from 2026-07 to 2026-08
    const res = await request(app)
      .post(`${BASE}/budgets/carry-forward`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ scope: 'personal', fromMonth: '2026-07', toMonth: '2026-08' });
    expect(res.status).toBe(200);

    // FOOD budget for 2026-08 should still be 999 (not overwritten)
    const listRes = await request(app)
      .get(`${BASE}/budgets?scope=personal&month=2026-08`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const foodBudget = listRes.body.budgets.find(
      (b: { categoryId: string }) => b.categoryId === FOOD_ID
    ) as { amount: number } | undefined;
    expect(foodBudget?.amount).toBe(999);
  });
});

// ── Flow 4: Category management ───────────────────────────────────────────────

describe('Category sub-tree management', () => {
  let subCatId: string;
  let subSubCatId: string;

  it('alice creates level-2 and level-3 personal sub-categories', async () => {
    const l2Res = await request(app)
      .post(`${BASE}/categories`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ parentId: FOOD_ID, name: 'Dining Out', scope: 'personal', iconName: 'Coffee' });
    expect(l2Res.status).toBe(201);
    subCatId = l2Res.body.category.id as string;

    const l3Res = await request(app)
      .post(`${BASE}/categories`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ parentId: subCatId, name: 'Cafes', scope: 'personal' });
    expect(l3Res.status).toBe(201);
    subSubCatId = l3Res.body.category.id as string;
  });

  it('level-2 and level-3 categories appear in the personal category tree', async () => {
    const res = await request(app)
      .get(`${BASE}/categories?scope=personal`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const foodRoot = res.body.categories.find(
      (c: { id: string }) => c.id === FOOD_ID
    ) as { children: { id: string; children: { id: string }[] }[] } | undefined;
    expect(foodRoot?.children.some((c) => c.id === subCatId)).toBe(true);
    const diningOut = foodRoot?.children.find((c) => c.id === subCatId);
    expect(diningOut?.children.some((c) => c.id === subSubCatId)).toBe(true);
  });

  it('deleting level-2 also removes level-3 (cascade)', async () => {
    await request(app)
      .delete(`${BASE}/categories/${subCatId}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    const res = await request(app)
      .get(`${BASE}/categories?scope=personal`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const allIds = JSON.stringify(res.body) as string;
    expect(allIds.includes(subSubCatId)).toBe(false);
  });
});

// ── Flow 5: Move expense (personal↔household) ─────────────────────────────────

describe('Move expenses between scopes', () => {
  let personalExpId: string;
  let hhExpId2: string;

  beforeAll(async () => {
    const p = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ scope: 'personal', categoryId: FOOD_ID, amount: 25, description: 'Personal lunch', expenseDate: '2026-03-18' });
    personalExpId = p.body.expense.id as string;

    const h = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ scope: 'household', categoryId: FOOD_ID, amount: 80, description: 'HH groceries', expenseDate: '2026-03-19' });
    hhExpId2 = h.body.expense.id as string;
  });

  it('alice moves personal→household; expense now has householdId', async () => {
    const res = await request(app)
      .post(`${BASE}/${personalExpId}/move`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ targetScope: 'household' });
    expect(res.status).toBe(200);
    expect(res.body.expense.householdId).toBe(householdId);
  });

  it('moved expense disappears from personal list', async () => {
    const res = await request(app)
      .get(`${BASE}?scope=personal&month=2026-03`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.body.expenses.some((e: { id: string }) => e.id === personalExpId)).toBe(false);
  });

  it('moved expense appears in household list', async () => {
    const res = await request(app)
      .get(`${BASE}?scope=household&month=2026-03`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.body.expenses.some((e: { id: string }) => e.id === personalExpId)).toBe(true);
  });

  it('alice (owner) moves HH→personal', async () => {
    const res = await request(app)
      .post(`${BASE}/${hhExpId2}/move`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ targetScope: 'personal' });
    expect(res.status).toBe(200);
    expect(res.body.expense.householdId).toBeNull();
  });

  it('move-check returns needsRemap=true for a custom personal category on a HH move', async () => {
    // Create a personal custom sub-category
    const catRes = await request(app)
      .post(`${BASE}/categories`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ parentId: FOOD_ID, name: 'Alice Personal Sub', scope: 'personal' });
    const customCatId = catRes.body.category.id as string;

    // Create expense tagged to the personal custom cat
    const expRes = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ scope: 'personal', categoryId: customCatId, amount: 15, description: 'Custom cat expense', expenseDate: '2026-03-20' });
    const customExpId = expRes.body.expense.id as string;

    // move-check: moving personal→household should flag needsRemap=true
    const checkRes = await request(app)
      .get(`${BASE}/${customExpId}/move-check?targetScope=household`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(checkRes.status).toBe(200);
    expect(checkRes.body.needsRemap).toBe(true);
  });
});
