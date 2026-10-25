import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from 'node:fs/promises';
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

  it('rejects an uploaded original when its bytes change after the upload', async () => {
    const storage = await makeStorage();
    const root = roots[roots.length - 1]!;
    const key = 'studios/studio-1/galleries/gallery-1/photos/photo-1/original';
    const capability = await storage.createUploadCapability(key, 60);
    const token = new URL(capability.url).pathname.split('/').at(-1)!;
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    await storage.acceptUpload(token, 'image/jpeg', jpeg);
    await expect(storage.verifyObject(key)).resolves.toMatchObject({ storageKey: key, mimeType: 'image/jpeg', fileSize: jpeg.length });

    // Keep the JPEG signature valid so MIME sniffing alone cannot detect the mutation.
    await writeFile(join(root, key), Buffer.from([0xff, 0xd8, 0xff, 0x01]));
    await expect(storage.verifyObject(key)).resolves.toBeNull();
    await expect(storage.readObjectBytes(key)).rejects.toThrow(/failed verification/i);
  });

  it('reads a verified object by server-selected storage key', async () => {
    const storage = await makeStorage();
    const key = 'studios/studio-1/galleries/gallery-1/photos/photo-1/preview';
    const bytes = Buffer.from('RIFF0000WEBPvalid-preview');
    await storage.writeDerivative(key, bytes, {
      mimeType: 'image/webp',
      fileSize: bytes.length,
      width: 320,
      height: 240,
    });

    await expect(storage.readObjectBytes(key)).resolves.toEqual(bytes);
    await expect(storage.readVerifiedObject(key)).resolves.toMatchObject({
      storageKey: key,
      mimeType: 'image/webp',
      fileSize: bytes.length,
      width: 320,
      height: 240,
      bytes,
    });
  });

  it('rejects a derivative when its object bytes no longer match the metadata sidecar', async () => {
    const storage = await makeStorage();
    const root = roots[roots.length - 1]!;
    const key = 'studios/studio-1/preview.webp';
    const bytes = Buffer.from('RIFF0000WEBPvalid-a');
    await storage.writeDerivative(key, bytes, {
      mimeType: 'image/webp',
      fileSize: bytes.length,
      width: 320,
      height: 240,
    });
    await expect(storage.verifyObject(key)).resolves.toMatchObject({
      storageKey: key,
      mimeType: 'image/webp',
      width: 320,
      height: 240,
    });

    // Simulate a crash/interrupted replacement between object and sidecar renames.
    await writeFile(join(root, key), Buffer.from('RIFF0000WEBPvalid-b'));
    await expect(storage.verifyObject(key)).resolves.toBeNull();
    await expect(storage.readObjectBytes(key)).rejects.toThrow(/failed verification/i);
  });

  it('cleans only stale UUID temporary files and preserves recent or unrelated files', async () => {
    const storage = await makeStorage();
    const root = roots[roots.length - 1]!;
    const directory = join(root, 'studios', 'studio-1');
    await mkdir(directory, { recursive: true });
    const oldTemp = join(directory, 'preview.webp.tmp-123e4567-e89b-42d3-a456-426614174000');
    const recentTemp = join(directory, 'thumbnail.webp.tmp-123e4567-e89b-42d3-a456-426614174001');
    const unrelated = join(directory, 'notes.tmp-not-a-uuid');
    await Promise.all([
      writeFile(oldTemp, 'orphaned'),
      writeFile(recentTemp, 'active'),
      writeFile(unrelated, 'not ours'),
    ]);
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(oldTemp, old, old);

    await expect(storage.cleanupStaleTemporaryFiles(60 * 60 * 1000)).resolves.toBe(1);
    await expect(rm(oldTemp)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(rm(recentTemp)).resolves.toBeUndefined();
    await expect(rm(unrelated)).resolves.toBeUndefined();
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


  it('rejects symlinked object files and metadata sidecars', async () => {
    const storage = await makeStorage();
    const root = roots[roots.length - 1]!;
    const outside = await mkdtemp(join(tmpdir(), 'mjstudio-leaf-symlink-'));
    roots.push(outside);
    const key = 'studios/studio-1/photo';
    const objectPath = join(root, key);
    const sidecarPath = `${objectPath}.metadata.json`;
    await mkdir(join(root, 'studios', 'studio-1'), { recursive: true });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const externalObject = join(outside, 'outside.jpg');
    await writeFile(externalObject, jpeg);
    await writeFile(sidecarPath, JSON.stringify({ mimeType: 'image/jpeg' }));
    await symlink(externalObject, objectPath);
    await expect(storage.verifyObject(key)).resolves.toBeNull();

    await rm(objectPath);
    await writeFile(objectPath, jpeg);
    const externalMetadata = join(outside, 'outside.metadata.json');
    await writeFile(externalMetadata, JSON.stringify({ mimeType: 'image/jpeg' }));
    await rm(sidecarPath);
    await symlink(externalMetadata, sidecarPath);
    await expect(storage.verifyObject(key)).resolves.toBeNull();
  });

  it('rejects a storage root whose ancestor is a symlink', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'mjstudio-root-ancestor-'));
    const alias = join(tmpdir(), `mjstudio-root-alias-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    roots.push(outside, alias);
    const realRoot = join(outside, 'storage');
    await mkdir(realRoot);
    await symlink(outside, alias, 'dir');

    const storage = new LocalPhotoStorage(
      join(alias, 'storage'),
      'http://localhost:3001',
      'test-secret-that-is-at-least-32-characters-long',
    );

    await expect(storage.verifyObject('studios/studio-1/missing'))
      .rejects.toThrow(/root and its ancestors/i);
  });

  it('rejects symlinked parent directories instead of reading or writing outside the storage root', async () => {
    const storage = await makeStorage();
    const root = roots[roots.length - 1]!;
    const outside = await mkdtemp(join(tmpdir(), 'mjstudio-outside-'));
    roots.push(outside);
    await writeFile(join(outside, 'secret'), 'outside');
    await symlink(outside, join(root, 'studios'), 'dir');

    await expect(storage.verifyObject('studios/secret')).rejects.toThrow(/real directories/i);
    const capability = await storage.createUploadCapability('studios/new-photo/original', 60);
    const token = new URL(capability.url).pathname.split('/').at(-1)!;
    await expect(storage.acceptUpload(token, 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xd9])))
      .rejects.toThrow(/real directories/i);
    await expect(rm(join(outside, 'new-photo'), { recursive: true, force: true })).resolves.toBeUndefined();
  });

  it('returns null when the stored object is missing', async () => {
    const storage = await makeStorage();
    await expect(storage.verifyObject('studios/studio-1/missing')).resolves.toBeNull();
  });
});
