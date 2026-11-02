import { describe, expect, it, vi } from 'vitest';
import type { ClientContext } from '../src/auth/context.js';
import { DownloadService } from '../src/services/client-workflow-services.js';

const client: ClientContext = {
  clientSessionId: 'session-1',
  galleryAccessId: 'access-1',
  galleryId: 'gallery-1',
  permission: 'view_download',
};

function createDatabase() {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('SELECT pa.storage_key')) return { rows: [{ storage_key: 'galleries/gallery-1/photo-1/original', photo_id: 'photo-1' }] };
    return { rows: [], rowCount: 1 };
  });
  return { query, connect: vi.fn() };
}

describe('DownloadService', () => {
  it('does not record a download if capability creation fails', async () => {
    const database = createDatabase();
    const storage = {
      createDownloadCapability: vi.fn().mockRejectedValue(new Error('Storage unavailable')),
    };
    const service = new DownloadService(database as never, storage as never);

    await expect(service.create(client, 'photo-1')).rejects.toThrow('Storage unavailable');
    expect(database.query).toHaveBeenCalledTimes(1);
    expect(database.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photo_downloads'),
      expect.anything(),
    );
  });

  it('records a download only after issuing its capability', async () => {
    const database = createDatabase();
    const order: string[] = [];
    database.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT pa.storage_key')) {
        return { rows: [{ storage_key: 'galleries/gallery-1/photo-1/original', photo_id: 'photo-1' }] };
      }
      order.push('record');
      return { rows: [], rowCount: 1 };
    });
    const storage = {
      createDownloadCapability: vi.fn(async () => {
        order.push('capability');
        return { url: 'https://storage.example/download', expiresAt: new Date() };
      }),
    };
    const service = new DownloadService(database as never, storage as never, () => 'download-1');

    await expect(service.create(client, 'photo-1')).resolves.toMatchObject({ url: 'https://storage.example/download' });
    expect(order).toEqual(['capability', 'record']);
  });
});
