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


  it('preserves both delivery and cleanup errors when revocation fails', async () => {
    const deliveryError = new Error('delivery provider unavailable');
    const cleanupError = new Error('database cleanup unavailable');
    let transactionNumber = 0;
    const transactionQueries: string[] = [];
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
      connect: vi.fn(async () => {
        transactionNumber += 1;
        const currentTransaction = transactionNumber;
        return {
          query: vi.fn(async (sql: string) => {
            transactionQueries.push(sql);
            if (currentTransaction === 2 && sql.includes('UPDATE gallery_access SET revoked_at = NOW()')) {
              throw cleanupError;
            }
            if (sql.includes('SELECT id FROM galleries')) return { rows: [{ id: 'gallery-1' }] };
            if (sql.includes('SELECT id, expires_at FROM gallery_access')) return { rows: [] };
            return { rows: [] };
          }),
          release: vi.fn(),
        };
      }),
    } as unknown as Database;
    const delivery = {
      deliver: vi.fn().mockRejectedValue(deliveryError),
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
    })).rejects.toMatchObject({
      errors: [deliveryError, cleanupError],
      message: 'Gallery credentials could not be delivered and the access grant could not be safely revoked.',
    });
    expect(transactionQueries.some((sql) => sql === 'ROLLBACK')).toBe(true);
  });


  it('allows reset to replace an expired but not yet revoked grant', async () => {
    const queries: string[] = [];
    let insertedGrant: unknown[] | undefined;
    const transaction = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        queries.push(sql);
        if (sql.includes('SELECT id FROM galleries')) return { rows: [{ id: 'gallery-1' }] };
        if (sql.includes('SELECT id, expires_at FROM gallery_access')) {
          return { rows: [{ id: 'expired-grant', expires_at: new Date('2025-01-01T00:00:00.000Z') }] };
        }
        if (sql.includes('INSERT INTO gallery_access')) insertedGrant = values;
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
    const delivery = { deliver: vi.fn().mockResolvedValue(undefined) };
    const service = new GalleryAccessService(database, delivery, () => 'replacement-grant');
    const actor = buildPhotographerContext({
      userId: '11111111-1111-4111-8111-111111111111',
      studioId: '22222222-2222-4222-8222-222222222222',
      role: 'owner',
    });
    const newExpiry = new Date('2027-01-15T12:00:00.000Z');

    await expect(service.reset(actor, '33333333-3333-4333-8333-333333333333', 'view', newExpiry))
      .resolves.toMatchObject({ id: 'replacement-grant', permission: 'view', expiresAt: newExpiry });

    expect(insertedGrant?.[0]).toBe('replacement-grant');
    expect(insertedGrant?.[5]).toEqual(newExpiry);
    expect(queries.some((sql) => sql.includes('UPDATE gallery_access SET revoked_at = NOW()'))).toBe(true);
    expect(delivery.deliver).toHaveBeenCalledTimes(1);
  });

  it('rotates credentials on resend while preserving permission and expiry', async () => {
    const oldExpiry = new Date('2027-01-15T12:00:00.000Z');
    const transactionQueries: string[] = [];
    let insertedGrant: unknown[] | undefined;
    const transaction = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        transactionQueries.push(sql);
        if (sql.includes('SELECT id FROM galleries')) return { rows: [{ id: 'gallery-1' }] };
        if (sql.includes('SELECT id, expires_at FROM gallery_access')) {
          return { rows: [{ id: 'old-grant', expires_at: oldExpiry }] };
        }
        if (sql.includes('INSERT INTO gallery_access')) insertedGrant = values;
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
        if (sql.includes('FROM gallery_access WHERE gallery_id')) {
          return { rows: [{ id: 'old-grant', permission: 'view_download', expiresAt: oldExpiry }] };
        }
        return { rows: [] };
      }),
      connect: vi.fn(async () => transaction),
    } as unknown as Database;
    const delivery = { deliver: vi.fn().mockResolvedValue(undefined) };
    const service = new GalleryAccessService(database, delivery, () => 'new-grant');
    const actor = buildPhotographerContext({
      userId: '11111111-1111-4111-8111-111111111111',
      studioId: '22222222-2222-4222-8222-222222222222',
      role: 'owner',
    });

    await expect(service.resend(actor, '33333333-3333-4333-8333-333333333333')).resolves.toMatchObject({
      resent: true,
      accessId: 'new-grant',
      permission: 'view_download',
      expiresAt: oldExpiry,
    });

    expect(insertedGrant?.[0]).toBe('new-grant');
    expect(insertedGrant?.[4]).toBe('view_download');
    expect(insertedGrant?.[5]).toEqual(oldExpiry);
    expect(delivery.deliver).toHaveBeenCalledTimes(1);
    expect(delivery.deliver.mock.calls[0]?.[0]).toMatchObject({
      galleryId: '33333333-3333-4333-8333-333333333333',
    });
    expect(delivery.deliver.mock.calls[0]?.[0].secretToken).toEqual(expect.any(String));
    expect(delivery.deliver.mock.calls[0]?.[0].pin).toMatch(/^\d{6}$/);
    expect(transactionQueries.some((sql) => sql.includes('UPDATE gallery_access SET revoked_at = NOW()'))).toBe(true);
    expect(transactionQueries.some((sql) => sql.includes('UPDATE client_sessions SET revoked_at = NOW()'))).toBe(true);
  });


  it('does not rotate a different grant if access changes during resend', async () => {
    const queries: string[] = [];
    const transaction = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('SELECT id FROM galleries')) return { rows: [{ id: 'gallery-1' }] };
        if (sql.includes('SELECT id, expires_at FROM gallery_access')) {
          return { rows: [{ id: 'newer-grant', expires_at: null }] };
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
        if (sql.includes('FROM gallery_access WHERE gallery_id')) {
          return { rows: [{ id: 'old-grant', permission: 'view', expiresAt: null }] };
        }
        return { rows: [] };
      }),
      connect: vi.fn(async () => transaction),
    } as unknown as Database;
    const delivery = { deliver: vi.fn().mockResolvedValue(undefined) };
    const service = new GalleryAccessService(database, delivery);
    const actor = buildPhotographerContext({
      userId: '11111111-1111-4111-8111-111111111111',
      studioId: '22222222-2222-4222-8222-222222222222',
      role: 'owner',
    });

    await expect(service.resend(actor, '33333333-3333-4333-8333-333333333333'))
      .rejects.toThrow('Gallery access changed during resend. Retry the request.');
    expect(delivery.deliver).not.toHaveBeenCalled();
    expect(queries.some((sql) => sql.includes('INSERT INTO gallery_access'))).toBe(false);
    expect(queries.some((sql) => sql.includes('UPDATE gallery_access SET revoked_at = NOW()'))).toBe(false);
  });

});
