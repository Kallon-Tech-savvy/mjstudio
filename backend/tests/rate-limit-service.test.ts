import { describe, expect, it } from 'vitest';
import { PostgresRateLimitService } from '../src/services/rate-limit-service.js';
import type { Database } from '../src/services/service-common.js';

describe('PostgresRateLimitService bucket cleanup', () => {
  it('deletes only buckets older than the retention period and rate-limits using the same database', async () => {
    const statements: string[] = [];
    const database = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('INSERT INTO api_rate_limit_buckets')) return { rows: [{ request_count: 1 }] };
        return { rows: [] };
      },
      connect: async () => { throw new Error('connect should not be used'); },
    } as unknown as Database;
    const limiter = new PostgresRateLimitService(database);

    await limiter.assertAllowed('client-ip:token', 'client-access');
    await limiter.assertAllowed('client-ip:token', 'client-access');

    const cleanupStatements = statements.filter((sql) => sql.includes('DELETE FROM api_rate_limit_buckets'));
    const insertStatements = statements.filter((sql) => sql.includes('INSERT INTO api_rate_limit_buckets'));
    expect(cleanupStatements).toHaveLength(1);
    expect(cleanupStatements[0]).toContain("bucket_start < NOW() - INTERVAL '2 hours'");
    expect(insertStatements).toHaveLength(2);
  });

  it('coalesces concurrent cleanup attempts', async () => {
    const statements: string[] = [];
    let releaseCleanup: (() => void) | undefined;
    const cleanupGate = new Promise<void>((resolve) => { releaseCleanup = resolve; });
    const database = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('DELETE FROM api_rate_limit_buckets')) await cleanupGate;
        if (sql.includes('INSERT INTO api_rate_limit_buckets')) return { rows: [{ request_count: 1 }] };
        return { rows: [] };
      },
      connect: async () => { throw new Error('connect should not be used'); },
    } as unknown as Database;
    const limiter = new PostgresRateLimitService(database);

    const first = limiter.assertAllowed('first', 'client-access');
    const second = limiter.assertAllowed('second', 'client-access');
    await Promise.resolve();
    releaseCleanup?.();
    await Promise.all([first, second]);

    expect(statements.filter((sql) => sql.includes('DELETE FROM api_rate_limit_buckets'))).toHaveLength(1);
    expect(statements.filter((sql) => sql.includes('INSERT INTO api_rate_limit_buckets'))).toHaveLength(2);
  });
});
