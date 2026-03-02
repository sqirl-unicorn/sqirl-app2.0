/**
 * Test data factory for Sqirl test suite.
 *
 * Provides typed builder functions that create DB rows via the pool directly
 * (bypassing HTTP) for fast, deterministic test setup.
 *
 * Rules (per CLAUDE.md):
 * - All created records carry is_test_data: true
 * - is_test_user: true on every user row — analytics MUST filter these out
 * - Factory functions propagate is_test_data to all child records automatically
 * - Factories return fully-typed objects matching the DB schema (snake_case)
 */

import bcrypt from 'bcrypt';
import { pool } from '../../src/db';
import { Personas, type PersonaDefinition, type PersonaKey } from './personas';

/** Hashed passwords cache — avoid bcrypt overhead on repeated calls */
const hashCache = new Map<string, string>();

/**
 * Hash a plain-text password, using a cache to avoid re-hashing the same value.
 * @param plain - Plain-text password
 * @returns Bcrypt hash string
 */
async function hashPassword(plain: string): Promise<string> {
  if (!hashCache.has(plain)) {
    hashCache.set(plain, await bcrypt.hash(plain, 10));
  }
  return hashCache.get(plain)!;
}

/** DB row shape returned after user creation */
export interface TestUser {
  id: string;
  email: string;
  name: string;
  country: string;
  password_hash: string;
  public_key: string;
  encrypted_private_key: string;
  salt: string;
  is_test_user: boolean;
  created_at: Date;
}

/**
 * Create a test user row for the given persona.
 * Uses INSERT … ON CONFLICT DO UPDATE so tests are idempotent.
 *
 * @param persona - PersonaKey or inline PersonaDefinition
 * @returns Inserted/updated user row
 */
export async function createTestUser(
  persona: PersonaKey | PersonaDefinition
): Promise<TestUser> {
  const p = typeof persona === 'string' ? Personas[persona] : persona;
  const hash = await hashPassword(p.password);

  const result = await pool.query<TestUser>(
    `INSERT INTO users (id, email, name, country, password_hash, public_key,
        encrypted_private_key, salt, is_test_user)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           name  = EXCLUDED.name,
           is_test_user = true
     RETURNING *`,
    [
      p.id,
      p.email,
      p.name,
      p.country,
      hash,
      'test-public-key-' + p.id,
      'test-encrypted-private-key-' + p.id,
      'test-salt-' + p.id,
    ]
  );
  return result.rows[0];
}

/**
 * Create multiple test users in parallel.
 * @param personas - Array of persona keys to create
 * @returns Map of personaKey → TestUser
 */
export async function createTestUsers(
  personas: PersonaKey[]
): Promise<Map<PersonaKey, TestUser>> {
  const users = await Promise.all(personas.map(createTestUser));
  return new Map(personas.map((key, i) => [key, users[i]]));
}

/**
 * Delete all test data created by this factory.
 * Cascades via FK constraints — order matters.
 * Call in afterEach / afterAll to keep the DB clean between test runs.
 */
export async function cleanTestData(): Promise<void> {
  await pool.query(`DELETE FROM users WHERE is_test_user = true`);
}
