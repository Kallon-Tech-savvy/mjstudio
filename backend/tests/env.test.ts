import { afterEach, describe, expect, it, vi } from 'vitest';

describe('env configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('accepts postgres connection strings with special characters in the credentials', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PORT', '3001');
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:[mjstudio-23@12]@db.example.com:5432/postgres');
    vi.stubEnv('APP_BASE_URL', 'http://localhost:3001');
    vi.stubEnv('FRONTEND_ORIGINS', 'http://localhost:3000');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');

    const { env } = await import('../src/config/env.js');

    expect(env.DATABASE_URL).toContain('postgresql://postgres:');
    expect(env.DATABASE_URL).toContain('%5B');
    expect(env.DATABASE_URL).toContain('%40');
  });
});
