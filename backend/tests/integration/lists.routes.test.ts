/**
 * Integration tests: Lists routes
 *
 * Tests cover the full HTTP layer with a real Neon DB.
 * Personas: alice (household owner), bob (household member), dave (outsider)
 *
 * Flows tested:
 *  - Create list (general, grocery, todo)
 *  - Get lists (household-scoped visibility)
 *  - Rename list
 *  - Delete list
 *  - Add / update / delete list items
 *  - Mark item as purchased
 *  - Move item between same-type lists
 *  - Add / update / delete todo tasks
 *  - Add / update / delete todo subtasks
 *  - Due date validation (subtask cannot exceed task)
 *  - Progress computation
 *  - Error paths: access denied, wrong type, missing fields
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
let daveToken: string;
let householdId: string;

beforeAll(async () => {
  await connectTestDb();
  await cleanTestData();
  await createTestUsers(['alice', 'bob', 'dave']);

  aliceToken = generateToken(Personas.alice.id, Personas.alice.email ?? null);
  bobToken   = generateToken(Personas.bob.id,   Personas.bob.email   ?? null);
  daveToken  = generateToken(Personas.dave.id,  Personas.dave.email  ?? null);

  // Create a household with alice as owner and bob as member
  const hhRes = await pool.query<{ id: string }>(
    `INSERT INTO households (name, is_test_data) VALUES ('Test House', true) RETURNING id`
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

// ── Create list ───────────────────────────────────────────────────────────────

describe('POST /api/v1/lists (create)', () => {
  it('creates a general list', async () => {
    const res = await request(app)
      .post(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'My General List', listType: 'general' });
    expect(res.status).toBe(201);
    expect(res.body.list.name).toBe('My General List');
    expect(res.body.list.listType).toBe('general');
    expect(res.body.list.householdId).toBe(householdId);
    expect(res.body.list.errorCode).toBeUndefined();
  });

  it('creates a grocery list', async () => {
    const res = await request(app)
      .post(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Weekly Groceries', listType: 'grocery' });
    expect(res.status).toBe(201);
    expect(res.body.list.listType).toBe('grocery');
  });

  it('creates a todo list', async () => {
    const res = await request(app)
      .post(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Chores', listType: 'todo' });
    expect(res.status).toBe(201);
    expect(res.body.list.listType).toBe('todo');
  });

  it('returns 400 with SQIRL-LIST-CREATE-001 for missing name', async () => {
    const res = await request(app)
      .post(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ listType: 'general' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-LIST-CREATE-001');
  });

  it('returns 400 with SQIRL-LIST-CREATE-002 for invalid type', async () => {
    const res = await request(app)
      .post(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Bad', listType: 'wishlist' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-LIST-CREATE-002');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post(`${BASE}/lists`).send({ name: 'x', listType: 'general' });
    expect(res.status).toBe(401);
  });
});

// ── Get lists ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/lists', () => {
  it('alice sees household lists', async () => {
    const res = await request(app)
      .get(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.lists)).toBe(true);
    expect(res.body.lists.length).toBeGreaterThanOrEqual(3);
  });

  it('bob also sees the same household lists', async () => {
    const aliceLists = await request(app)
      .get(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const bobLists = await request(app)
      .get(`${BASE}/lists`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(bobLists.status).toBe(200);
    expect(bobLists.body.lists.length).toBe(aliceLists.body.lists.length);
  });

  it('dave sees no lists (outsider)', async () => {
    const res = await request(app)
      .get(`${BASE}/lists`)
      .set('Authorization', `Bearer ${daveToken}`);
    expect(res.status).toBe(200);
    expect(res.body.lists).toHaveLength(0);
  });
});

// ── Rename + delete list ──────────────────────────────────────────────────────

describe('PUT/DELETE /api/v1/lists/:id', () => {
  let listId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Rename Me', listType: 'general' });
    listId = res.body.list.id as string;
  });

  it('renames a list', async () => {
    const res = await request(app)
      .put(`${BASE}/lists/${listId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Renamed List' });
    expect(res.status).toBe(200);
    expect(res.body.list.name).toBe('Renamed List');
  });

  it('bob can also rename (household member)', async () => {
    const res = await request(app)
      .put(`${BASE}/lists/${listId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ name: 'Bob Renamed' });
    expect(res.status).toBe(200);
  });

  it('dave cannot rename (outsider) → 404 SQIRL-LIST-ACCESS-001', async () => {
    const res = await request(app)
      .put(`${BASE}/lists/${listId}`)
      .set('Authorization', `Bearer ${daveToken}`)
      .send({ name: 'Hack' });
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('SQIRL-LIST-ACCESS-001');
  });

  it('deletes a list', async () => {
    const res = await request(app)
      .delete(`${BASE}/lists/${listId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('deleted list no longer appears in GET /lists', async () => {
    const res = await request(app)
      .get(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const ids = (res.body.lists as { id: string }[]).map(l => l.id);
    expect(ids).not.toContain(listId);
  });
});

// ── List items ────────────────────────────────────────────────────────────────

describe('List items (General list)', () => {
  let listId: string;
  let itemId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Items Test List', listType: 'general' });
    listId = res.body.list.id as string;
  });

  it('adds an item with description only', async () => {
    const res = await request(app)
      .post(`${BASE}/lists/${listId}/items`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ description: 'Bread' });
    expect(res.status).toBe(201);
    expect(res.body.item.description).toBe('Bread');
    expect(res.body.item.isPurchased).toBe(false);
    itemId = res.body.item.id as string;
  });

  it('adds an item with all fields', async () => {
    const res = await request(app)
      .post(`${BASE}/lists/${listId}/items`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ description: 'Milk', packSize: '2L', unit: 'litre', quantity: 2 });
    expect(res.status).toBe(201);
    expect(res.body.item.packSize).toBe('2L');
    expect(res.body.item.unit).toBe('litre');
    expect(res.body.item.quantity).toBe(2);
  });

  it('returns 400 with SQIRL-LIST-ITEM-002 when description missing', async () => {
    const res = await request(app)
      .post(`${BASE}/lists/${listId}/items`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ packSize: '1kg' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-LIST-ITEM-002');
  });

  it('bob can add an item (household member)', async () => {
    const res = await request(app)
      .post(`${BASE}/lists/${listId}/items`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ description: 'Eggs' });
    expect(res.status).toBe(201);
  });

  it('gets all items sorted: unpurchased first, purchased last', async () => {
    const res = await request(app)
      .get(`${BASE}/lists/${listId}/items`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    // All should be unpurchased at this point
    const purchased = (res.body.items as { isPurchased: boolean }[]).filter(i => i.isPurchased);
    expect(purchased).toHaveLength(0);
  });

  it('marks an item as purchased', async () => {
    const res = await request(app)
      .put(`${BASE}/lists/${listId}/items/${itemId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ isPurchased: true });
    expect(res.status).toBe(200);
    expect(res.body.item.isPurchased).toBe(true);
  });

  it('purchased items appear last in GET items', async () => {
    const res = await request(app)
      .get(`${BASE}/lists/${listId}/items`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const items = res.body.items as { isPurchased: boolean }[];
    const firstPurchasedIdx = items.findIndex(i => i.isPurchased);
    const lastUnpurchasedIdx = items.map(i => i.isPurchased).lastIndexOf(false);
    if (firstPurchasedIdx !== -1 && lastUnpurchasedIdx !== -1) {
      expect(firstPurchasedIdx).toBeGreaterThan(lastUnpurchasedIdx);
    }
  });

  it('updates item description and unit', async () => {
    const res = await request(app)
      .put(`${BASE}/lists/${listId}/items/${itemId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ description: 'White Bread', unit: 'loaf' });
    expect(res.status).toBe(200);
    expect(res.body.item.description).toBe('White Bread');
    expect(res.body.item.unit).toBe('loaf');
  });

  it('deletes an item', async () => {
    const res = await request(app)
      .delete(`${BASE}/lists/${listId}/items/${itemId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('dave cannot add item to household list → 404', async () => {
    const res = await request(app)
      .post(`${BASE}/lists/${listId}/items`)
      .set('Authorization', `Bearer ${daveToken}`)
      .send({ description: 'Hack' });
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('SQIRL-LIST-ACCESS-001');
  });
});

// ── Move item ─────────────────────────────────────────────────────────────────

describe('PUT /api/v1/lists/items/:itemId/move', () => {
  let list1Id: string;
  let list2Id: string;
  let todoListId: string;
  let itemId: string;

  beforeAll(async () => {
    const [r1, r2, r3] = await Promise.all([
      request(app).post(`${BASE}/lists`).set('Authorization', `Bearer ${aliceToken}`).send({ name: 'Grocery A', listType: 'grocery' }),
      request(app).post(`${BASE}/lists`).set('Authorization', `Bearer ${aliceToken}`).send({ name: 'Grocery B', listType: 'grocery' }),
      request(app).post(`${BASE}/lists`).set('Authorization', `Bearer ${aliceToken}`).send({ name: 'Todos', listType: 'todo' }),
    ]);
    list1Id = r1.body.list.id as string;
    list2Id = r2.body.list.id as string;
    todoListId = r3.body.list.id as string;

    const addRes = await request(app)
      .post(`${BASE}/lists/${list1Id}/items`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ description: 'Apples' });
    itemId = addRes.body.item.id as string;
  });

  it('moves item to another grocery list', async () => {
    const res = await request(app)
      .put(`${BASE}/lists/items/${itemId}/move`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ targetListId: list2Id });
    expect(res.status).toBe(200);
    expect(res.body.item.listId).toBe(list2Id);
  });

  it('cannot move item to a list of different type → 400 SQIRL-LIST-ITEM-003', async () => {
    const res = await request(app)
      .put(`${BASE}/lists/items/${itemId}/move`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ targetListId: todoListId });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-LIST-ITEM-003');
  });
});

// ── Todo tasks ────────────────────────────────────────────────────────────────

describe('Todo tasks', () => {
  let listId: string;
  let taskId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'My Todos', listType: 'todo' });
    listId = res.body.list.id as string;
  });

  it('adds a task', async () => {
    const res = await request(app)
      .post(`${BASE}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'Clean kitchen', dueDate: '2026-12-31' });
    expect(res.status).toBe(201);
    expect(res.body.task.title).toBe('Clean kitchen');
    expect(res.body.task.dueDate).toBe('2026-12-31');
    expect(res.body.task.progress).toBe(0);
    expect(res.body.task.subtasks).toHaveLength(0);
    taskId = res.body.task.id as string;
  });

  it('returns 400 SQIRL-LIST-TASK-002 for missing title', async () => {
    const res = await request(app)
      .post(`${BASE}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ dueDate: '2026-12-31' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-LIST-TASK-002');
  });

  it('gets tasks with subtasks array', async () => {
    const res = await request(app)
      .get(`${BASE}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(res.body.tasks[0].subtasks).toBeDefined();
  });

  it('updates task title', async () => {
    const res = await request(app)
      .put(`${BASE}/lists/${listId}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'Deep clean kitchen' });
    expect(res.status).toBe(200);
    expect(res.body.task.title).toBe('Deep clean kitchen');
  });

  it('marks task complete via isCompleted', async () => {
    const res = await request(app)
      .put(`${BASE}/lists/${listId}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ isCompleted: true });
    expect(res.status).toBe(200);
    expect(res.body.task.isCompleted).toBe(true);
  });

  it('sets manual progress override', async () => {
    const res = await request(app)
      .put(`${BASE}/lists/${listId}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ useManualProgress: true, manualProgress: 60 });
    expect(res.status).toBe(200);
    expect(res.body.task.progress).toBe(60);
  });

  it('returns 400 SQIRL-LIST-TASK-003 for progress out of range', async () => {
    const res = await request(app)
      .put(`${BASE}/lists/${listId}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ manualProgress: 150 });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-LIST-TASK-003');
  });

  it('deletes a task', async () => {
    const res = await request(app)
      .delete(`${BASE}/lists/${listId}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Subtasks ──────────────────────────────────────────────────────────────────

describe('Todo subtasks', () => {
  let listId: string;
  let taskId: string;
  let subtaskId: string;

  beforeAll(async () => {
    const lRes = await request(app)
      .post(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Subtask Test', listType: 'todo' });
    listId = lRes.body.list.id as string;

    const tRes = await request(app)
      .post(`${BASE}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'Parent task', dueDate: '2026-06-30' });
    taskId = tRes.body.task.id as string;
  });

  it('adds a subtask', async () => {
    const res = await request(app)
      .post(`${BASE}/lists/${listId}/tasks/${taskId}/subtasks`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'Buy supplies', dueDate: '2026-06-15' });
    expect(res.status).toBe(201);
    expect(res.body.subtask.title).toBe('Buy supplies');
    subtaskId = res.body.subtask.id as string;
  });

  it('rejects subtask due date after task due date → 400 SQIRL-LIST-SUB-003', async () => {
    const res = await request(app)
      .post(`${BASE}/lists/${listId}/tasks/${taskId}/subtasks`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'Too late', dueDate: '2026-07-01' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-LIST-SUB-003');
  });

  it('returns 400 SQIRL-LIST-SUB-002 for missing title', async () => {
    const res = await request(app)
      .post(`${BASE}/lists/${listId}/tasks/${taskId}/subtasks`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ dueDate: '2026-06-01' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-LIST-SUB-002');
  });

  it('progress auto-computes from subtask completion', async () => {
    // Add second subtask
    await request(app)
      .post(`${BASE}/lists/${listId}/tasks/${taskId}/subtasks`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'Second sub' });

    // Complete first subtask
    await request(app)
      .put(`${BASE}/lists/${listId}/tasks/${taskId}/subtasks/${subtaskId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ isCompleted: true });

    const tasksRes = await request(app)
      .get(`${BASE}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const task = (tasksRes.body.tasks as { id: string; progress: number; useManualProgress: boolean }[]).find(t => t.id === taskId);
    expect(task?.useManualProgress).toBe(false);
    expect(task?.progress).toBe(50);
  });

  it('updates a subtask title', async () => {
    const res = await request(app)
      .put(`${BASE}/lists/${listId}/tasks/${taskId}/subtasks/${subtaskId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'Updated sub' });
    expect(res.status).toBe(200);
    expect(res.body.subtask.title).toBe('Updated sub');
  });

  it('rejects update if new due date exceeds task due date → 400 SQIRL-LIST-SUB-003', async () => {
    const res = await request(app)
      .put(`${BASE}/lists/${listId}/tasks/${taskId}/subtasks/${subtaskId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ dueDate: '2026-07-15' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-LIST-SUB-003');
  });

  it('deletes a subtask', async () => {
    const res = await request(app)
      .delete(`${BASE}/lists/${listId}/tasks/${taskId}/subtasks/${subtaskId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
