/**
 * Integration tests: WebSocket broadcast on route mutations
 *
 * Verifies that mutation routes call `broadcast` / `broadcastToUser` with the
 * correct arguments after a successful DB write. The actual WebSocket module is
 * mocked so no real socket connections are needed — we only assert that the
 * broadcast helpers are called with the expected arguments.
 *
 * Personas: alice (household owner), bob (household member)
 */

import { jest } from '@jest/globals';

// ── Mock wsServer BEFORE any routes are loaded ────────────────────────────────
const broadcastMock = jest.fn<() => void>();
const broadcastToUserMock = jest.fn<() => void>();

jest.mock('../../src/ws/wsServer', () => ({
  broadcast: broadcastMock,
  broadcastToUser: broadcastToUserMock,
  _testHooks: {},
  init: jest.fn(),
}));

import request from 'supertest';
import app from '../../src/app';
import { connectTestDb, teardownTestDb } from '../helpers/testSetup';
import { createTestUsers, cleanTestData } from '../fixtures/factory';
import { Personas } from '../fixtures/personas';
import { generateToken } from '../../src/services/authService';
import { pool } from '../../src/db';

const BASE = '/api/v1';

let aliceToken: string;
let householdId: string;

beforeAll(async () => {
  await connectTestDb();
  await cleanTestData();
  await createTestUsers(['alice', 'bob']);

  aliceToken = generateToken(Personas.alice.id, Personas.alice.email ?? null);

  // Create a household with alice as owner and bob as member
  const hhRes = await pool.query<{ id: string }>(
    `INSERT INTO households (name, is_test_data) VALUES ('Broadcast Test House', true) RETURNING id`
  );
  householdId = hhRes.rows[0].id;
  await pool.query(
    `INSERT INTO household_members (household_id, user_id, role, is_test_data)
     VALUES ($1, $2, 'owner', true), ($1, $3, 'member', true)`,
    [householdId, Personas.alice.id, Personas.bob.id]
  );
});

afterAll(async () => {
  await cleanTestData();
  await teardownTestDb();
});

beforeEach(() => {
  broadcastMock.mockClear();
  broadcastToUserMock.mockClear();
});

// ── Lists ─────────────────────────────────────────────────────────────────────

describe('lists routes — broadcast', () => {
  let listId: string;

  it('POST /lists calls broadcast with lists:changed', async () => {
    const res = await request(app)
      .post(`${BASE}/lists`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Broadcast List', listType: 'general' });

    expect(res.status).toBe(201);
    expect(broadcastMock).toHaveBeenCalledWith('lists:changed', Personas.alice.id, householdId);
    listId = res.body.list.id as string;
  });

  it('PUT /lists/:listId calls broadcast with lists:changed', async () => {
    const res = await request(app)
      .put(`${BASE}/lists/${listId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Renamed List' });

    expect(res.status).toBe(200);
    expect(broadcastMock).toHaveBeenCalledWith('lists:changed', Personas.alice.id, householdId);
  });

  it('DELETE /lists/:listId calls broadcast with lists:changed', async () => {
    const res = await request(app)
      .delete(`${BASE}/lists/${listId}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    // Delete uses async getUserHhId — wait a tick for the promise to resolve
    await new Promise((r) => setTimeout(r, 50));
    expect(broadcastMock).toHaveBeenCalledWith('lists:changed', Personas.alice.id, householdId);
  });
});

// ── Loyalty Cards ─────────────────────────────────────────────────────────────

describe('loyaltyCards routes — broadcast', () => {
  let cardId: string;

  it('POST /loyalty-cards calls broadcast with loyaltyCards:changed', async () => {
    const res = await request(app)
      .post(`${BASE}/loyalty-cards`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'woolworths-au', cardNumber: 'BROADCAST123', barcodeFormat: 'CODE128' });

    expect(res.status).toBe(201);
    expect(broadcastMock).toHaveBeenCalledWith(
      'loyaltyCards:changed',
      Personas.alice.id,
      householdId
    );
    cardId = res.body.card.id as string;
  });

  it('PUT /loyalty-cards/:cardId calls broadcast with loyaltyCards:changed', async () => {
    const res = await request(app)
      .put(`${BASE}/loyalty-cards/${cardId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ notes: 'updated notes' });

    expect(res.status).toBe(200);
    expect(broadcastMock).toHaveBeenCalledWith(
      'loyaltyCards:changed',
      Personas.alice.id,
      householdId
    );
  });

  it('DELETE /loyalty-cards/:cardId calls broadcast with loyaltyCards:changed', async () => {
    const res = await request(app)
      .delete(`${BASE}/loyalty-cards/${cardId}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(broadcastMock).toHaveBeenCalledWith(
      'loyaltyCards:changed',
      Personas.alice.id,
      householdId
    );
  });
});

// ── Gift Cards ────────────────────────────────────────────────────────────────

describe('giftCards routes — broadcast', () => {
  let cardId: string;

  it('POST /gift-cards calls broadcast with giftCards:changed', async () => {
    const res = await request(app)
      .post(`${BASE}/gift-cards`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        brandId: 'woolworths-au',
        cardNumber: 'GIFTBROADCAST1',
        balance: 50,
        barcodeFormat: 'CODE128',
      });

    expect(res.status).toBe(201);
    expect(broadcastMock).toHaveBeenCalledWith('giftCards:changed', Personas.alice.id, householdId);
    cardId = res.body.card.id as string;
  });

  it('PUT /gift-cards/:cardId/balance calls broadcast with giftCards:changed', async () => {
    const res = await request(app)
      .put(`${BASE}/gift-cards/${cardId}/balance`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ newBalance: 30 });

    expect(res.status).toBe(200);
    expect(broadcastMock).toHaveBeenCalledWith('giftCards:changed', Personas.alice.id, householdId);
  });

  it('DELETE /gift-cards/:cardId calls broadcast with giftCards:changed', async () => {
    const res = await request(app)
      .delete(`${BASE}/gift-cards/${cardId}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(broadcastMock).toHaveBeenCalledWith('giftCards:changed', Personas.alice.id, householdId);
  });
});

// ── Expenses ──────────────────────────────────────────────────────────────────

describe('expenses routes — broadcast', () => {
  let expenseId: string;
  // Grocery system category UUID
  const GROCERY_CATEGORY_ID = '00000000-0000-ec00-0000-000000000002';

  it('POST /expenses calls broadcast with expenses:changed', async () => {
    const res = await request(app)
      .post(`${BASE}/expenses`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        scope: 'personal',
        categoryId: GROCERY_CATEGORY_ID,
        amount: 25.50,
        description: 'Broadcast test expense',
        expenseDate: '2026-03-01',
      });

    expect(res.status).toBe(201);
    // Assign before asserting so later tests have the id even if this assertion fails
    expenseId = res.body.expense.id as string;
    // personal scope → householdId is null → broadcast receives undefined (null ?? undefined)
    expect(broadcastMock).toHaveBeenCalledWith('expenses:changed', Personas.alice.id, undefined);
  });

  it('PUT /expenses/:id calls broadcast with expenses:changed', async () => {
    const res = await request(app)
      .put(`${BASE}/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ description: 'Updated broadcast expense' });

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    // PUT uses resolveHousehold which finds alice's household
    expect(broadcastMock).toHaveBeenCalledWith('expenses:changed', Personas.alice.id, householdId);
  });

  it('DELETE /expenses/:id calls broadcast with expenses:changed', async () => {
    const res = await request(app)
      .delete(`${BASE}/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    // DELETE uses resolveHousehold which finds alice's household
    expect(broadcastMock).toHaveBeenCalledWith('expenses:changed', Personas.alice.id, householdId);
  });
});

// ── Notifications ─────────────────────────────────────────────────────────────

describe('notifications routes — broadcastToUser', () => {
  let notifId: string;

  beforeAll(async () => {
    // Seed a notification for alice
    const r = await pool.query<{ id: string }>(
      `INSERT INTO notifications (user_id, type, title, message, is_test_data)
       VALUES ($1, 'household_name_changed', 'Test', 'Test', true) RETURNING id`,
      [Personas.alice.id]
    );
    notifId = r.rows[0].id;
  });

  it('PUT /notifications/:id/read calls broadcastToUser with notifications:changed', async () => {
    const res = await request(app)
      .put(`${BASE}/notifications/${notifId}/read`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(broadcastToUserMock).toHaveBeenCalledWith('notifications:changed', Personas.alice.id);
    expect(broadcastMock).not.toHaveBeenCalled();
  });

  it('PUT /notifications/read-all calls broadcastToUser with notifications:changed', async () => {
    const res = await request(app)
      .put(`${BASE}/notifications/read-all`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(broadcastToUserMock).toHaveBeenCalledWith('notifications:changed', Personas.alice.id);
  });
});
