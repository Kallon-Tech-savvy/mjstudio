import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { LocalPhotoStorage } from '../src/services/local-photo-storage.js';
import { SharpImageProcessor } from '../src/services/sharp-image-processor.js';

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
});
