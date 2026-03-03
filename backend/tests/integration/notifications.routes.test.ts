/**
 * Integration tests: Notification routes
 *
 * GET  /api/v1/notifications           — list, optional ?unread=true
 * PUT  /api/v1/notifications/:id/read  — mark one read
 * PUT  /api/v1/notifications/read-all  — mark all read
 * GET  /api/v1/notifications/unread-count — badge count
 */

import request from 'supertest';
import app from '../../src/app';
import { connectTestDb, teardownTestDb } from '../helpers/testSetup';
import { createTestUsers, cleanTestData } from '../fixtures/factory';
import { Personas } from '../fixtures/personas';
import { generateToken } from '../../src/services/authService';
import { createNotification } from '../../src/services/notificationService';
import { pool } from '../../src/db';

const BASE = '/api/v1/notifications';

let aliceToken: string;
let notificationId: string;

beforeAll(async () => {
  await connectTestDb();
  await cleanTestData();
  await createTestUsers(['alice']);

  aliceToken = generateToken(Personas.alice.id, Personas.alice.email ?? null);

  // Seed two notifications for alice
  await createNotification(
    Personas.alice.id,
    'household_invitation_received',
    'New Invitation',
    'Bob invited you to join a household',
    { invitationId: 'test-invite-id' },
    true
  );
  await createNotification(
    Personas.alice.id,
    'household_member_joined',
    'New Member',
    'Carol joined the household',
    { householdId: 'test-hh-id' },
    true
  );

  // Fetch the notification id
  const res = await pool.query(
    `SELECT id FROM notifications WHERE user_id = $1 ORDER BY created_at LIMIT 1`,
    [Personas.alice.id]
  );
  notificationId = res.rows[0].id as string;
});

afterAll(() => teardownTestDb());

// ── GET /notifications ────────────────────────────────────────────────────────

describe('GET /api/v1/notifications', () => {
  it('returns all notifications for alice → 200', async () => {
    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(2);
    expect(res.body.notifications[0].userId).toBe(Personas.alice.id);
  });

  it('returns only unread when ?unread=true', async () => {
    const res = await request(app)
      .get(`${BASE}?unread=true`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.notifications.every((n: { read: boolean }) => !n.read)).toBe(true);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });
});

// ── GET /notifications/unread-count ──────────────────────────────────────────

describe('GET /api/v1/notifications/unread-count', () => {
  it('returns unread count → 200', async () => {
    const res = await request(app)
      .get(`${BASE}/unread-count`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.unreadCount).toBe('number');
    expect(res.body.unreadCount).toBeGreaterThan(0);
  });
});

// ── PUT /notifications/:id/read ───────────────────────────────────────────────

describe('PUT /api/v1/notifications/:id/read', () => {
  it('marks one notification as read → 200', async () => {
    const res = await request(app)
      .put(`${BASE}/${notificationId}/read`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
  });

  it('notification is now read', async () => {
    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${aliceToken}`);
    const target = (res.body.notifications as { id: string; read: boolean }[])
      .find((n) => n.id === notificationId);
    expect(target?.read).toBe(true);
  });
});

// ── PUT /notifications/read-all ───────────────────────────────────────────────

describe('PUT /api/v1/notifications/read-all', () => {
  it('marks all notifications as read → 200', async () => {
    const res = await request(app)
      .put(`${BASE}/read-all`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
  });

  it('no unread notifications remain', async () => {
    const res = await request(app)
      .get(`${BASE}?unread=true`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.body.notifications).toHaveLength(0);
  });

  it('unread count is 0', async () => {
    const res = await request(app)
      .get(`${BASE}/unread-count`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.body.unreadCount).toBe(0);
  });
});
