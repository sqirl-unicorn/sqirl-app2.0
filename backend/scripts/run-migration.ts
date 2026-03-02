/**
 * CLI migration runner.
 *
 * Reads all *.sql files in migrations/ in numeric order and executes them
 * against the configured DATABASE_URL. Each file is wrapped in a transaction
 * so a partial failure leaves the DB unchanged.
 *
 * Usage: ts-node scripts/run-migration.ts [--file 001-users.sql]
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { pool } from '../src/db';

const migrationsDir = path.join(__dirname, '..', 'migrations');

async function runMigration(filePath: string): Promise<void> {
  const sql = fs.readFileSync(filePath, 'utf8');
  const name = path.basename(filePath);
  console.log(`Running migration: ${name}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`  ✓ ${name} applied`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`  ✗ ${name} failed:`, err);
    throw err;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const targetFile = process.argv[2];

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !targetFile || f === targetFile);

  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  for (const file of files) {
    await runMigration(path.join(migrationsDir, file));
  }

  console.log('All migrations complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
