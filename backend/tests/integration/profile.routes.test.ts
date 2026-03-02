/**
 * Integration tests: GET/PUT /api/v1/profile and recovery key endpoints.
 */

import request from 'supertest';
import app from '../../src/app';
import { connectTestDb, teardownTestDb, cleanTestDomain } from '../helpers/testSetup';
import { createTestUser } from '../fixtures/factory';

const BASE = '/api/v1/profile';
let authToken: string;
let userId: string;

beforeAll(async () => {
  await connectTestDb();
  await cleanTestDomain(); // Remove leftovers from interrupted prior runs
  // Register alice via HTTP so we get a real JWT
  const reg = await request(app).post('/api/v1/auth/register').send({
    email: 'alice-profile@test.sqirl.net',
    firstName: 'Alice',
    password: 'AlicePass123!',
    publicKey: 'pk',
    encryptedPrivateKey: 'epk',
    salt: 'sl',
    country: 'AU',
  });
  authToken = reg.body.tokens.accessToken as string;
  userId = reg.body.user.id as string;
  void userId; // assigned for potential future use
});

afterAll(() => teardownTestDb());

describe('GET /api/v1/profile', () => {
  it('returns the current user profile', async () => {
    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('alice-profile@test.sqirl.net');
    expect(res.body.firstName).toBe('Alice');
    expect(res.body.country).toBe('AU');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/v1/profile', () => {
  it('updates firstName and country', async () => {
    const res = await request(app)
      .put(BASE)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ firstName: 'Alicia', country: 'NZ' });
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Alicia');
    expect(res.body.country).toBe('NZ');
  });

  it('returns 400 SQIRL-PROFILE-001 for invalid country code', async () => {
    const res = await request(app)
      .put(BASE)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ country: 'ZZ' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-PROFILE-001');
  });
});

describe('GET /api/v1/profile/countries', () => {
  it('returns a list of countries', async () => {
    const res = await request(app)
      .get(`${BASE}/countries`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.countries)).toBe(true);
    expect(res.body.countries.length).toBeGreaterThan(10);
  });
});

describe('PUT /api/v1/profile/recovery-keys', () => {
  it('saves 5 recovery key slots', async () => {
    const res = await request(app)
      .put(`${BASE}/recovery-keys`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ slots: ['enc1', 'enc2', 'enc3', 'enc4', 'enc5'] });
    expect(res.status).toBe(200);
    expect(res.body.hasRecoveryKeys).toBe(true);
  });

  it('returns 400 SQIRL-RECOVERY-001 when slots is not exactly 5 items', async () => {
    const res = await request(app)
      .put(`${BASE}/recovery-keys`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ slots: ['a', 'b', 'c'] });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('SQIRL-RECOVERY-001');
  });
});

describe('GET /api/v1/profile/recovery-keys', () => {
  it('returns hasRecoveryKeys: true after setup', async () => {
    const res = await request(app)
      .get(`${BASE}/recovery-keys`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.hasRecoveryKeys).toBe(true);
    // Slots themselves are not returned in status check — privacy
    expect(res.body.slots).toBeUndefined();
  });
});

describe('createTestUser factory', () => {
  it('sets is_test_user: true on every created row', async () => {
    const row = await createTestUser('bob');
    expect(row.is_test_user).toBe(true);
  });
});
