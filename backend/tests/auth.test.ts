import { describe, expect, it } from 'vitest';
import { ensureGalleryAccessAllowed, ensurePhotographerCanAccessStudio } from '../src/auth/authorization.js';
import { buildClientContext, buildPhotographerContext } from '../src/auth/context.js';
import { validateLoginPayload } from '../src/routes/auth.js';
import { ClientSessionService } from '../src/services/client-access-service.js';
import { UnauthorizedError } from '../src/errors.js';

describe('authentication foundation', () => {
  it('should reject empty credentials in the auth contract', () => {
    expect(() => validateLoginPayload({ email: '', password: '' })).toThrowError();
  });

  it('should accept a valid login payload', () => {
    const payload = validateLoginPayload({ email: 'studio@example.com', password: 'password123' });

    expect(payload.email).toBe('studio@example.com');
    expect(payload.password).toBe('password123');
  });

  it('should keep photographer and client contexts in separate trust domains', () => {
    const photographer = buildPhotographerContext({ userId: 'u-1', email: 'owner@example.com' });
    const client = buildClientContext({ galleryAccessId: 'ga-1', galleryId: 'g-1', permission: 'view' });

    expect(photographer.studioId).toBeDefined();
    expect(photographer.membershipId).toBeDefined();
    expect(client.galleryAccessId).toBe('ga-1');
    expect(client.permission).toBe('view');
  });


  it('rejects client sessions when the gallery itself has expired', async () => {
    const statements: string[] = [];
    const database = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('FROM client_sessions cs')) {
          // Model the row a database would return if the query omitted the gallery-expiry predicate.
          if (!sql.includes('(g.expires_at IS NULL OR g.expires_at > NOW())')) {
            return { rows: [{
              session_id: 'session-1',
              access_id: 'access-1',
              gallery_id: 'gallery-1',
              permission: 'view',
              session_expires_at: new Date(Date.now() + 60_000),
              access_expires_at: null,
            }] };
          }
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    const service = new ClientSessionService(database as never, { assertAllowed: async () => undefined });

    await expect(service.resolve('session-token')).rejects.toBeInstanceOf(UnauthorizedError);
    expect(statements.some((sql) => sql.includes('UPDATE client_sessions SET last_seen_at'))).toBe(false);
  });

  it('should allow a photographer to access their own studio only', () => {
    const user = buildPhotographerContext({ studioId: '22222222-2222-4222-8222-222222222222' });

    expect(() => ensurePhotographerCanAccessStudio(user, '22222222-2222-4222-8222-222222222222')).not.toThrow();
    expect(() => ensurePhotographerCanAccessStudio(user, '99999999-9999-4999-8999-999999999999')).toThrowError();
  });

  it('should enforce minimum gallery permission for the client session', () => {
    const client = buildClientContext({ permission: 'view' });

    expect(() => ensureGalleryAccessAllowed(client, 'view')).not.toThrow();
    expect(() => ensureGalleryAccessAllowed(client, 'view_download')).toThrowError();
  });
});
