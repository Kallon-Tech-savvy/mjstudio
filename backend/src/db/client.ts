import { Pool } from 'pg';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { serializeError } from '../logging/serialize-error.js';

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  // Without this, an unreachable database makes requests hang instead of failing.
  connectionTimeoutMillis: 10_000,
});

// Idle pooled connections can be closed by the server or a pooler. Without this
// listener, Node treats the pool's 'error' event as uncaught and exits the process.
db.on('error', (error) => {
  logger.error({ err: serializeError(error) }, 'idle database client error');
});

export async function testDatabaseConnection() {
  const result = await db.query('SELECT 1 AS ok');
  return result.rows[0]?.ok === 1;
}
