/**
 * E2E tests: Loyalty Cards full user flows
 *
 * Simulates complete user journeys through the HTTP API.
 *
 * Flows:
 *  1. Register → login → add loyalty card → verify visible to household member
 *  2. Add multiple cards → list all → edit one → delete one → verify final state
 *  3. Offline-sync flow: add with clientId → verify clientId preserved in response
 *  4. Household member real-time sharing: alice adds, bob sees immediately
 *  5. Member leaves household → their cards remain (household_id keeps them shared)
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
let householdId: string;

beforeAll(async () => {
  await connectTestDb();
  await cleanTestData();
  await createTestUsers(['alice', 'bob']);

  aliceToken = generateToken(Personas.alice.id, Personas.alice.email ?? null);
  bobToken   = generateToken(Personas.bob.id,   Personas.bob.email   ?? null);

  const hhRes = await pool.query<{ id: string }>(
    `INSERT INTO households (name, is_test_data) VALUES ('E2E LC House', true) RETURNING id`
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

// ── Flow 1: Add card → visible to household member ────────────────────────────

describe('E2E Flow 1: add card → household member sees it', () => {
  let cardId: string;

  it('alice adds a Woolworths Rewards card', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'woolworths-au', cardNumber: '9000000001234', barcodeFormat: 'EAN13' });
    expect(res.status).toBe(201);
    cardId = res.body.card.id;
    expect(res.body.card.addedByUserId).toBe(Personas.alice.id);
  });

  it('bob immediately sees alices card', async () => {
    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(res.status).toBe(200);
    const ids = (res.body.cards as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(cardId);
  });
});

// ── Flow 2: Add multiple → list → edit → delete → verify ─────────────────────

describe('E2E Flow 2: full CRUD lifecycle', () => {
  let flybuysId: string;
  let myerId: string;

  it('alice adds Flybuys and Myer One cards', async () => {
    const fb = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'coles-au', cardNumber: 'FB-001', barcodeFormat: 'CODE128' });
    expect(fb.status).toBe(201);
    flybuysId = fb.body.card.id;

    const my = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'myer-au', cardNumber: 'MY-002', barcodeFormat: 'CODE128' });
    expect(my.status).toBe(201);
    myerId = my.body.card.id;
  });

  it('list includes both cards', async () => {
    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${aliceToken}`);
    const ids = (res.body.cards as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(flybuysId);
    expect(ids).toContain(myerId);
  });

  it('alice updates Myer One card number and barcode format', async () => {
    const res = await request(app)
      .put(`${BASE}/${myerId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ cardNumber: 'MY-NEW-99', barcodeFormat: 'QR' });
    expect(res.status).toBe(200);
    expect(res.body.card.cardNumber).toBe('MY-NEW-99');
    expect(res.body.card.barcodeFormat).toBe('QR');
  });

  it('alice deletes Flybuys card', async () => {
    const res = await request(app)
      .delete(`${BASE}/${flybuysId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
  });

  it('list no longer contains Flybuys but still has Myer', async () => {
    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${aliceToken}`);
    const ids = (res.body.cards as { id: string }[]).map((c) => c.id);
    expect(ids).not.toContain(flybuysId);
    expect(ids).toContain(myerId);
  });
});

// ── Flow 3: Offline-sync clientId round-trip ──────────────────────────────────

describe('E2E Flow 3: offline clientId round-trip', () => {
  it('clientId is preserved through add and returned in list', async () => {
    const clientId = 'device-abc-offline-001';
    const addRes = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ brandId: 'target-us', cardNumber: 'TGT-OFFLINE', barcodeFormat: 'QR', clientId });
    expect(addRes.status).toBe(201);
    expect(addRes.body.card.clientId).toBe(clientId);

    const listRes = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${aliceToken}`);
    const found = (listRes.body.cards as { clientId: string | null; brandId: string }[])
      .find((c) => c.brandId === 'target-us' && c.clientId === clientId);
    expect(found).toBeDefined();
  });
});

// ── Flow 4: Real-time sharing ─────────────────────────────────────────────────

describe('E2E Flow 4: real-time household sharing', () => {
  it('bob adds a card and alice sees it immediately', async () => {
    const addRes = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ brandId: 'tesco-gb', cardNumber: 'TESCO-BOB-123', barcodeFormat: 'CODE128' });
    expect(addRes.status).toBe(201);
    const cardId = addRes.body.card.id;

    const listRes = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${aliceToken}`);
    const ids = (listRes.body.cards as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(cardId);
  });

  it('alice edits bobs card and bob sees the change', async () => {
    // Get bobs card
    const listRes = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${bobToken}`);
    const bobCard = (listRes.body.cards as { brandId: string; id: string }[])
      .find((c) => c.brandId === 'tesco-gb');
    expect(bobCard).toBeDefined();

    const editRes = await request(app)
      .put(`${BASE}/${bobCard!.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ notes: 'Updated by alice' });
    expect(editRes.status).toBe(200);

    const bobList = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${bobToken}`);
    const updated = (bobList.body.cards as { id: string; notes: string | null }[])
      .find((c) => c.id === bobCard!.id);
    expect(updated?.notes).toBe('Updated by alice');
  });
});
