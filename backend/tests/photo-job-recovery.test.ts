import { describe, expect, it, vi } from 'vitest';
import { ReconcilePhotoAssetHandler } from '../src/services/job-handlers.js';
import { JobService } from '../src/services/job-service.js';

const photoId = '11111111-1111-4111-8111-111111111111';
const assetId = '22222222-2222-4222-8222-222222222222';

describe('photo job recovery', () => {
  it('queues processing in the same transaction after recovering a verified original', async () => {
    const query = vi.fn(async (sql: string) => sql.includes('SELECT id, photo_id')
      ? { rows: [{ id: assetId, photo_id: photoId, storage_key: 'fixture/original', type: 'original', upload_status: 'pending', processing_status: 'not_required', state: 'current' }] }
      : { rows: [] });
    const enqueueInTransaction = vi.fn(async () => undefined);
    const storage = { verifyObject: async () => ({ mimeType: 'image/png', fileSize: 256, width: 64, height: 48 }), deleteObject: async () => undefined };
    const handler = new ReconcilePhotoAssetHandler(storage, { enqueueInTransaction } as never);
    const transaction = { query };
    await handler.execute({ id: 'job', type: 'RECONCILE_PHOTO_ASSET', payload: { assetId }, attempts: 1, lockToken: 'fixture' }, transaction as never);
    expect(enqueueInTransaction).toHaveBeenCalledWith(transaction, { type: 'PROCESS_PHOTO_ASSETS', payload: { photoId, sourceAssetId: assetId } });
    expect(query.mock.calls.some(([sql]) => sql.includes("upload_status = 'uploaded'"))).toBe(true);
  });

  it('rejects a stale worker before it can change database rows or storage objects', async () => {
    const callback = vi.fn(async () => undefined);
    const transaction = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), release: vi.fn() };
    const jobs = new JobService({ connect: async () => transaction } as never);
    await expect(jobs.complete({ id: 'job', type: 'PROCESS_PHOTO_ASSETS', payload: { photoId, sourceAssetId: assetId }, attempts: 1, lockToken: 'old' }, callback)).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    expect(callback).not.toHaveBeenCalled();
  });
});
