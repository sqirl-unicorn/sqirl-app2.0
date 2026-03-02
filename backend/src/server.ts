/**
 * HTTP server entry point.
 *
 * Loads env, starts the Express app on PORT, and verifies DB connectivity.
 * Not imported by tests — tests import app.ts directly.
 */

import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { pool } from './db';

const PORT = Number(process.env.PORT ?? 3000);

async function start(): Promise<void> {
  // Verify DB connectivity before accepting traffic
  try {
    await pool.query('SELECT 1');
    console.log('DB connected');
  } catch (err) {
    console.error('SQIRL-SYS-DB-001: DB connection failed on startup', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Sqirl API v2 listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('SQIRL-SYS-START-001: Unexpected startup error', err);
  process.exit(1);
});
