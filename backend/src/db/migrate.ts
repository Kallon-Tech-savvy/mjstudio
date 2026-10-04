import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function executeSqlFile(filePath: string) {
  const sql = await fs.readFile(filePath, 'utf8');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [741029]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const existing = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [path.basename(filePath)]);
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return;
    }
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [path.basename(filePath)]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    await executeSqlFile(path.join(migrationsDir, file));
  }

  console.log('Database migration completed.');
}

main().finally(() => {
  void db.end();
});
