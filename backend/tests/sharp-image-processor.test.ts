import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { LocalPhotoStorage } from '../src/services/local-photo-storage.js';
import { SharpImageProcessor } from '../src/services/sharp-image-processor.js';
import { ProcessPhotoAssetsHandler } from '../src/services/job-handlers.js';
import { PhotoRepresentationService } from '../src/services/photo-representation-service.js';

const roots: string[] = [];
const makeStorage = async () => {
  const root = await mkdtemp(join(tmpdir(), 'mjstudio-sharp-'));
  roots.push(root);
  return new LocalPhotoStorage(root, 'http://localhost:3001', 'test-secret-that-is-at-least-32-characters-long');
};
const upload = async (storage: LocalPhotoStorage, key: string, bytes: Buffer, mimeType: string) => {
  const capability = await storage.createUploadCapability(key, 60);
  const token = new URL(capability.url).pathname.split('/').at(-1)!;
  await storage.acceptUpload(token, mimeType, bytes);
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('SharpImageProcessor', () => {
  it('creates verified WebP previews and thumbnails without enlarging the source', async () => {
    const storage = await makeStorage();
    const sourceKey = 'studios/studio-1/photos/photo-1/original';
    const previewKey = 'studios/assets/photo-1/preview';
    const thumbnailKey = 'studios/assets/photo-1/thumbnail';
    const original = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 180, g: 80, b: 40 } },
    }).png().toBuffer();
    await upload(storage, sourceKey, original, 'image/png');

    const processor = new SharpImageProcessor(storage);
    const preview = await processor.createPreview(sourceKey, previewKey);
    const thumbnail = await processor.createThumbnail(sourceKey, thumbnailKey);

    expect(preview).toMatchObject({ mimeType: 'image/webp', width: 1200, height: 800 });
    expect(thumbnail).toMatchObject({ mimeType: 'image/webp', width: 600, height: 400 });
    await expect(storage.verifyObject(previewKey)).resolves.toMatchObject(preview);
    await expect(storage.verifyObject(thumbnailKey)).resolves.toMatchObject(thumbnail);
    await expect(sharp(await storage.readObjectBytes(previewKey)).metadata()).resolves.toMatchObject({ format: 'webp', width: 1200, height: 800 });
  });

  it('rejects malformed image data instead of producing a derivative', async () => {
    const storage = await makeStorage();
    const sourceKey = 'studios/studio-1/photos/photo-2/original';
    await upload(storage, sourceKey, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg');

    await expect(new SharpImageProcessor(storage).createPreview(sourceKey, 'studios/assets/photo-2/preview'))
      .rejects.toThrow(/could not be decoded/i);
    await expect(storage.verifyObject('studios/assets/photo-2/preview')).resolves.toBeNull();
  });

  it('treats a missing original as a permanent processing failure', async () => {
    const storage = await makeStorage();
    await expect(new SharpImageProcessor(storage).createPreview('studios/missing/original', 'studios/assets/missing/preview'))
      .rejects.toThrow(/missing or failed storage verification/i);
  });

  it('keeps transient source-storage read failures retryable', async () => {
    const storage = {
      readObjectBytes: async () => { throw new Error('temporary filesystem read failure'); },
      writeDerivative: async () => undefined,
    } as unknown as LocalPhotoStorage;

    await expect(new SharpImageProcessor(storage).createPreview('studios/source/original', 'studios/derivatives/preview'))
      .rejects.toThrow('temporary filesystem read failure');
  });

  it('deletes derivative bytes and metadata idempotently', async () => {
    const storage = await makeStorage();
    const sourceKey = 'studios/studio-1/photos/photo-3/original';
    const derivativeKey = 'studios/assets/photo-3/preview';
    const original = await sharp({
      create: { width: 32, height: 24, channels: 3, background: { r: 20, g: 40, b: 60 } },
    }).png().toBuffer();
    await upload(storage, sourceKey, original, 'image/png');
    await new SharpImageProcessor(storage).createPreview(sourceKey, derivativeKey);

    await storage.deleteObject(derivativeKey);
    await storage.deleteObject(derivativeKey);
    await expect(storage.verifyObject(derivativeKey)).resolves.toBeNull();
  });

  it('processes an uploaded original through verified derivatives into a usable gallery preview', async () => {
    const storage = await makeStorage();
    const photoId = '11111111-1111-4111-8111-111111111111';
    const sourceAssetId = '22222222-2222-4222-8222-222222222222';
    const sourceKey = 'studios/studio-1/galleries/gallery-1/photos/photo-1/original';
    const original = await sharp({
      create: { width: 1000, height: 700, channels: 3, background: { r: 40, g: 100, b: 160 } },
    }).jpeg().toBuffer();
    await upload(storage, sourceKey, original, 'image/jpeg');

    const statements: string[] = [];
    const transaction = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('FROM photos p JOIN photo_assets pa ON pa.photo_id = p.id') && sql.includes('FOR UPDATE OF p, pa')) {
          return { rows: [{ gallery_id: 'gallery-1', storage_key: sourceKey, upload_status: 'uploaded', state: 'current', deleted_at: null }] };
        }
        if (sql.includes('SELECT id, upload_status, processing_status, state FROM photo_assets')) return { rows: [] };
        if (sql.includes('SELECT COUNT(*) FILTER')) return { rows: [{ ready: true }] };
        return { rows: [], rowCount: 1 };
      },
    } as never;

    await new ProcessPhotoAssetsHandler(new SharpImageProcessor(storage), storage).execute({
      id: '33333333-3333-4333-8333-333333333333',
      type: 'PROCESS_PHOTO_ASSETS',
      attempts: 1,
      lockToken: 'test-lock',
      payload: { photoId, sourceAssetId },
    }, transaction);

    expect(statements.some((sql) => sql.includes("UPDATE photos SET status = 'active'"))).toBe(true);
    const previewKey = `studios/assets/${photoId}/preview`;
    const thumbnailKey = `studios/assets/${photoId}/thumbnail`;
    const [previewAsset, thumbnailAsset] = await Promise.all([
      storage.verifyObject(previewKey),
      storage.verifyObject(thumbnailKey),
    ]);
    expect(previewAsset).toMatchObject({ mimeType: 'image/webp', width: 1000, height: 700 });
    expect(thumbnailAsset).toMatchObject({ mimeType: 'image/webp', width: 600, height: 420 });

    const representation = await new PhotoRepresentationService(storage).createView({
      storageKey: previewKey,
      width: previewAsset!.width!,
      height: previewAsset!.height!,
      mimeType: previewAsset!.mimeType,
    }, 600);
    const token = new URL(representation.url).pathname.split('/').at(-1)!;
    const servedPreview = await storage.readCapability(token);
    expect(representation).toMatchObject({ width: 1000, height: 700, mimeType: 'image/webp' });
    expect(servedPreview).toMatchObject({ mimeType: 'image/webp', download: false });
    expect(await sharp(servedPreview!.bytes).metadata()).toMatchObject({ format: 'webp', width: 1000, height: 700 });
  });

});
