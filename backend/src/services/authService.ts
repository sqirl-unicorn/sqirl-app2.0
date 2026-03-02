/**
 * Auth Service — password hashing, JWT generation, and user DB operations.
 *
 * Zero-knowledge principle: this service never decrypts user data.
 * It stores and returns encrypted blobs as-is; all decryption happens client-side.
 *
 * Error codes used:
 *   SQIRL-SYS-CFG-001  JWT_SECRET not set
 *   SQIRL-AUTH-REG-001  Missing required fields
 *   SQIRL-AUTH-REG-002  Duplicate email
 *   SQIRL-AUTH-REG-003  Duplicate phone
 *   SQIRL-AUTH-LOGIN-001  Missing credentials
 *   SQIRL-AUTH-LOGIN-002  User not found / wrong password (intentionally same message)
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import type { JwtPayload } from '../middleware/auth';

const BCRYPT_ROUNDS = 10;

// ── Password helpers ─────────────────────────────────────────────────────────

/**
 * Hash a plain-text password using bcrypt.
 * @param plain - Raw password string
 * @returns bcrypt hash
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Compare a plain-text password against a bcrypt hash.
 * @param plain - Raw password to test
 * @param hash  - Stored bcrypt hash
 * @returns true if the password matches
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ── JWT helpers ──────────────────────────────────────────────────────────────

/**
 * Sign a JWT for the given user.
 * Throws SQIRL-SYS-CFG-001 if JWT_SECRET is not configured.
 *
 * @param userId - User's UUID
 * @param email  - User's email (null for phone-only accounts)
 * @returns Signed JWT string
 */
export function generateToken(userId: string, email: string | null): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('SQIRL-SYS-CFG-001: JWT_SECRET is not set');

  return jwt.sign({ userId, email } satisfies JwtPayload, secret, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Decode and verify a JWT without throwing.
 * @returns Decoded payload or null if invalid / expired
 */
export function decodeToken(token: string): JwtPayload | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
}

// ── DB types ─────────────────────────────────────────────────────────────────

export interface RegisterParams {
  email?: string;
  phone?: string;
  firstName: string;
  passwordHash: string;
  publicKey: string;
  encryptedPrivateKey: string;
  salt: string;
  country: string;
  recoveryKeySlots?: string[];
}

export interface UserRow {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  country: string;
  publicKey: string;
  encryptedPrivateKey: string;
  salt: string;
  recoveryKeySlots: string[] | null;
  isAdmin: boolean;
  isTestUser: boolean;
  createdAt: string;
}

// ── DB operations ─────────────────────────────────────────────────────────────

/**
 * Insert a new user row and return the camelCase user object.
 * Throws structured errors on constraint violations.
 */
export async function createUser(params: RegisterParams): Promise<UserRow> {
  const result = await pool.query(
    `INSERT INTO users
       (email, phone, first_name, password_hash, public_key,
        encrypted_private_key, salt, country, recovery_key_slots)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, email, phone, first_name, country, public_key,
               encrypted_private_key, salt, recovery_key_slots,
               is_admin, is_test_user, created_at`,
    [
      params.email ?? null,
      params.phone ?? null,
      params.firstName,
      params.passwordHash,
      params.publicKey,
      params.encryptedPrivateKey,
      params.salt,
      params.country,
      params.recoveryKeySlots ? JSON.stringify(params.recoveryKeySlots) : null,
    ]
  );
  return rowToUser(result.rows[0]);
}

/**
 * Find a user by email OR phone. Returns null if not found.
 * Also returns passwordHash for login verification (never sent to client).
 */
export async function findUserForLogin(
  email?: string,
  phone?: string
): Promise<(UserRow & { passwordHash: string }) | null> {
  const result = await pool.query(
    `SELECT id, email, phone, first_name, country, public_key,
            encrypted_private_key, salt, recovery_key_slots,
            is_admin, is_test_user, created_at, password_hash
     FROM users
     WHERE (email = $1 AND $1 IS NOT NULL)
        OR (phone = $2 AND $2 IS NOT NULL)
     LIMIT 1`,
    [email ?? null, phone ?? null]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return { ...rowToUser(row), passwordHash: row.password_hash as string };
}

/**
 * Fetch a user by ID. Returns null if not found.
 */
export async function findUserById(id: string): Promise<UserRow | null> {
  const result = await pool.query(
    `SELECT id, email, phone, first_name, country, public_key,
            encrypted_private_key, salt, recovery_key_slots,
            is_admin, is_test_user, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0) return null;
  return rowToUser(result.rows[0]);
}

/**
 * Update a user's recovery key slots (5 encrypted masterKey blobs).
 */
export async function saveRecoveryKeySlots(
  userId: string,
  slots: string[]
): Promise<void> {
  await pool.query(
    `UPDATE users SET recovery_key_slots = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(slots), userId]
  );
}

/**
 * Update user's profile fields (firstName, country).
 */
export async function updateUserProfile(
  userId: string,
  fields: { firstName?: string; country?: string }
): Promise<UserRow | null> {
  const sets: string[] = ['updated_at = NOW()'];
  const values: (string | null)[] = [];
  let idx = 1;

  if (fields.firstName !== undefined) {
    sets.push(`first_name = $${idx++}`);
    values.push(fields.firstName);
  }
  if (fields.country !== undefined) {
    sets.push(`country = $${idx++}`);
    values.push(fields.country);
  }

  values.push(userId);

  const result = await pool.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}
     RETURNING id, email, phone, first_name, country, public_key,
               encrypted_private_key, salt, recovery_key_slots,
               is_admin, is_test_user, created_at`,
    values
  );
  if (result.rows.length === 0) return null;
  return rowToUser(result.rows[0]);
}

// ── Row mapper ───────────────────────────────────────────────────────────────

/**
 * Convert a raw DB row (snake_case) to camelCase UserRow.
 * Called at every DB → API boundary to enforce casing rules.
 */
function rowToUser(row: Record<string, unknown>): UserRow {
  return {
    id: row.id as string,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    firstName: row.first_name as string,
    country: row.country as string,
    publicKey: row.public_key as string,
    encryptedPrivateKey: row.encrypted_private_key as string,
    salt: row.salt as string,
    recoveryKeySlots: (row.recovery_key_slots as string[] | null) ?? null,
    isAdmin: row.is_admin as boolean,
    isTestUser: row.is_test_user as boolean,
    createdAt: row.created_at as string,
  };
}
