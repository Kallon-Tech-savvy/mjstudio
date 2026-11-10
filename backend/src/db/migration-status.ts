import type { Database } from '../services/service-common.js';

/** Read migration history only; never creates tables or applies SQL. */
export async function pendingMigrations(database: Pick<Database, 'query'>, expected: string[]): Promise<string[]> {
  if (!expected.length) throw new Error('No migration files found.');
  const table = await database.query("SELECT to_regclass('schema_migrations') IS NOT NULL AS present");
  if (!table.rows[0]?.present) return [...expected].sort();
  const history = await database.query<{ version: string }>('SELECT version FROM schema_migrations');
  const applied = new Set(history.rows.map(row => row.version));
  return expected.filter(version => !applied.has(version)).sort();
}
