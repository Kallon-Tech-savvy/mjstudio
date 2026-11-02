import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { LocalDevelopmentPhotoStorage } from '../src/infrastructure/local-photo-storage.js';

describe('local development photo storage', () => {
  let directory: string;
  let storage: LocalDevelopmentPhotoStorage;
  let image: Buffer;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'mj-photo-storage-'));
    storage = new LocalDevelopmentPhotoStorage(directory, 'http://localhost:3001');
    image = await sharp({
      create: { width: 32, height: 24, channels: 3, background: { r: 30, g: 80, b: 140 } },
    }).png().toBuffer();
  });

  afterEach(async () => {
    try {
      await rm(directory, { recursive: true, force: true });
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      if (code !== 'EBUSY' && code !== 'EPERM') throw error;
    }
  });

  it('accepts a scoped image upload once and produces client-ready derivatives', async () => {
    const photoId = randomUUID();
    const sourceKey = `studios/studio-1/galleries/gallery-1/photos/${photoId}/original`;
    const capability = await storage.createUploadCapability(sourceKey, 600, 'image/png');
    const token = capability.headers?.['X-Upload-Capability'];

    await storage.acceptUpload(token, 'image/png', image);
    await expect(storage.acceptUpload(token, 'image/png', image)).rejects.toThrow('already been used');

    const original = await storage.verifyObject(sourceKey);
    expect(original).toMatchObject({ storageKey: sourceKey, mimeType: 'image/png', width: 32, height: 24 });

    const previewKey = `studios/assets/${photoId}/preview`;
    const thumbnailKey = `studios/assets/${photoId}/thumbnail`;
    const preview = await storage.createPreview(sourceKey, previewKey);
    const thumbnail = await storage.createThumbnail(sourceKey, thumbnailKey);
    expect(preview).toMatchObject({ mimeType: 'image/webp', width: 32, height: 24 });
    expect(thumbnail).toMatchObject({ mimeType: 'image/webp', width: 32, height: 24 });
    expect(await storage.verifyObject(previewKey)).toMatchObject({ mimeType: 'image/webp', width: 32, height: 24 });
    expect(await storage.verifyObject(thumbnailKey)).toMatchObject({ mimeType: 'image/webp', width: 32, height: 24 });

    const view = await storage.createViewCapability(previewKey, 60);
    const resolvedView = await storage.resolveReadCapability(new URL(view.url).searchParams.get('capability') ?? undefined, 'view');
    expect(resolvedView.object.storageKey).toBe(previewKey);
  });

  it('rejects invalid image content, a mismatched MIME type, and untrusted origins', async () => {
    const key = `studios/studio-1/galleries/gallery-1/photos/${randomUUID()}/original`;
    const capability = await storage.createUploadCapability(key, 600, 'image/png');
    const token = capability.headers?.['X-Upload-Capability'];

    await expect(storage.acceptUpload(token, 'image/jpeg', image)).rejects.toThrow('does not match');
    await expect(storage.acceptUpload(token, 'image/png', Buffer.from('not an image'))).rejects.toThrow('not a supported image');

    const app = createApp(undefined, { allowedOrigins: ['http://localhost:3000'], localPhotoStorage: storage });
    const denied = await request(app)
      .put('/api/local-photo-storage/upload')
      .set('Origin', 'http://attacker.example')
      .set('Content-Type', 'image/png')
      .set('X-Upload-Capability', token ?? '')
      .send(image);
    expect(denied.status).toBe(403);
  });

  it('rejects uploads without an image content type', async () => {
    const app = createApp(undefined, { allowedOrigins: ['http://localhost:3000'], localPhotoStorage: storage });
    const response = await request(app)
      .put('/api/local-photo-storage/upload')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'text/plain')
      .send('not an image');

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects storage keys that could escape the local storage directory', async () => {
    await expect(storage.createUploadCapability('../outside/file', 600, 'image/png')).rejects.toThrow('storage key is invalid');
  });
});
