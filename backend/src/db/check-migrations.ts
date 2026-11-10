import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import 'dotenv/config';
import { pendingMigrations } from './migration-status.js';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required. No database was checked.');
    process.exitCode = 1;
    return;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000, statement_timeout: 10_000, max: 1 });
  pool.on('error', () => {
    console.error('Database connection failed during migration verification.');
    process.exitCode = 1;
  });
  try {
    const files = (await fs.readdir(fileURLToPath(new URL('./migrations/', import.meta.url))))
      .filter(file => file.endsWith('.sql')).sort();
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const pending = await pendingMigrations(client, files);
      await client.query('COMMIT');
      if (pending.length) {
        console.error(`Deployment blocked: ${pending.length} unapplied migration(s):\n${pending.join('\n')}`);
        process.exitCode = 1;
      } else {
        console.log(`Migration history is current (${files.length} expected migrations).`);
      }
    } finally {
      // Closing the connection also rolls back if a read failed mid-transaction.
      client.release(true);
    }
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  // Driver/configuration errors can contain credentials. Do not print the raw error.
  console.error('Migration verification failed. Check database connectivity, read permissions and migration files. No migrations were applied.');
  process.exitCode = 1;
});
