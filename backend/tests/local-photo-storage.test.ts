import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { LocalPhotoStorage } from '../src/services/local-photo-storage.js';

const roots: string[] = [];
const makeStorage = async () => {
  const root = await mkdtemp(join(tmpdir(), 'mjstudio-storage-'));
  roots.push(root);
  return new LocalPhotoStorage(root, 'http://localhost:3001', 'test-secret-that-is-at-least-32-characters-long');
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('LocalPhotoStorage', () => {
  it('accepts a signed upload and verifies the stored image metadata', async () => {
    const storage = await makeStorage();
    const key = 'studios/studio-1/galleries/gallery-1/photos/photo-1/original';
    const capability = await storage.createUploadCapability(key, 60);
    const token = new URL(capability.url).pathname.split('/').at(-1)!;
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

    await storage.acceptUpload(token, 'image/jpeg', jpeg);

    await expect(storage.verifyObject(key)).resolves.toEqual({
      storageKey: key,
      mimeType: 'image/jpeg',
      fileSize: jpeg.length,
    });
  });

  it('removes an original if its metadata sidecar cannot be written, allowing a safe retry', async () => {
    const storage = await makeStorage();
    const root = roots[roots.length - 1]!;
    const key = 'studios/studio-1/original';
    const capability = await storage.createUploadCapability(key, 60);
    const token = new URL(capability.url).pathname.split('/').at(-1)!;
    const sidecarDirectory = join(root, 'studios/studio-1/original.metadata.json');
    await mkdir(sidecarDirectory, { recursive: true });

    await expect(storage.acceptUpload(token, 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xd9])))
      .rejects.toThrow();

    await rm(sidecarDirectory, { recursive: true, force: true });
    await expect(storage.acceptUpload(token, 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xd9])))
      .resolves.toBeUndefined();
    await expect(storage.verifyObject(key)).resolves.toMatchObject({ storageKey: key, mimeType: 'image/jpeg' });
  });

  it('rejects tampered and expired capabilities', async () => {
    const storage = await makeStorage();
    const capability = await storage.createUploadCapability('studios/studio-1/original', 60);
    const token = new URL(capability.url).pathname.split('/').at(-1)!;

    await expect(storage.acceptUpload(`${token}tampered`, 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff])))
      .rejects.toThrow(/invalid or expired/i);
  });

  it('rejects traversal keys and content-type spoofing', async () => {
    const storage = await makeStorage();
    await expect(storage.createUploadCapability('../outside.jpg', 60)).rejects.toThrow(/unsafe storage key/i);

    const capability = await storage.createUploadCapability('studios/studio-1/original', 60);
    const token = new URL(capability.url).pathname.split('/').at(-1)!;
    await expect(storage.acceptUpload(token, 'image/png', Buffer.from([0xff, 0xd8, 0xff])))
      .rejects.toThrow(/content type/i);
  });

  it('accepts a binary upload through the HTTP route before JSON parsing', async () => {
    const storage = await makeStorage();
    const app = createApp(undefined, { localPhotoStorage: storage, allowedOrigins: ['http://localhost:5173'] });
    const key = 'studios/studio-1/galleries/gallery-1/photos/photo-2/original';
    const capability = await storage.createUploadCapability(key, 60);
    const uploadPath = new URL(capability.url).pathname;

    await request(app)
      .put(uploadPath)
      .set('Origin', 'http://localhost:5173')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
      .expect(204);

    await expect(storage.verifyObject(key)).resolves.toMatchObject({ storageKey: key, mimeType: 'image/jpeg' });
  });

  it('returns null when the stored object is missing', async () => {
    const storage = await makeStorage();
    await expect(storage.verifyObject('studios/studio-1/missing')).resolves.toBeNull();
  });
});
