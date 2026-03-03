/**
 * Integration tests: Gift Cards routes
 *
 * Tests cover the full HTTP layer with a real Neon DB.
 * Personas: alice (household owner), bob (household member), dave (outsider)
 *
 * Flows tested:
 *  - Add a gift card (with balance, PIN, expiry)
 *  - Get gift cards (household-scoped visibility, active vs archived)
 *  - Update a gift card (card number, PIN, expiry, notes)
 *  - Update balance → transaction recorded, auto-archive on zero
 *  - Add spend transaction → balance deducted, auto-archive on zero
 *  - Add reload transaction → balance increases
 *  - Get transaction history for a card
 *  - Manually archive a card
 *  - Delete a gift card (soft-delete)
 *  - Error: add without brandId → SQIRL-GIFT-CREATE-001
 *  - Error: add without cardNumber → SQIRL-GIFT-CREATE-001
 *  - Error: add without balance → SQIRL-GIFT-CREATE-001
 *  - Error: invalid barcodeFormat → SQIRL-GIFT-CREATE-002
 *  - Error: update card not accessible → SQIRL-GIFT-ACCESS-001
 *  - Error: outsider cannot see household cards
 *  - Household member can edit card added by another member
 *  - Soft-delete: deleted card no longer appears in GET
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
let daveToken: string;
let householdId: string;

beforeAll(async () => {
  await connectTestDb();
  await cleanTestData();
  await createTestUsers(['alice', 'bob', 'dave']);

  aliceToken = generateToken(Personas.alice.id, Personas.alice.email ?? null);
  bobToken   = generateToken(Personas.bob.id,   Personas.bob.email   ?? null);
  daveToken  = generateToken(Personas.dave.id,  Personas.dave.email  ?? null);

  const hhRes = await pool.query<{ id: string }>(
    `INSERT INTO households (name, is_test_data) VALUES ('GC Test House', true) RETURNING id`
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
});

afterAll(() => teardownTestDb());

// ── Add card ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/gift-cards (add)', () => {
  it('alice adds a gift card with all fields', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        brandId: 'woolworths-gc-au',
        cardNumber: '9876543210',
        barcodeFormat: 'EAN13',
        balance: 50,
        pin: '1234',
        expiryDate: '2027-12-31',
        notes: 'Birthday gift',
      });
    expect(res.status).toBe(201);
    expect(res.body.card.brandId).toBe('woolworths-gc-au');
    expect(res.body.card.cardNumber).toBe('9876543210');
    expect(res.body.card.balance).toBe(50);
    expect(res.body.card.pin).toBe('1234');
    expect(res.body.card.expiryDate).toBe('2027-12-31');
    expect(res.body.card.isArchived).toBe(false);
    expect(res.body.card.householdId).toBe(householdId);
    expect(res.body.card.errorCode).toBeUndefined();
  });

  it('bob adds a gift card without PIN (Amazon-style)', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ brandId: 'amazon-au', cardNumber: 'AMZN-1111-2222', balance: 100 });
    expect(res.status).toBe(201);
    expect(res.body.card.pin).toBeNull();
    expect(res.body.card.balance).toBe(100);
    expect(res.body.card.barcodeFormat).toBe('CODE128');
  });

  it('rejects add without brandId → SQIRL-GIFT-CREATE-001', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ cardNumber: '123', balance: 25 });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-GIFT-CREATE-001');
  });

  it('rejects add without cardNumber → SQIRL-GIFT-CREATE-001', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'amazon-au', balance: 25 });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-GIFT-CREATE-001');
  });

  it('rejects add without balance → SQIRL-GIFT-CREATE-001', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'amazon-au', cardNumber: 'ABC123' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-GIFT-CREATE-001');
  });

  it('rejects invalid barcodeFormat → SQIRL-GIFT-CREATE-002', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'amazon-au', cardNumber: 'X1', balance: 10, barcodeFormat: 'INVALID' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-GIFT-CREATE-002');
  });

  it('rejects negative balance → SQIRL-GIFT-CREATE-003', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'amazon-au', cardNumber: 'X1', balance: -5 });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-GIFT-CREATE-003');
  });
});

// ── Get cards ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/gift-cards', () => {
  it('bob sees household cards (including alice\'s)', async () => {
    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.cards)).toBe(true);
    expect(res.body.cards.length).toBeGreaterThanOrEqual(2);
  });

  it('dave (outsider) sees no household cards', async () => {
    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${daveToken}`);
    expect(res.status).toBe(200);
    const hhCards = res.body.cards.filter((c: { householdId: string }) => c.householdId === householdId);
    expect(hhCards.length).toBe(0);
  });

  it('response does not include deleted cards', async () => {
    const addRes = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'steam-gc', cardNumber: 'STM-DEL', balance: 20 });
    const cardId = addRes.body.card.id;

    await request(app)
      .delete(`${BASE}/${cardId}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    const listRes = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${aliceToken}`);
    const found = listRes.body.cards.find((c: { id: string }) => c.id === cardId);
    expect(found).toBeUndefined();
  });
});

// ── Update card ───────────────────────────────────────────────────────────────

describe('PUT /api/v1/gift-cards/:cardId (edit)', () => {
  let cardId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'jbhifi-gc-au', cardNumber: 'JB-EDIT-001', balance: 75, pin: '9999' });
    cardId = res.body.card.id;
  });

  it('alice updates PIN and notes', async () => {
    const res = await request(app)
      .put(`${BASE}/${cardId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ pin: '1111', notes: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.card.pin).toBe('1111');
    expect(res.body.card.notes).toBe('Updated');
  });

  it('bob (member) can edit alice\'s card', async () => {
    const res = await request(app)
      .put(`${BASE}/${cardId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ notes: 'Bob updated this' });
    expect(res.status).toBe(200);
    expect(res.body.card.notes).toBe('Bob updated this');
  });

  it('dave cannot edit household card → SQIRL-GIFT-ACCESS-001', async () => {
    const res = await request(app)
      .put(`${BASE}/${cardId}`)
      .set('Authorization', `Bearer ${daveToken}`)
      .send({ notes: 'Hacked' });
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('SQIRL-GIFT-ACCESS-001');
  });
});

// ── Update balance ────────────────────────────────────────────────────────────

describe('PUT /api/v1/gift-cards/:cardId/balance', () => {
  let cardId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'kmart-gc-au', cardNumber: 'KM-BAL-001', balance: 100 });
    cardId = res.body.card.id;
  });

  it('alice sets new balance to 60 and a transaction is created', async () => {
    const res = await request(app)
      .put(`${BASE}/${cardId}/balance`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ newBalance: 60, note: 'Correcting balance' });
    expect(res.status).toBe(200);
    expect(res.body.card.balance).toBe(60);
    expect(res.body.transaction.type).toBe('balance_update');
    expect(res.body.transaction.balanceBefore).toBe(100);
    expect(res.body.transaction.balanceAfter).toBe(60);
    expect(res.body.card.isArchived).toBe(false);
  });

  it('setting balance to 0 auto-archives the card', async () => {
    const res = await request(app)
      .put(`${BASE}/${cardId}/balance`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ newBalance: 0 });
    expect(res.status).toBe(200);
    expect(res.body.card.balance).toBe(0);
    expect(res.body.card.isArchived).toBe(true);
  });

  it('rejects negative newBalance → SQIRL-GIFT-BAL-001', async () => {
    const res = await request(app)
      .put(`${BASE}/${cardId}/balance`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ newBalance: -10 });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-GIFT-BAL-001');
  });
});

// ── Add transaction ───────────────────────────────────────────────────────────

describe('POST /api/v1/gift-cards/:cardId/transactions', () => {
  let cardId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'bigw-gc-au', cardNumber: 'BW-TXN-001', balance: 200 });
    cardId = res.body.card.id;
  });

  it('alice records a spend of -50', async () => {
    const res = await request(app)
      .post(`${BASE}/${cardId}/transactions`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ amount: -50, transactionDate: '2026-01-15T10:00:00Z', location: 'Big W Parramatta' });
    expect(res.status).toBe(201);
    expect(res.body.card.balance).toBe(150);
    expect(res.body.transaction.type).toBe('spend');
    expect(res.body.transaction.amount).toBe(-50);
    expect(res.body.transaction.location).toBe('Big W Parramatta');
    expect(res.body.card.isArchived).toBe(false);
  });

  it('alice records a reload of +100', async () => {
    const res = await request(app)
      .post(`${BASE}/${cardId}/transactions`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ amount: 100, transactionDate: '2026-01-20T09:00:00Z', description: 'Top-up' });
    expect(res.status).toBe(201);
    expect(res.body.card.balance).toBe(250);
    expect(res.body.transaction.type).toBe('reload');
  });

  it('spending remaining balance auto-archives', async () => {
    const res = await request(app)
      .post(`${BASE}/${cardId}/transactions`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ amount: -250, transactionDate: '2026-01-25T15:00:00Z' });
    expect(res.status).toBe(201);
    expect(res.body.card.balance).toBe(0);
    expect(res.body.card.isArchived).toBe(true);
  });

  it('rejects transaction with zero amount → SQIRL-GIFT-TXN-001', async () => {
    const res = await request(app)
      .post(`${BASE}/${cardId}/transactions`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ amount: 0, transactionDate: '2026-01-01T00:00:00Z' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-GIFT-TXN-001');
  });

  it('rejects transaction without transactionDate → SQIRL-GIFT-TXN-002', async () => {
    const res = await request(app)
      .post(`${BASE}/${cardId}/transactions`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ amount: -10 });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-GIFT-TXN-002');
  });
});

// ── Get transaction history ───────────────────────────────────────────────────

describe('GET /api/v1/gift-cards/:cardId/transactions', () => {
  let cardId: string;

  beforeAll(async () => {
    const addRes = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'myer-gc-au', cardNumber: 'MY-HIST-001', balance: 50 });
    cardId = addRes.body.card.id;

    await request(app)
      .post(`${BASE}/${cardId}/transactions`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ amount: -10, transactionDate: '2026-02-01T10:00:00Z' });
    await request(app)
      .post(`${BASE}/${cardId}/transactions`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ amount: -5, transactionDate: '2026-02-05T10:00:00Z' });
  });

  it('alice retrieves 2 transactions in reverse chronological order', async () => {
    const res = await request(app)
      .get(`${BASE}/${cardId}/transactions`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.transactions.length).toBe(2);
    expect(new Date(res.body.transactions[0].transactionDate).getTime())
      .toBeGreaterThan(new Date(res.body.transactions[1].transactionDate).getTime());
  });

  it('dave cannot access household card transactions → SQIRL-GIFT-ACCESS-001', async () => {
    const res = await request(app)
      .get(`${BASE}/${cardId}/transactions`)
      .set('Authorization', `Bearer ${daveToken}`);
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('SQIRL-GIFT-ACCESS-001');
  });
});

// ── Archive ───────────────────────────────────────────────────────────────────

describe('PUT /api/v1/gift-cards/:cardId/archive', () => {
  it('alice manually archives a card', async () => {
    const addRes = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'target-gc-au', cardNumber: 'TG-ARCH-001', balance: 30 });
    const cardId = addRes.body.card.id;

    const res = await request(app)
      .put(`${BASE}/${cardId}/archive`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.card.isArchived).toBe(true);
  });

  it('archived card still appears in GET list', async () => {
    const listRes = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${aliceToken}`);
    const archived = listRes.body.cards.filter((c: { isArchived: boolean }) => c.isArchived === true);
    expect(archived.length).toBeGreaterThan(0);
  });
});

// ── Delete ────────────────────────────────────────────────────────────────────

describe('DELETE /api/v1/gift-cards/:cardId', () => {
  it('alice soft-deletes her card and it disappears from GET', async () => {
    const addRes = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'bunnings-gc', cardNumber: 'BUN-DEL-001', balance: 40 });
    const cardId = addRes.body.card.id;

    const delRes = await request(app)
      .delete(`${BASE}/${cardId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const listRes = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${aliceToken}`);
    const found = listRes.body.cards.find((c: { id: string }) => c.id === cardId);
    expect(found).toBeUndefined();
  });

  it('dave cannot delete household card → SQIRL-GIFT-ACCESS-001', async () => {
    const addRes = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'bigw-gc-au', cardNumber: 'BW-PROT-001', balance: 20 });
    const cardId = addRes.body.card.id;

    const res = await request(app)
      .delete(`${BASE}/${cardId}`)
      .set('Authorization', `Bearer ${daveToken}`);
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('SQIRL-GIFT-ACCESS-001');
  });
});
