import { Pool } from 'pg';
import { env } from '../config/env.js';

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
});

export async function testDatabaseConnection() {
  const result = await db.query('SELECT 1 AS ok');
  return result.rows[0]?.ok === 1;
}
