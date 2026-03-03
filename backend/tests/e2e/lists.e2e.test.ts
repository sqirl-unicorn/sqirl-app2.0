/**
 * E2E tests: Shopping Lists full user flows
 *
 * Simulates real multi-user household scenarios end-to-end:
 *  - Alice creates a household (via invite+accept flow)
 *  - Alice creates lists → Bob sees them immediately
 *  - Bob modifies items → Alice sees the changes
 *  - Task progress flows: subtask completion drives progress bar
 *  - Dave (outsider) cannot access household lists
 *  - Exit-and-re-list: deleted lists are gone for all household members
 *
 * Uses factory.ts + Personas for deterministic, isolated test data.
 * All test data carries is_test_data: true.
 */

import request from 'supertest';
import app from '../../src/app';
import { connectTestDb, teardownTestDb } from '../helpers/testSetup';
import { createTestUsers, cleanTestData } from '../fixtures/factory';
import { Personas } from '../fixtures/personas';
import { generateToken } from '../../src/services/authService';
import { pool } from '../../src/db';

const BASE = '/api/v1';

let aliceToken: string;
let bobToken: string;
let eveToken: string;
let householdId: string;

beforeAll(async () => {
  await connectTestDb();
  await cleanTestData();
  await createTestUsers(['alice', 'bob', 'eve']);

  aliceToken = generateToken(Personas.alice.id, Personas.alice.email ?? null);
  bobToken   = generateToken(Personas.bob.id,   Personas.bob.email ?? null);
  eveToken   = generateToken(Personas.eve.id,   Personas.eve.email ?? null);

  // Bootstrap household directly via DB (household creation is tested in household e2e)
  const hhRes = await pool.query<{ id: string }>(
    `INSERT INTO households (name, is_test_data) VALUES ('E2E House', true) RETURNING id`
  );
  householdId = hhRes.rows[0].id;
  await pool.query(
    `INSERT INTO household_members (household_id, user_id, role, is_test_data) VALUES ($1, $2, 'owner', true)`,
    [householdId, Personas.alice.id]
  );
  await pool.query(
    `INSERT INTO household_members (household_id, user_id, role, is_test_data) VALUES ($1, $2, 'member', true)`,
    [householdId, Personas.bob.id]
  );
});

afterAll(() => teardownTestDb());

// ── E2E Flow 1: Household list visibility ──────────────────────────────────────

describe('E2E: Household list visibility', () => {
  let groceryListId: string;

  it('alice creates a grocery list', async () => {
    const res = await request(app)
      .post(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Weekly Shop', listType: 'grocery' });
    expect(res.status).toBe(201);
    expect(res.body.list.householdId).toBe(householdId);
    groceryListId = res.body.list.id as string;
  });

  it('bob sees alice\'s grocery list immediately', async () => {
    const res = await request(app)
      .get(`${BASE}/lists`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(res.status).toBe(200);
    const ids = (res.body.lists as { id: string }[]).map(l => l.id);
    expect(ids).toContain(groceryListId);
  });

  it('eve (outsider) cannot see the list', async () => {
    const res = await request(app)
      .get(`${BASE}/lists`)
      .set('Authorization', `Bearer ${eveToken}`);
    expect(res.status).toBe(200);
    const ids = (res.body.lists as { id: string }[]).map(l => l.id);
    expect(ids).not.toContain(groceryListId);
  });

  it('eve cannot add items to alice\'s list → 404', async () => {
    const res = await request(app)
      .post(`${BASE}/lists/${groceryListId}/items`)
      .set('Authorization', `Bearer ${eveToken}`)
      .send({ description: 'Hack item' });
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('SQIRL-LIST-ACCESS-001');
  });
});

// ── E2E Flow 2: Collaborative item management ──────────────────────────────────

describe('E2E: Collaborative item editing', () => {
  let listId: string;
  let aliceItemId: string;
  let bobItemId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Shared Groceries', listType: 'grocery' });
    listId = res.body.list.id as string;
  });

  it('alice adds an item', async () => {
    const res = await request(app)
      .post(`${BASE}/lists/${listId}/items`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ description: 'Apples', quantity: 6, unit: 'pack' });
    expect(res.status).toBe(201);
    aliceItemId = res.body.item.id as string;
  });

  it('bob adds an item to the same list', async () => {
    const res = await request(app)
      .post(`${BASE}/lists/${listId}/items`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ description: 'Milk', packSize: '2L', quantity: 2 });
    expect(res.status).toBe(201);
    bobItemId = res.body.item.id as string;
  });

  it('alice sees both items', async () => {
    const res = await request(app)
      .get(`${BASE}/lists/${listId}/items`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    const ids = (res.body.items as { id: string }[]).map(i => i.id);
    expect(ids).toContain(aliceItemId);
    expect(ids).toContain(bobItemId);
  });

  it('bob marks alice\'s item as purchased', async () => {
    const res = await request(app)
      .put(`${BASE}/lists/${listId}/items/${aliceItemId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ isPurchased: true });
    expect(res.status).toBe(200);
    expect(res.body.item.isPurchased).toBe(true);
  });

  it('alice sees the updated purchased state', async () => {
    const res = await request(app)
      .get(`${BASE}/lists/${listId}/items`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const item = (res.body.items as { id: string; isPurchased: boolean }[]).find(i => i.id === aliceItemId);
    expect(item?.isPurchased).toBe(true);
  });

  it('bob deletes alice\'s item', async () => {
    const res = await request(app)
      .delete(`${BASE}/lists/${listId}/items/${aliceItemId}`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(res.status).toBe(200);
  });

  it('alice no longer sees the deleted item', async () => {
    const res = await request(app)
      .get(`${BASE}/lists/${listId}/items`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const ids = (res.body.items as { id: string }[]).map(i => i.id);
    expect(ids).not.toContain(aliceItemId);
  });
});

// ── E2E Flow 3: Move item between same-type lists ─────────────────────────────

describe('E2E: Move item between lists', () => {
  let listAId: string;
  let listBId: string;
  let itemId: string;

  beforeAll(async () => {
    const [a, b] = await Promise.all([
      request(app).post(`${BASE}/lists`).set('Authorization', `Bearer ${aliceToken}`).send({ name: 'List A', listType: 'general' }),
      request(app).post(`${BASE}/lists`).set('Authorization', `Bearer ${aliceToken}`).send({ name: 'List B', listType: 'general' }),
    ]);
    listAId = a.body.list.id as string;
    listBId = b.body.list.id as string;

    const itemRes = await request(app)
      .post(`${BASE}/lists/${listAId}/items`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ description: 'Moveable item' });
    itemId = itemRes.body.item.id as string;
  });

  it('bob moves item from list A to list B', async () => {
    const res = await request(app)
      .put(`${BASE}/lists/items/${itemId}/move`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ targetListId: listBId });
    expect(res.status).toBe(200);
    expect(res.body.item.listId).toBe(listBId);
  });

  it('alice sees item in list B, not list A', async () => {
    const [aItems, bItems] = await Promise.all([
      request(app).get(`${BASE}/lists/${listAId}/items`).set('Authorization', `Bearer ${aliceToken}`),
      request(app).get(`${BASE}/lists/${listBId}/items`).set('Authorization', `Bearer ${aliceToken}`),
    ]);
    const aIds = (aItems.body.items as { id: string }[]).map(i => i.id);
    const bIds = (bItems.body.items as { id: string }[]).map(i => i.id);
    expect(aIds).not.toContain(itemId);
    expect(bIds).toContain(itemId);
  });
});

// ── E2E Flow 4: Todo task + subtask progress ──────────────────────────────────

describe('E2E: Todo task progress flow', () => {
  let listId: string;
  let taskId: string;
  let sub1Id: string;
  let sub2Id: string;
  let sub3Id: string;

  beforeAll(async () => {
    const res = await request(app)
      .post(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Sprint Tasks', listType: 'todo' });
    listId = res.body.list.id as string;

    const taskRes = await request(app)
      .post(`${BASE}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'Launch feature', dueDate: '2026-12-31' });
    taskId = taskRes.body.task.id as string;
  });

  it('task starts at 0% progress with no subtasks', async () => {
    const res = await request(app)
      .get(`${BASE}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const task = (res.body.tasks as { id: string; progress: number }[]).find(t => t.id === taskId);
    expect(task?.progress).toBe(0);
  });

  it('alice adds 3 subtasks', async () => {
    const [r1, r2, r3] = await Promise.all([
      request(app).post(`${BASE}/lists/${listId}/tasks/${taskId}/subtasks`).set('Authorization', `Bearer ${aliceToken}`).send({ title: 'Design' }),
      request(app).post(`${BASE}/lists/${listId}/tasks/${taskId}/subtasks`).set('Authorization', `Bearer ${aliceToken}`).send({ title: 'Implement' }),
      request(app).post(`${BASE}/lists/${listId}/tasks/${taskId}/subtasks`).set('Authorization', `Bearer ${aliceToken}`).send({ title: 'Test' }),
    ]);
    sub1Id = r1.body.subtask.id as string;
    sub2Id = r2.body.subtask.id as string;
    sub3Id = r3.body.subtask.id as string;
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r3.status).toBe(201);
  });

  it('bob completes the first subtask → 33% progress', async () => {
    await request(app)
      .put(`${BASE}/lists/${listId}/tasks/${taskId}/subtasks/${sub1Id}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ isCompleted: true });

    const res = await request(app)
      .get(`${BASE}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const task = (res.body.tasks as { id: string; progress: number }[]).find(t => t.id === taskId);
    expect(task?.progress).toBe(33);
  });

  it('completes second subtask → 66% progress', async () => {
    await request(app)
      .put(`${BASE}/lists/${listId}/tasks/${taskId}/subtasks/${sub2Id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ isCompleted: true });

    const res = await request(app)
      .get(`${BASE}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const task = (res.body.tasks as { id: string; progress: number }[]).find(t => t.id === taskId);
    expect(task?.progress).toBe(66);
  });

  it('completes all subtasks → 100% progress', async () => {
    await request(app)
      .put(`${BASE}/lists/${listId}/tasks/${taskId}/subtasks/${sub3Id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ isCompleted: true });

    const res = await request(app)
      .get(`${BASE}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const task = (res.body.tasks as { id: string; progress: number }[]).find(t => t.id === taskId);
    expect(task?.progress).toBe(100);
  });

  it('manual progress override takes precedence', async () => {
    await request(app)
      .put(`${BASE}/lists/${listId}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ useManualProgress: true, manualProgress: 75 });

    const res = await request(app)
      .get(`${BASE}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const task = (res.body.tasks as { id: string; progress: number; useManualProgress: boolean }[]).find(t => t.id === taskId);
    expect(task?.useManualProgress).toBe(true);
    expect(task?.progress).toBe(75);
  });

  it('disabling manual progress reverts to auto-computed (100%)', async () => {
    await request(app)
      .put(`${BASE}/lists/${listId}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ useManualProgress: false });

    const res = await request(app)
      .get(`${BASE}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const task = (res.body.tasks as { id: string; progress: number }[]).find(t => t.id === taskId);
    expect(task?.progress).toBe(100);
  });
});

// ── E2E Flow 5: List deletion cascade ─────────────────────────────────────────

describe('E2E: List deletion removes all items/tasks for all members', () => {
  let listId: string;

  it('alice creates a list with items', async () => {
    const lRes = await request(app)
      .post(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Delete Me', listType: 'general' });
    listId = lRes.body.list.id as string;

    await request(app)
      .post(`${BASE}/lists/${listId}/items`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ description: 'Item to delete' });
  });

  it('bob can see the list before deletion', async () => {
    const res = await request(app)
      .get(`${BASE}/lists`)
      .set('Authorization', `Bearer ${bobToken}`);
    const ids = (res.body.lists as { id: string }[]).map(l => l.id);
    expect(ids).toContain(listId);
  });

  it('alice deletes the list', async () => {
    const res = await request(app)
      .delete(`${BASE}/lists/${listId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
  });

  it('bob no longer sees the deleted list', async () => {
    const res = await request(app)
      .get(`${BASE}/lists`)
      .set('Authorization', `Bearer ${bobToken}`);
    const ids = (res.body.lists as { id: string }[]).map(l => l.id);
    expect(ids).not.toContain(listId);
  });

  it('accessing deleted list returns 404', async () => {
    const res = await request(app)
      .get(`${BASE}/lists/${listId}/items`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('SQIRL-LIST-ACCESS-001');
  });
});
