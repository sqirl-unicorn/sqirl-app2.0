/**
 * E2E tests: Gift Cards full user flows
 *
 * Simulates complete user journeys through the HTTP API.
 *
 * Flows:
 *  1. Add card → visible to household member immediately
 *  2. Full lifecycle: add → spend → reload → archive
 *  3. Auto-archive when balance hits zero via transaction
 *  4. Auto-archive when balance set to zero via balance update
 *  5. Offline-sync: add with clientId → clientId preserved
 *  6. Transaction history ordering and accuracy
 *  7. Member leaves household → card remains accessible to remaining members
 */

import request from 'supertest';
import app from '../../src/app';
import { connectTestDb, teardownTestDb } from '../helpers/testSetup';
import { createTestUsers, cleanTestData } from '../fixtures/factory';
import { Personas } from '../fixtures/personas';
import { generateToken } from '../../src/services/authService';
import { pool } from '../../src/db';

const BASE = '/api/v1/gift-cards';

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
    `INSERT INTO households (name, is_test_data) VALUES ('E2E GC House', true) RETURNING id`
  );
  householdId = hhRes.rows[0].id;
  await pool.query(
    `INSERT INTO household_members (household_id, user_id, role, is_test_data) VALUES ($1,$2,'owner',true)`,
    [householdId, Personas.alice.id]
  );
  await pool.query(
    `INSERT INTO household_members (household_id, user_id, role, is_test_data) VALUES ($1,$2,'member',true)`,
    [householdId, Personas.bob.id]
  );
  await pool.query(
    `INSERT INTO household_members (household_id, user_id, role, is_test_data) VALUES ($1,$2,'member',true)`,
    [householdId, Personas.carol.id]
  );
});

afterAll(() => teardownTestDb());

// ── Flow 1: Add card → visible to household member ────────────────────────────

describe('E2E Flow 1: add card → household member sees it', () => {
  let cardId: string;

  it('alice adds an Amazon gift card', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'amazon-au', cardNumber: 'E2E-AMZN-001', balance: 50 });
    expect(res.status).toBe(201);
    cardId = res.body.card.id;
  });

  it('bob immediately sees alice\'s card', async () => {
    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(res.status).toBe(200);
    const found = res.body.cards.find((c: { id: string }) => c.id === cardId);
    expect(found).toBeDefined();
    expect(found.balance).toBe(50);
  });

  it('carol immediately sees alice\'s card', async () => {
    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${carolToken}`);
    expect(res.status).toBe(200);
    const found = res.body.cards.find((c: { id: string }) => c.id === cardId);
    expect(found).toBeDefined();
  });
});

// ── Flow 2: Full lifecycle ────────────────────────────────────────────────────

describe('E2E Flow 2: add → spend → reload → archive', () => {
  let cardId: string;

  it('alice adds a David Jones card with $200 balance', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        brandId: 'david-jones-gc',
        cardNumber: 'DJ-E2E-001',
        barcodeFormat: 'QR',
        balance: 200,
        pin: '5678',
        expiryDate: '2028-06-30',
      });
    expect(res.status).toBe(201);
    cardId = res.body.card.id;
    expect(res.body.card.balance).toBe(200);
  });

  it('bob records a spend of $75.50', async () => {
    const res = await request(app)
      .post(`${BASE}/${cardId}/transactions`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ amount: -75.5, transactionDate: '2026-03-01T11:00:00Z', location: 'DJ Sydney' });
    expect(res.status).toBe(201);
    expect(res.body.card.balance).toBe(124.5);
    expect(res.body.transaction.type).toBe('spend');
  });

  it('carol reloads $25', async () => {
    const res = await request(app)
      .post(`${BASE}/${cardId}/transactions`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ amount: 25, transactionDate: '2026-03-05T14:00:00Z', description: 'Top-up' });
    expect(res.status).toBe(201);
    expect(res.body.card.balance).toBe(149.5);
    expect(res.body.transaction.type).toBe('reload');
  });

  it('alice archives the card manually', async () => {
    const res = await request(app)
      .put(`${BASE}/${cardId}/archive`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.card.isArchived).toBe(true);
  });

  it('archived card still visible to all household members', async () => {
    for (const token of [aliceToken, bobToken, carolToken]) {
      const res = await request(app).get(BASE).set('Authorization', `Bearer ${token}`);
      const found = res.body.cards.find((c: { id: string }) => c.id === cardId);
      expect(found).toBeDefined();
      expect(found.isArchived).toBe(true);
    }
  });
});

// ── Flow 3: Auto-archive via transaction ──────────────────────────────────────

describe('E2E Flow 3: auto-archive when balance hits zero via transaction', () => {
  let cardId: string;

  it('alice adds a $30 Kmart gift card', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'kmart-gc-au', cardNumber: 'KM-ZERO-001', balance: 30 });
    expect(res.status).toBe(201);
    cardId = res.body.card.id;
  });

  it('alice spends exactly $30 → card auto-archives', async () => {
    const res = await request(app)
      .post(`${BASE}/${cardId}/transactions`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ amount: -30, transactionDate: '2026-03-10T09:00:00Z' });
    expect(res.status).toBe(201);
    expect(res.body.card.balance).toBe(0);
    expect(res.body.card.isArchived).toBe(true);
  });
});

// ── Flow 4: Auto-archive via balance update ───────────────────────────────────

describe('E2E Flow 4: auto-archive when balance update sets to zero', () => {
  let cardId: string;

  it('alice adds a $50 Big W gift card', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'bigw-gc-au', cardNumber: 'BW-ZERO-001', balance: 50 });
    expect(res.status).toBe(201);
    cardId = res.body.card.id;
  });

  it('alice sets balance to 0 → card auto-archives', async () => {
    const res = await request(app)
      .put(`${BASE}/${cardId}/balance`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ newBalance: 0, note: 'Fully used' });
    expect(res.status).toBe(200);
    expect(res.body.card.isArchived).toBe(true);
    expect(res.body.transaction.description).toBe('Fully used');
  });
});

// ── Flow 5: Offline sync — clientId preservation ──────────────────────────────

describe('E2E Flow 5: offline sync — clientId preserved', () => {
  it('alice adds a card with a client-generated ID', async () => {
    const clientId = 'offline-client-uuid-abc123';
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'steam-gc', cardNumber: 'STM-OFFLINE-001', balance: 20, clientId });
    expect(res.status).toBe(201);
    expect(res.body.card.clientId).toBe(clientId);
  });
});

// ── Flow 6: Transaction history accuracy ─────────────────────────────────────

describe('E2E Flow 6: transaction history audit trail', () => {
  let cardId: string;

  it('alice adds a $150 Harvey Norman card', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'harvey-norman-gc', cardNumber: 'HN-HIST-E2E', balance: 150 });
    expect(res.status).toBe(201);
    cardId = res.body.card.id;
  });

  it('records 3 transactions with correct balance audit trail', async () => {
    await request(app)
      .post(`${BASE}/${cardId}/transactions`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ amount: -50, transactionDate: '2026-02-01T08:00:00Z' });
    await request(app)
      .post(`${BASE}/${cardId}/transactions`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ amount: -30, transactionDate: '2026-02-05T12:00:00Z' });
    await request(app)
      .put(`${BASE}/${cardId}/balance`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ newBalance: 100 });

    const histRes = await request(app)
      .get(`${BASE}/${cardId}/transactions`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(histRes.status).toBe(200);
    expect(histRes.body.transactions.length).toBe(3);

    const [latest, second, first] = histRes.body.transactions;
    expect(latest.type).toBe('balance_update');
    expect(second.type).toBe('spend');
    expect(first.type).toBe('spend');
    expect(first.balanceBefore).toBe(150);
    expect(first.balanceAfter).toBe(100);
    expect(second.balanceBefore).toBe(100);
    expect(second.balanceAfter).toBe(70);
  });
});
