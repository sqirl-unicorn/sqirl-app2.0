/**
 * Integration tests: Analytics routes (/api/v1/analytics)
 *
 * Tests cover:
 *  - POST /events requires authentication
 *  - POST /events rejects empty array
 *  - POST /events rejects oversized batch
 *  - POST /events inserts valid events and returns count
 *  - POST /events skips events with missing eventType
 *  - POST /events skips events with invalid platform
 *  - POST /events rejects if no valid events remain after filtering
 *  - POST /events sets is_test_data=true for test users
 */

import request from 'supertest';
import app from '../../src/app';
import { pool } from '../../src/db';
import { connectTestDb, teardownTestDb } from '../helpers/testSetup';
import { createTestUsers, cleanTestData } from '../fixtures/factory';
import { Personas } from '../fixtures/personas';
import { generateToken } from '../../src/services/authService';

const BASE = '/api/v1/analytics';

let aliceToken: string;

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'sess-test-001',
    eventType: 'expense.added',
    properties: { amount: 42.5, scope: 'personal', categoryId: 'cat-1' },
    platform: 'web',
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeAll(async () => {
  await connectTestDb();
  await cleanTestData();
  await createTestUsers(['alice']);
  aliceToken = generateToken(Personas.alice.id, Personas.alice.email ?? null);
});

afterAll(() => teardownTestDb());

afterEach(async () => {
  await pool.query(`DELETE FROM analytics_events WHERE is_test_data = TRUE`);
});

// ── Authentication ────────────────────────────────────────────────────────────

describe('POST /analytics/events — auth', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post(`${BASE}/events`)
      .send({ events: [makeEvent()] });
    expect(res.status).toBe(401);
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('POST /analytics/events — validation', () => {
  it('returns 400 for empty events array', async () => {
    const res = await request(app)
      .post(`${BASE}/events`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ events: [] });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-ANALYTIC-001');
  });

  it('returns 400 when events is not an array', async () => {
    const res = await request(app)
      .post(`${BASE}/events`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ events: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-ANALYTIC-001');
  });

  it('returns 400 for batch exceeding max size', async () => {
    const events = Array.from({ length: 201 }, () => makeEvent());
    const res = await request(app)
      .post(`${BASE}/events`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ events });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-ANALYTIC-002');
  });

  it('returns 400 when all events have missing eventType', async () => {
    const res = await request(app)
      .post(`${BASE}/events`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ events: [makeEvent({ eventType: '' })] });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-ANALYTIC-003');
  });

  it('returns 400 when all events have invalid platform', async () => {
    const res = await request(app)
      .post(`${BASE}/events`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ events: [makeEvent({ platform: 'smartwatch' })] });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-ANALYTIC-003');
  });
});

// ── Success ───────────────────────────────────────────────────────────────────

describe('POST /analytics/events — success', () => {
  it('inserts a batch and returns count', async () => {
    const events = [
      makeEvent({ eventType: 'expense.added', properties: { amount: 15.99, scope: 'personal' } }),
      makeEvent({ eventType: 'gift_card.added', properties: { brandId: 'woolworths', balance: 50 } }),
    ];
    const res = await request(app)
      .post(`${BASE}/events`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ events });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it('strips PII from stored properties', async () => {
    const res = await request(app)
      .post(`${BASE}/events`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        events: [makeEvent({ properties: { amount: 10, email: 'should-be-stripped@test.com', cardNumber: '12345' } })],
      });
    expect(res.status).toBe(200);

    const row = await pool.query(
      `SELECT properties FROM analytics_events WHERE user_id = $1 ORDER BY received_at DESC LIMIT 1`,
      [Personas.alice.id]
    );
    expect(row.rows[0].properties).not.toHaveProperty('email');
    expect(row.rows[0].properties).not.toHaveProperty('cardNumber');
    expect(row.rows[0].properties.amount).toBe(10);
  });

  it('marks events as is_test_data=true for test users', async () => {
    await request(app)
      .post(`${BASE}/events`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ events: [makeEvent()] });

    const row = await pool.query(
      `SELECT is_test_data FROM analytics_events WHERE user_id = $1 ORDER BY received_at DESC LIMIT 1`,
      [Personas.alice.id]
    );
    expect(row.rows[0].is_test_data).toBe(true);
  });

  it('skips invalid events in a mixed batch and inserts valid ones', async () => {
    const events = [
      makeEvent({ eventType: 'auth.login' }),
      makeEvent({ eventType: '' }),            // invalid — skipped
      makeEvent({ platform: 'toaster' }),      // invalid — skipped
      makeEvent({ eventType: 'auth.logout' }),
    ];
    const res = await request(app)
      .post(`${BASE}/events`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ events });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });
});
