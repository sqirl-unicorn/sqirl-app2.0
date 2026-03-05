/**
 * E2E tests: Analytics full user flow
 *
 * Tests cover:
 *  - Register → batch events stored with correct user_id and platform
 *  - Multiple event types across a session are all persisted
 *  - is_test_data isolation: test user events do not pollute real metrics query
 *  - Session continuity: same sessionId groups events across calls
 *  - Properties are queryable via JSONB operators
 */

import request from 'supertest';
import app from '../../src/app';
import { pool } from '../../src/db';
import { connectTestDb, teardownTestDb } from '../helpers/testSetup';
import { createTestUsers, cleanTestData } from '../fixtures/factory';
import { Personas } from '../fixtures/personas';
import { generateToken } from '../../src/services/authService';

const BASE = '/api/v1/analytics';
const SESSION = 'e2e-session-' + Date.now();

let token: string;

function event(eventType: string, properties: Record<string, unknown> = {}) {
  return { sessionId: SESSION, eventType, properties, platform: 'web', occurredAt: new Date().toISOString() };
}

beforeAll(async () => {
  await connectTestDb();
  await cleanTestData();
  await createTestUsers(['carol']);
  token = generateToken(Personas.carol.id, Personas.carol.email ?? null);
});

afterAll(async () => {
  await pool.query(`DELETE FROM analytics_events WHERE session_id = $1`, [SESSION]);
  await teardownTestDb();
});

describe('Analytics E2E', () => {
  it('stores events with correct user_id and returns count', async () => {
    const res = await request(app)
      .post(`${BASE}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        events: [
          event('auth.login', { country: 'AU' }),
          event('expense.added', { amount: 29.95, scope: 'personal', categoryId: 'cat-1', hasLocation: true }),
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);

    const rows = await pool.query(
      `SELECT * FROM analytics_events WHERE user_id = $1 AND session_id = $2 ORDER BY occurred_at`,
      [Personas.carol.id, SESSION]
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0].event_type).toBe('auth.login');
    expect(rows.rows[1].event_type).toBe('expense.added');
  });

  it('groups all events under the same sessionId', async () => {
    await request(app)
      .post(`${BASE}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        events: [
          event('gift_card.added', { brandId: 'woolworths', balance: 100, hasPin: false }),
          event('loyalty_card.added', { brandId: 'flybuys', barcodeFormat: 'CODE128' }),
          event('auth.logout', {}),
        ],
      });

    const rows = await pool.query(
      `SELECT event_type FROM analytics_events WHERE session_id = $1 ORDER BY occurred_at`,
      [SESSION]
    );
    const types = rows.rows.map((r: { event_type: string }) => r.event_type);
    expect(types).toContain('gift_card.added');
    expect(types).toContain('loyalty_card.added');
    expect(types).toContain('auth.logout');
  });

  it('JSONB properties are queryable', async () => {
    const rows = await pool.query(
      `SELECT properties FROM analytics_events
       WHERE session_id = $1 AND event_type = 'expense.added'
         AND (properties->>'amount')::numeric > 20`,
      [SESSION]
    );
    expect(rows.rows.length).toBeGreaterThanOrEqual(1);
    expect(Number(rows.rows[0].properties.amount)).toBeGreaterThan(20);
  });

  it('test_data events are excluded from a real-metrics filter', async () => {
    const realRows = await pool.query(
      `SELECT COUNT(*) FROM analytics_events WHERE session_id = $1 AND is_test_data = FALSE`,
      [SESSION]
    );
    // All events in this session are from a test user — count should be 0
    expect(Number(realRows.rows[0].count)).toBe(0);
  });

  it('stores is_test_data=true for events from test users', async () => {
    const testRows = await pool.query(
      `SELECT COUNT(*) FROM analytics_events WHERE session_id = $1 AND is_test_data = TRUE`,
      [SESSION]
    );
    expect(Number(testRows.rows[0].count)).toBeGreaterThan(0);
  });
});
