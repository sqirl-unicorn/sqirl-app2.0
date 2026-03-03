/**
 * Global test setup/teardown helpers.
 *
 * Ensures DB connectivity, cleans test data before/after suites.
 * Two cleanup strategies:
 *   cleanTestData()     — deletes rows with is_test_user = true (factory-created)
 *   cleanTestDomain()   — deletes rows with test email/phone patterns (HTTP-registered)
 * teardownTestDb() runs both.
 */

import { pool } from '../../src/db';
import { cleanTestData } from '../fixtures/factory';

/**
 * Verify DB connectivity. Throws SQIRL-SYS-DB-001 if unreachable.
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
 * Delete users created via HTTP during tests (email ends in @test.sqirl.net
 * or phone starts with +61412000). Handles leftovers from interrupted runs.
 * Removes FK-dependent copy-request reviewer references first.
 */
export async function cleanTestDomain(): Promise<void> {
  // Nullify non-cascading FKs before deleting users to avoid constraint violations
  await pool.query(
    `UPDATE household_copy_requests SET reviewed_by_user_id = NULL
     WHERE reviewed_by_user_id IN (
       SELECT id FROM users WHERE email LIKE '%@test.sqirl.net' OR phone LIKE '+61412000%'
     )`
  );
  await pool.query(
    `UPDATE household_copy_grants SET granted_by_user_id = NULL
     WHERE granted_by_user_id IN (
       SELECT id FROM users WHERE email LIKE '%@test.sqirl.net' OR phone LIKE '+61412000%'
     )`
  );
  await pool.query(
    `DELETE FROM users
     WHERE email LIKE '%@test.sqirl.net'
        OR phone LIKE '+61412000%'`
  );
}

/**
 * Tear down all test data (factory rows + HTTP-registered test users) and close pool.
 * Call in afterAll of integration/e2e suites.
 */
export async function teardownTestDb(): Promise<void> {
  await cleanTestDomain();
  await cleanTestData();
  await pool.end();
}

/**
 * Close the DB pool without deleting test data.
 * Use in read-only suites (e.g. health check).
 */
export async function closeTestDb(): Promise<void> {
  await pool.end();
}
