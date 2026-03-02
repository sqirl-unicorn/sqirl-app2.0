/**
 * Global test setup/teardown helpers.
 *
 * Import in jest.setup or individual test files as needed.
 * Ensures:
 * - DB pool is alive before tests run
 * - All test data is cleaned up after each suite
 * - is_test_user / is_test_data filters are always in effect
 */

import { pool } from '../../src/db';
import { cleanTestData } from '../fixtures/factory';

/**
 * Verify DB connectivity. Call in beforeAll of integration/e2e suites.
 * Throws with SQIRL-SYS-DB-001 if pool cannot reach the database.
 */
export async function connectTestDb(): Promise<void> {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    throw new Error(
      `SQIRL-SYS-DB-001: Cannot connect to test database. Check DATABASE_URL in .env. Original: ${String(err)}`
    );
  }
}

/**
 * Tear down test data and close the DB pool.
 * Call in afterAll of integration/e2e suites that create test data.
 */
export async function teardownTestDb(): Promise<void> {
  await cleanTestData();
  await pool.end();
}

/**
 * Close the DB pool without deleting test data.
 * Use in suites that only read (e.g., health checks) or when migrations
 * haven't run yet and the users table doesn't exist.
 */
export async function closeTestDb(): Promise<void> {
  await pool.end();
}
