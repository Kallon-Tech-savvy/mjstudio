import { describe, expect, it, vi } from 'vitest';
import { pendingMigrations } from '../src/db/migration-status.js';
import type { Database } from '../src/services/service-common.js';

const expected = ['001_init.sql', '008_creation.sql'];
function database(present: boolean, versions: string[] = []) {
  const query = vi.fn().mockResolvedValueOnce({ rows: [{ present }] }).mockResolvedValueOnce({ rows: versions.map(version => ({ version })) });
  return { query, db: { query } as unknown as Database };
}

describe('migration release preflight', () => {
  it('reports all migrations for an uninitialized database without querying a missing table', async () => {
    const { db, query } = database(false);
    expect(await pendingMigrations(db, expected)).toEqual(expected);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('reports only missing versions and passes when every expected version is recorded', async () => {
    expect(await pendingMigrations(database(true, [expected[0]]).db, expected)).toEqual([expected[1]]);
    expect(await pendingMigrations(database(true, expected).db, expected)).toEqual([]);
  });
  it('refuses empty migration artifacts and propagates inaccessible history', async () => {
    const { db, query } = database(true);
    await expect(pendingMigrations(db, [])).rejects.toThrow('No migration files');
    expect(query).not.toHaveBeenCalled();
    query.mockReset().mockRejectedValue(new Error('unavailable'));
    await expect(pendingMigrations(db, expected)).rejects.toThrow('unavailable');
  });
});
