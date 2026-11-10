import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ query: vi.fn(), end: vi.fn() }));
vi.mock('../src/db/client.js', () => ({ db: database }));

beforeEach(() => {
  vi.resetModules();
  database.query.mockReset().mockResolvedValue({ rows: [] });
  database.end.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('demo seed safety', () => {
  it('refuses production before querying the database', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(import('../src/db/seed.js')).rejects.toThrow('Demo seeding is disabled in production');
    expect(database.query).not.toHaveBeenCalled();
  });

  it('never prints configured credentials while seeding development fixtures', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SEED_EMAIL', 'fixture-owner@example.invalid');
    vi.stubEnv('SEED_PASSWORD', 'fixture-seed-password');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await import('../src/db/seed.js');
    expect(database.query).toHaveBeenCalled();
    expect(database.end).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toContain('fixture-seed-password');
    expect(JSON.stringify(log.mock.calls)).not.toContain('fixture-owner@example.invalid');
    expect(log).toHaveBeenCalledWith('Development seed data inserted. Credentials were not logged.');
  });
});
