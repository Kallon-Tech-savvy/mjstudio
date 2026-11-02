import { describe, expect, it, vi } from 'vitest';
import { buildClientContext } from '../src/auth/context.js';
import { CatalogService } from '../src/services/catalog-service.js';

describe('client gallery access metadata', () => {
  it('returns the active session permission for download controls', async () => {
    const database = {
      query: vi.fn(async () => ({
        rows: [{ id: 'gallery-1', name: 'Gallery', expiresAt: null, publishedAt: new Date(), clientName: 'Client' }],
      })),
      connect: vi.fn(),
    };
    const service = new CatalogService(database as never);

    await expect(service.getClientGallery(
      buildClientContext({ galleryId: 'gallery-1', permission: 'view' }),
      'gallery-1',
    )).resolves.toMatchObject({ id: 'gallery-1', permission: 'view' });
  });
});
