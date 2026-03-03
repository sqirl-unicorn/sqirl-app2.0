/**
 * PostgreSQL connection pool — Neon hosted.
 *
 * Exports a single `pool` instance used across all services and routes.
 * SSL is always enforced; Neon requires it.
 *
 * Error code: SQIRL-SYS-DB-001 (connection failure)
 */

import { Pool, types } from 'pg';
import dotenv from 'dotenv';

// Parse DATE columns as plain strings (YYYY-MM-DD) rather than JavaScript Date
// objects. Without this, pg converts DATE to a local-time JS Date which shifts
// the value by the server's UTC offset when serialised to ISO string.
// OID 1082 = DATE, OID 1114 = TIMESTAMP WITHOUT TIME ZONE
types.setTypeParser(1082, (val: string) => val);

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('SQIRL-SYS-DB-001: DATABASE_URL is not set in environment');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon uses self-signed cert on pooler
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('SQIRL-SYS-DB-002: Unexpected DB pool error', err.message);
});
