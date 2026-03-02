/**
 * Integration test: health check endpoint + DB connectivity.
 *
 * Verifies the Express app starts and the DB pool can reach Neon.
 */

import request from 'supertest';
import app from '../../src/app';
import { connectTestDb, closeTestDb } from '../helpers/testSetup';

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  await closeTestDb(); // No test data created — just close the pool
});

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', version: '2.0.0' });
  });
});
