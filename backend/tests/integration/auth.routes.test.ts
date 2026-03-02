/**
 * Integration tests: POST /api/v1/auth/register and /login
 *
 * Uses a real DB (Neon) — test users are tagged is_test_user: true
 * and cleaned up in afterAll.
 */

import request from 'supertest';
import app from '../../src/app';
import { connectTestDb, teardownTestDb, cleanTestDomain } from '../helpers/testSetup';
import { Personas } from '../fixtures/personas';

const BASE = '/api/v1/auth';

/** Minimal valid registration payload */
const aliceReg = {
  email: Personas.alice.email,
  firstName: Personas.alice.firstName,
  password: Personas.alice.password,
  publicKey: 'test-pub-key',
  encryptedPrivateKey: 'test-enc-priv-key',
  salt: 'test-salt',
  country: 'AU',
};

beforeAll(async () => {
  await connectTestDb();
  await cleanTestDomain(); // Remove any leftover from interrupted prior runs
});
afterAll(() => teardownTestDb());

// ── Registration ─────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  it('registers a new email user → 201 with token + encrypted blobs', async () => {
    const res = await request(app).post(`${BASE}/register`).send(aliceReg);
    expect(res.status).toBe(201);
    expect(res.body.tokens.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe(Personas.alice.email);
    expect(res.body.user.firstName).toBe(Personas.alice.firstName);
    expect(res.body.user.country).toBe('AU');
    // Server must not leak sensitive fields
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.encryptedPrivateKey).toBeUndefined();
  });

  it('registers a phone-only user → 201', async () => {
    const res = await request(app).post(`${BASE}/register`).send({
      phone: Personas.frank.phone,
      firstName: Personas.frank.firstName,
      password: Personas.frank.password,
      publicKey: 'test-pub',
      encryptedPrivateKey: 'test-enc',
      salt: 'test-salt',
      country: 'AU',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.phone).toBe(Personas.frank.phone);
    expect(res.body.user.email).toBeNull();
  });

  it('accepts optional recoveryKeySlots array (5 items) → 201', async () => {
    const res = await request(app).post(`${BASE}/register`).send({
      email: 'slots-test@test.sqirl.net',
      firstName: 'Slot',
      password: 'SlotPass123!',
      publicKey: 'pk',
      encryptedPrivateKey: 'epk',
      salt: 'sl',
      country: 'AU',
      recoveryKeySlots: ['a', 'b', 'c', 'd', 'e'],
    });
    expect(res.status).toBe(201);
  });

  it('returns 400 SQIRL-AUTH-REG-001 when firstName is missing', async () => {
    const { firstName: _f, ...payload } = aliceReg;
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ ...payload, email: 'nofirstname@test.sqirl.net' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-AUTH-REG-001');
  });

  it('returns 400 SQIRL-AUTH-REG-001 when neither email nor phone provided', async () => {
    const { email: _e, ...payload } = aliceReg;
    const res = await request(app).post(`${BASE}/register`).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-AUTH-REG-001');
  });

  it('returns 400 SQIRL-AUTH-REG-001 when password is missing', async () => {
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ email: 'nopass@test.sqirl.net', firstName: 'X', publicKey: 'k', encryptedPrivateKey: 'e', salt: 's', country: 'AU' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-AUTH-REG-001');
  });

  it('returns 409 SQIRL-AUTH-REG-002 for duplicate email', async () => {
    // alice was registered in the first test
    const res = await request(app).post(`${BASE}/register`).send(aliceReg);
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('SQIRL-AUTH-REG-002');
  });

  it('returns 409 SQIRL-AUTH-REG-003 for duplicate phone', async () => {
    const phonePayload = {
      phone: '+61412000099',
      firstName: 'Dup',
      password: 'DupPass123!',
      publicKey: 'pk',
      encryptedPrivateKey: 'epk',
      salt: 'sl',
      country: 'AU',
    };
    await request(app).post(`${BASE}/register`).send(phonePayload);
    const res = await request(app).post(`${BASE}/register`).send(phonePayload);
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('SQIRL-AUTH-REG-003');
  });

  it('defaults country to AU when not provided', async () => {
    const { country: _c, ...payload } = aliceReg;
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ ...payload, email: 'nocount@test.sqirl.net' });
    expect(res.status).toBe(201);
    expect(res.body.user.country).toBe('AU');
  });
});

// ── Login ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  it('logs in with email + password → 200 with token and encrypted blobs', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: aliceReg.email, password: aliceReg.password });
    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toBeTruthy();
    expect(res.body.encryptedPrivateKey).toBeTruthy();
    expect(res.body.salt).toBeTruthy();
  });

  it('logs in with phone + password → 200', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ phone: Personas.frank.phone, password: Personas.frank.password });
    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toBeTruthy();
  });

  it('returns 401 SQIRL-AUTH-LOGIN-002 for wrong password', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: aliceReg.email, password: 'WrongPass!' });
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('SQIRL-AUTH-LOGIN-002');
  });

  it('returns 401 SQIRL-AUTH-LOGIN-002 for unknown email', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: 'nobody@test.sqirl.net', password: 'X' });
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('SQIRL-AUTH-LOGIN-002');
  });

  it('returns 400 SQIRL-AUTH-LOGIN-001 when no identifier provided', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ password: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-AUTH-LOGIN-001');
  });
});

// ── Verify token ─────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/verify', () => {
  it('returns user for a valid token', async () => {
    const loginRes = await request(app)
      .post(`${BASE}/login`)
      .send({ email: aliceReg.email, password: aliceReg.password });

    const res = await request(app)
      .get(`${BASE}/verify`)
      .set('Authorization', `Bearer ${loginRes.body.tokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(aliceReg.email);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await request(app)
      .get(`${BASE}/verify`)
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });
});
