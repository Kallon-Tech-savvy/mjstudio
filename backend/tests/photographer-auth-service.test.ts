import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../src/errors.js';
import { PhotographerAuthService, PostgresScryptPasswordVerifier } from '../src/services/photographer-auth-service.js';

describe('PhotographerAuthService.login', () => {
  it('creates a session and returns its authorized context with one post-verification query', async () => {
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const database = {
      query: async (sql: string, values: unknown[] = []) => {
        queries.push({ sql, values });
        return {
          rows: [{
            user_id: 'user-1',
            email: 'studio@example.com',
            display_name: 'Studio Owner',
            studio_id: 'studio-1',
            membership_id: 'membership-1',
            role: 'owner',
          }],
        };
      },
    };
    const passwords = { verify: async () => ({ userId: 'user-1' }) };
    const service = new PhotographerAuthService(database as never, passwords, () => 'session-1');

    const result = await service.login('studio@example.com', 'correct-password');

    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('WITH eligible_membership AS');
    expect(queries[0].sql).toContain('INSERT INTO photographer_sessions');
    expect(queries[0].sql).toContain('FROM studio_members');
    expect(result.context).toEqual({
      userId: 'user-1',
      email: 'studio@example.com',
      displayName: 'Studio Owner',
      studioId: 'studio-1',
      membershipId: 'membership-1',
      role: 'owner',
    });
    expect(result.sessionToken).toBeTruthy();
  });

  it('does not create a session when the verified user has no studio membership', async () => {
    const queries: string[] = [];
    const database = {
      query: async (sql: string) => {
        queries.push(sql);
        return { rows: [] };
      },
    };
    const service = new PhotographerAuthService(
      database as never,
      { verify: async () => ({ userId: 'user-without-membership' }) },
      () => 'session-2',
    );

    await expect(service.login('studio@example.com', 'correct-password')).rejects.toBeInstanceOf(UnauthorizedError);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('INSERT INTO photographer_sessions');
    expect(queries[0]).toContain('FROM eligible_membership');
  });

  it('does not query for or create a session after password verification fails', async () => {
    let queryCount = 0;
    const database = {
      query: async () => {
        queryCount += 1;
        return { rows: [] };
      },
    };
    const service = new PhotographerAuthService(database as never, { verify: async () => null });

    await expect(service.login('studio@example.com', 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedError);
    expect(queryCount).toBe(0);
  });
});

describe('PostgresScryptPasswordVerifier', () => {
  it('performs the invalid-account verification path and rejects an unknown email', async () => {
    const database = { query: async () => ({ rows: [] }) };
    const verifier = new PostgresScryptPasswordVerifier(database as never);

    await expect(verifier.verify('missing@example.com', 'some-password')).resolves.toBeNull();
  });

  it('rejects malformed stored password hashes without throwing', async () => {
    const database = {
      query: async () => ({ rows: [{ id: 'user-1', password_hash: 'scrypt$salt$not-a-valid-digest' }] }),
    };
    const verifier = new PostgresScryptPasswordVerifier(database as never);

    await expect(verifier.verify('studio@example.com', 'some-password')).resolves.toBeNull();
  });
});
