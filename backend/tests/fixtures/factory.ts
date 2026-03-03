/**
 * Test data factory for Sqirl test suite.
 *
 * Creates DB rows directly via pool (bypasses HTTP) for fast, deterministic setup.
 *
 * Rules (per CLAUDE.md):
 * - All user rows carry is_test_user: true
 * - Analytics MUST filter is_test_user = true — these are never real metrics
 * - Factory returns snake_case DB rows (the raw DB shape, not API camelCase)
 */

import bcrypt from 'bcrypt';
import { pool } from '../../src/db';
import { Personas, type PersonaDefinition, type PersonaKey } from './personas';

/** Cache hashed passwords to avoid bcrypt overhead on repeated calls per run */
const hashCache = new Map<string, string>();

/**
 * Hash a plain-text password, caching the result within the process.
 * @param plain - Plain-text password string
 * @returns bcrypt hash string
 */
async function hashPassword(plain: string): Promise<string> {
  if (!hashCache.has(plain)) {
    hashCache.set(plain, await bcrypt.hash(plain, 10));
  }
  return hashCache.get(plain)!;
}

/** Raw DB row shape after user creation (snake_case, matching DB columns) */
export interface TestUserRow {
  id: string;
  email: string | null;
  phone: string | null;
  first_name: string;
  country: string;
  password_hash: string;
  public_key: string;
  encrypted_private_key: string;
  salt: string;
  recovery_key_slots: string[] | null;
  is_test_user: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Create or upsert a test user row for the given persona.
 * ON CONFLICT (id) DO UPDATE ensures idempotency across test runs.
 *
 * @param persona - PersonaKey string or inline PersonaDefinition
 * @returns Inserted/updated DB row
 */
export async function createTestUser(
  persona: PersonaKey | PersonaDefinition
): Promise<TestUserRow> {
  // Cast to PersonaDefinition — satisfies guarantees compatibility but TS infers
  // narrower const types per-member, so we widen explicitly here.
  const p: PersonaDefinition = typeof persona === 'string' ? Personas[persona] : persona;
  const hash = await hashPassword(p.password);

  const result = await pool.query<TestUserRow>(
    `INSERT INTO users
       (id, email, phone, first_name, country, password_hash,
        public_key, encrypted_private_key, salt, is_test_user)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
     ON CONFLICT (id) DO UPDATE
       SET email        = EXCLUDED.email,
           phone        = EXCLUDED.phone,
           first_name   = EXCLUDED.first_name,
           is_test_user = true,
           updated_at   = NOW()
     RETURNING *`,
    [
      p.id,
      p.email ?? null,
      p.phone ?? null,
      p.firstName,
      p.country,
      hash,
      `test-pub-${p.id}`,
      `test-enc-priv-${p.id}`,
      `test-salt-${p.id}`,
    ]
  );
  return result.rows[0];
}

/**
 * Create multiple test users in parallel.
 * @param personas - Array of PersonaKey values to create
 * @returns Map of personaKey → TestUserRow
 */
export async function createTestUsers(
  personas: PersonaKey[]
): Promise<Map<PersonaKey, TestUserRow>> {
  const rows = await Promise.all(personas.map(createTestUser));
  return new Map(personas.map((key, i) => [key, rows[i]]));
}

/**
 * Delete all rows carrying is_test_user = true.
 * Nullifies non-cascading FK references to users before deleting to avoid constraint errors.
 * Call in afterEach / afterAll.
 */
export async function cleanTestData(): Promise<void> {
  // Nullify reviewer/granter FKs that reference users without ON DELETE CASCADE
  await pool.query(
    `UPDATE household_copy_requests SET reviewed_by_user_id = NULL
     WHERE reviewed_by_user_id IN (SELECT id FROM users WHERE is_test_user = true)`
  );
  await pool.query(
    `UPDATE household_copy_grants SET granted_by_user_id = NULL
     WHERE granted_by_user_id IN (SELECT id FROM users WHERE is_test_user = true)`
  );
  await pool.query(`DELETE FROM users WHERE is_test_user = true`);
}
