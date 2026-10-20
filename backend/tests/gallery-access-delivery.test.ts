import { describe, expect, it, vi } from 'vitest';
import { buildPhotographerContext } from '../src/auth/context.js';
import { GalleryAccessService } from '../src/services/client-access-service.js';
import type { Database } from '../src/services/service-common.js';

describe('gallery credential delivery failure', () => {
  it('revokes the newly created grant if credential delivery fails', async () => {
    const transactionQueries: string[] = [];
    const transaction = {
      query: vi.fn(async (sql: string) => {
        transactionQueries.push(sql);
        if (sql.includes('SELECT id FROM galleries')) return { rows: [{ id: 'gallery-1' }] };
        if (sql.includes('SELECT id, expires_at FROM gallery_access')) return { rows: [] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const database = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM galleries g')) {
          return { rows: [{
            id: 'gallery-1',
            studio_id: '22222222-2222-4222-8222-222222222222',
            role: 'owner',
            workflow_status: 'reviewing',
            publication_status: 'draft',
            archived_at: null,
          }] };
        }
        return { rows: [] };
      }),
      connect: vi.fn(async () => transaction),
    } as unknown as Database;
    const delivery = {
      deliver: vi.fn().mockRejectedValue(new Error('delivery provider unavailable')),
      resend: vi.fn(),
    };
    const service = new GalleryAccessService(database, delivery);
    const actor = buildPhotographerContext({
      userId: '11111111-1111-4111-8111-111111111111',
      studioId: '22222222-2222-4222-8222-222222222222',
      role: 'owner',
    });

    await expect(service.create(actor, '33333333-3333-4333-8333-333333333333', {
      permission: 'view',
    })).rejects.toThrow('delivery provider unavailable');

    expect(transactionQueries.some((sql) =>
      sql.includes('UPDATE gallery_access SET revoked_at = NOW()'))).toBe(true);
    expect(transactionQueries.some((sql) =>
      sql.includes('UPDATE client_sessions SET revoked_at = NOW()'))).toBe(true);
    expect(transaction.release).toHaveBeenCalledTimes(2);
  });
  it('leaves no active replacement grant when reset delivery fails', async () => {
    const transactionQueries: string[] = [];
    const transaction = {
      query: vi.fn(async (sql: string) => {
        transactionQueries.push(sql);
        if (sql.includes('SELECT id FROM galleries')) return { rows: [{ id: 'gallery-1' }] };
        if (sql.includes('SELECT id, expires_at FROM gallery_access')) {
          return { rows: [{ id: 'old-grant', expires_at: null }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const database = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM galleries g')) {
          return { rows: [{
            id: 'gallery-1',
            studio_id: '22222222-2222-4222-8222-222222222222',
            role: 'owner',
            workflow_status: 'reviewing',
            publication_status: 'draft',
            archived_at: null,
          }] };
        }
        return { rows: [] };
      }),
      connect: vi.fn(async () => transaction),
    } as unknown as Database;
    const delivery = {
      deliver: vi.fn().mockRejectedValue(new Error('delivery provider unavailable')),
      resend: vi.fn(),
    };
    const service = new GalleryAccessService(database, delivery);
    const actor = buildPhotographerContext({
      userId: '11111111-1111-4111-8111-111111111111',
      studioId: '22222222-2222-4222-8222-222222222222',
      role: 'owner',
    });

    await expect(service.reset(actor, '33333333-3333-4333-8333-333333333333', 'view'))
      .rejects.toThrow('delivery provider unavailable');

    const grantRevocations = transactionQueries.filter((sql) =>
      sql.includes('UPDATE gallery_access SET revoked_at = NOW()'));
    const sessionRevocations = transactionQueries.filter((sql) =>
      sql.includes('UPDATE client_sessions SET revoked_at = NOW()'));
    expect(grantRevocations).toHaveLength(2);
    expect(sessionRevocations).toHaveLength(2);
    expect(transaction.release).toHaveBeenCalledTimes(2);
  });

});
