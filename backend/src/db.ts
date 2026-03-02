/**
 * PostgreSQL connection pool — Neon hosted.
 *
 * Exports a single `pool` instance used across all services and routes.
 * SSL is always enforced; Neon requires it.
 *
 * Error code: SQIRL-SYS-DB-001 (connection failure)
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

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
