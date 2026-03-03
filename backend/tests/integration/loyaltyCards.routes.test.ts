/**
 * Integration tests: Loyalty Cards routes
 *
 * Tests cover the full HTTP layer with a real Neon DB.
 * Personas: alice (household owner), bob (household member), dave (outsider)
 *
 * Flows tested:
 *  - Add a loyalty card (household member)
 *  - Get loyalty cards (household-scoped visibility)
 *  - Update a loyalty card (any household member)
 *  - Delete a loyalty card (any household member)
 *  - Error: add without brandId → SQIRL-LOYAL-CREATE-001
 *  - Error: add without cardNumber → SQIRL-LOYAL-CREATE-001
 *  - Error: invalid barcodeFormat → SQIRL-LOYAL-CREATE-002
 *  - Error: update card not in household → SQIRL-LOYAL-ACCESS-001
 *  - Error: delete card not in household → SQIRL-LOYAL-ACCESS-001
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

const BASE = '/api/v1/loyalty-cards';

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
    `INSERT INTO households (name, is_test_data) VALUES ('LC Test House', true) RETURNING id`
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

describe('POST /api/v1/loyalty-cards (add)', () => {
  it('alice adds a CODE128 card', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'woolworths-au', cardNumber: '9876543210', barcodeFormat: 'CODE128' });
    expect(res.status).toBe(201);
    expect(res.body.card.brandId).toBe('woolworths-au');
    expect(res.body.card.cardNumber).toBe('9876543210');
    expect(res.body.card.barcodeFormat).toBe('CODE128');
    expect(res.body.card.householdId).toBe(householdId);
    expect(res.body.card.errorCode).toBeUndefined();
  });

  it('bob adds a QR card', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ brandId: 'target-us', cardNumber: 'QR-12345', barcodeFormat: 'QR' });
    expect(res.status).toBe(201);
    expect(res.body.card.barcodeFormat).toBe('QR');
    expect(res.body.card.householdId).toBe(householdId);
  });

  it('adds card with optional notes', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'coles-au', cardNumber: '555555', barcodeFormat: 'EAN13', notes: 'My Coles card' });
    expect(res.status).toBe(201);
    expect(res.body.card.notes).toBe('My Coles card');
  });

  it('adds card with clientId for offline sync', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'jbhifi-au', cardNumber: '111222', barcodeFormat: 'CODE128', clientId: 'offline-client-001' });
    expect(res.status).toBe(201);
    expect(res.body.card.clientId).toBe('offline-client-001');
  });

  it('rejects missing brandId → SQIRL-LOYAL-CREATE-001', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ cardNumber: '123', barcodeFormat: 'CODE128' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-LOYAL-CREATE-001');
  });

  it('rejects missing cardNumber → SQIRL-LOYAL-CREATE-001', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'woolworths-au', barcodeFormat: 'CODE128' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-LOYAL-CREATE-001');
  });

  it('rejects invalid barcodeFormat → SQIRL-LOYAL-CREATE-002', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'woolworths-au', cardNumber: '123', barcodeFormat: 'INVALID' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-LOYAL-CREATE-002');
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post(BASE)
      .send({ brandId: 'woolworths-au', cardNumber: '123', barcodeFormat: 'CODE128' });
    expect(res.status).toBe(401);
  });
});

// ── Get cards ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/loyalty-cards', () => {
  it('alice sees all household cards (including ones bob added)', async () => {
    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    const cards = res.body.cards as { brandId: string }[];
    expect(cards.length).toBeGreaterThanOrEqual(2);
    const brandIds = cards.map((c) => c.brandId);
    expect(brandIds).toContain('woolworths-au');
    expect(brandIds).toContain('target-us');
  });

  it('bob sees same household cards as alice', async () => {
    const aliceRes = await request(app).get(BASE).set('Authorization', `Bearer ${aliceToken}`);
    const bobRes   = await request(app).get(BASE).set('Authorization', `Bearer ${bobToken}`);
    expect(bobRes.status).toBe(200);
    const aliceIds = (aliceRes.body.cards as { id: string }[]).map((c) => c.id).sort();
    const bobIds   = (bobRes.body.cards   as { id: string }[]).map((c) => c.id).sort();
    expect(bobIds).toEqual(aliceIds);
  });

  it('dave (outsider) gets empty list', async () => {
    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${daveToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cards).toEqual([]);
  });

  it('requires authentication', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });
});

// ── Update card ───────────────────────────────────────────────────────────────

describe('PUT /api/v1/loyalty-cards/:cardId', () => {
  let cardId: string;

  beforeAll(async () => {
    // Alice adds a card for update tests
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'myer-au', cardNumber: 'MYER-111', barcodeFormat: 'CODE128' });
    cardId = res.body.card.id;
  });

  it('alice updates cardNumber', async () => {
    const res = await request(app)
      .put(`${BASE}/${cardId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ cardNumber: 'MYER-999' });
    expect(res.status).toBe(200);
    expect(res.body.card.cardNumber).toBe('MYER-999');
  });

  it('bob (member) can update alices card', async () => {
    const res = await request(app)
      .put(`${BASE}/${cardId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ notes: 'Updated by Bob' });
    expect(res.status).toBe(200);
    expect(res.body.card.notes).toBe('Updated by Bob');
  });

  it('dave (outsider) cannot update → SQIRL-LOYAL-ACCESS-001', async () => {
    const res = await request(app)
      .put(`${BASE}/${cardId}`)
      .set('Authorization', `Bearer ${daveToken}`)
      .send({ cardNumber: 'HACK' });
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('SQIRL-LOYAL-ACCESS-001');
  });

  it('rejects invalid barcodeFormat on update → SQIRL-LOYAL-CREATE-002', async () => {
    const res = await request(app)
      .put(`${BASE}/${cardId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ barcodeFormat: 'WRONG' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-LOYAL-CREATE-002');
  });
});

// ── Delete card ───────────────────────────────────────────────────────────────

describe('DELETE /api/v1/loyalty-cards/:cardId', () => {
  let cardId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'priceline-au', cardNumber: 'PL-777', barcodeFormat: 'CODE128' });
    cardId = res.body.card.id;
  });

  it('dave (outsider) cannot delete → SQIRL-LOYAL-ACCESS-001', async () => {
    const res = await request(app)
      .delete(`${BASE}/${cardId}`)
      .set('Authorization', `Bearer ${daveToken}`);
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('SQIRL-LOYAL-ACCESS-001');
  });

  it('bob (member) can delete alices card', async () => {
    const res = await request(app)
      .delete(`${BASE}/${cardId}`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('deleted card no longer appears in GET', async () => {
    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${aliceToken}`);
    const ids = (res.body.cards as { id: string }[]).map((c) => c.id);
    expect(ids).not.toContain(cardId);
  });

  it('delete non-existent card → SQIRL-LOYAL-ACCESS-001', async () => {
    const res = await request(app)
      .delete(`${BASE}/00000000-0000-0000-0000-999999999999`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('SQIRL-LOYAL-ACCESS-001');
  });
});
