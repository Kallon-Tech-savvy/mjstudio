import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { buildPhotographerContext } from '../../src/auth/context.js';
import { LocalDevelopmentPhotoStorage } from '../../src/infrastructure/local-photo-storage.js';
import { GalleryService } from '../../src/services/gallery-service.js';
import { PhotoService, type PhotoStorage } from '../../src/services/photo-service.js';
import { JobService, JobWorker, PermanentJobError } from '../../src/services/job-service.js';
import { CleanupPhotoAssetsHandler, ProcessPhotoAssetsHandler, ReconcilePhotoAssetHandler } from '../../src/services/job-handlers.js';
import { ClientSessionService, GalleryAccessService } from '../../src/services/client-access-service.js';
import { CatalogService } from '../../src/services/catalog-service.js';
import { PhotoRepresentationService } from '../../src/services/photo-representation-service.js';
import { SelectionService, DownloadService } from '../../src/services/client-workflow-services.js';
import { ProofingService } from '../../src/services/proofing-service.js';
import { DeliveryService } from '../../src/services/delivery-service.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Photo pipeline tests require an isolated TEST_DATABASE_URL ending in _test.');
const pool = new Pool({ connectionString: url, max: 4 });
const cleanup: Array<{ studioId: string; userId: string; galleryId: string; directory: string }> = [];

async function fixture() {
  const userId = randomUUID();
  const studioId = randomUUID();
  const membershipId = randomUUID();
  const directory = await mkdtemp(join(tmpdir(), 'mj-pipeline-'));
  const row = { studioId, userId, directory, galleryId: '' };
  cleanup.push(row);
  const email = `pipeline-${userId}@example.test`;
  await pool.query("INSERT INTO users (id, email, display_name, auth_provider) VALUES ($1, $2, 'Pipeline owner', 'integration-test')", [userId, email]);
  await pool.query("INSERT INTO studios (id, name) VALUES ($1, 'Pipeline test studio')", [studioId]);
  await pool.query("INSERT INTO studio_members (id, studio_id, user_id, role) VALUES ($1, $2, $3, 'owner')", [membershipId, studioId, userId]);
  const actor = buildPhotographerContext({ userId, studioId, membershipId, email, role: 'owner' });
  const galleries = new GalleryService(pool);
  const gallery = await galleries.create(actor, { name: 'Pipeline portraits', newClient: { name: 'Pipeline test client' } });
  row.galleryId = gallery.id;
  const storage = new LocalDevelopmentPhotoStorage(directory, 'http://localhost:3001');
  const jobs = new JobService(pool);
  const photos = new PhotoService(pool, storage, jobs);
  const app = createApp(undefined, { allowedOrigins: ['http://localhost:3000'], localPhotoStorage: storage });
  const image = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#345846' } }).png().toBuffer();
  const created = await photos.create(actor, gallery.id, { filename: 'portrait.png', mimeType: 'image/png', fileSize: image.length });
  const uploaded = await request(app).put(new URL(created.upload.url).pathname)
    .set('Origin', 'http://localhost:3000').set('Content-Type', 'image/png')
    .set('X-Upload-Capability', created.upload.headers?.['X-Upload-Capability'] ?? '').send(image);
  expect(uploaded.status).toBe(201);
  const source = await pool.query('SELECT id, storage_key FROM photo_assets WHERE photo_id = $1 AND type = $2', [created.photo.id, 'original']);
  return { actor, galleryId: gallery.id as string, storage, jobs, photos, galleries, app, image, photoId: created.photo.id as string, assetId: source.rows[0].id as string, sourceKey: source.rows[0].storage_key as string };
}

afterEach(async () => {
  for (const row of cleanup.splice(0)) {
    try {
      const photos = row.galleryId ? await pool.query('SELECT id FROM photos WHERE gallery_id = $1', [row.galleryId]) : { rows: [] };
      const ids = photos.rows.map((photo) => photo.id);
      await pool.query(`DELETE FROM application_jobs WHERE payload->>'photoId' = ANY($1::text[])
        OR payload->>'assetId' IN (SELECT id::text FROM photo_assets WHERE photo_id = ANY($1::uuid[]))`, [ids]);
      await pool.query('DELETE FROM studios WHERE id = $1', [row.studioId]);
      await pool.query('DELETE FROM users WHERE id = $1', [row.userId]);
    } finally { await rm(row.directory, { recursive: true, force: true }); }
  }
});
afterAll(async () => { await pool.end(); });

async function binaryResponse(app: ReturnType<typeof createApp>, capabilityUrl: string) {
  const url = new URL(capabilityUrl);
  return request(app).get(`${url.pathname}${url.search}`).buffer(true).parse((response, callback) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    response.on('end', () => callback(null, Buffer.concat(chunks)));
    response.on('error', callback);
  });
}

async function photoState(photoId: string) {
  return (await pool.query('SELECT status FROM photos WHERE id = $1', [photoId])).rows[0].status;
}

async function processingState(photoId: string) {
  return (await pool.query("SELECT status, attempts FROM application_jobs WHERE job_type = 'PROCESS_PHOTO_ASSETS' AND payload->>'photoId' = $1", [photoId])).rows;
}

function verificationStorage(storage: PhotoStorage, verifyObject: PhotoStorage['verifyObject']): PhotoStorage {
  return {
    createUploadCapability: storage.createUploadCapability.bind(storage),
    createViewCapability: storage.createViewCapability.bind(storage),
    createDownloadCapability: storage.createDownloadCapability.bind(storage),
    verifyObject,
  };
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

describe('real image, storage and PostgreSQL pipeline', () => {
  it.each([false, true])('returns the current state after a newer confirmation finishes (delayed verification succeeds: %s)', async (valid) => {
    const f = await fixture();
    const started = gate();
    const resume = gate();
    const storage = verificationStorage(f.storage, async (key) => {
      started.release();
      await resume.promise;
      return valid ? f.storage.verifyObject(key) : null;
    });
    const delayed = new PhotoService(pool, storage, f.jobs).uploadComplete(f.actor, f.galleryId, f.photoId)
      .catch((error: unknown) => error);
    try {
      await started.promise;
      await f.photos.uploadComplete(f.actor, f.galleryId, f.photoId);
      await new JobWorker(f.jobs, new ProcessPhotoAssetsHandler(f.storage, f.storage)).runOne();
      resume.release();
      expect(await delayed).toMatchObject({ status: 'active' });
      expect(await photoState(f.photoId)).toBe('active');
      expect(await processingState(f.photoId)).toEqual([{ status: 'completed', attempts: 1 }]);
    } finally { resume.release(); await delayed; }
  });

  it.each(['confirmation', 'reconciliation'] as const)('recovers a failed verification through %s using valid database transitions', async (recovery) => {
    const f = await fixture();
    const missing = verificationStorage(f.storage, async () => null);
    await expect(new PhotoService(pool, missing, f.jobs).uploadComplete(f.actor, f.galleryId, f.photoId))
      .rejects.toMatchObject({ code: 'UPLOAD_NOT_VERIFIED' });
    expect(await photoState(f.photoId)).toBe('failed');
    if (recovery === 'confirmation') {
      expect(await f.photos.uploadComplete(f.actor, f.galleryId, f.photoId)).toMatchObject({ status: 'processing' });
    } else {
      await f.jobs.enqueue({ type: 'RECONCILE_PHOTO_ASSET', payload: { assetId: f.assetId } });
      await new JobWorker(f.jobs, new ReconcilePhotoAssetHandler(f.storage, f.jobs)).runOne();
    }
    expect(await photoState(f.photoId)).toBe('processing');
    expect(await processingState(f.photoId)).toEqual([{ status: 'pending', attempts: 0 }]);
    await new JobWorker(f.jobs, new ProcessPhotoAssetsHandler(f.storage, f.storage)).runOne();
    expect(await photoState(f.photoId)).toBe('active');
  });

  it('rejects delayed confirmation after deletion without scheduling image processing', async () => {
    const f = await fixture();
    const started = gate();
    const resume = gate();
    const storage = verificationStorage(f.storage, async (key) => {
      const object = await f.storage.verifyObject(key);
      started.release();
      await resume.promise;
      return object;
    });
    const delayed = new PhotoService(pool, storage, f.jobs).uploadComplete(f.actor, f.galleryId, f.photoId)
      .catch((error: unknown) => error);
    try {
      await started.promise;
      await f.photos.delete(f.actor, f.galleryId, f.photoId);
      resume.release();
      expect(await delayed).toMatchObject({ code: 'PHOTO_NOT_FOUND' });
      expect(await processingState(f.photoId)).toEqual([]);
    } finally { resume.release(); await delayed; }
  });

  it.each(['active', 'deleted'] as const)('makes obsolete reconciliation a no-op for an %s photo', async (state) => {
    const f = await fixture();
    if (state === 'active') {
      await f.photos.uploadComplete(f.actor, f.galleryId, f.photoId);
      await new JobWorker(f.jobs, new ProcessPhotoAssetsHandler(f.storage, f.storage)).runOne();
    } else {
      await f.photos.delete(f.actor, f.galleryId, f.photoId);
    }
    let verified = false;
    const storage = {
      verifyObject: async () => { verified = true; return null; },
      deleteObject: f.storage.deleteObject.bind(f.storage),
    };
    await f.jobs.enqueue({ type: 'RECONCILE_PHOTO_ASSET', payload: { assetId: f.assetId } });
    await new JobWorker(f.jobs, new ReconcilePhotoAssetHandler(storage, f.jobs)).runOne();
    expect(verified).toBe(false);
    const job = await pool.query("SELECT status FROM application_jobs WHERE job_type = 'RECONCILE_PHOTO_ASSET' AND payload->>'assetId' = $1", [f.assetId]);
    expect(job.rows[0].status).toBe('completed');
    if (state === 'active') expect(await photoState(f.photoId)).toBe('active');
    else expect(await processingState(f.photoId)).toEqual([]);
  });

  it('retries reconciliation when the original is temporarily unavailable', async () => {
    const f = await fixture();
    let available = false;
    const storage = {
      verifyObject: (key: string) => available ? f.storage.verifyObject(key) : Promise.resolve(null),
      deleteObject: f.storage.deleteObject.bind(f.storage),
    };
    await f.jobs.enqueue({ type: 'RECONCILE_PHOTO_ASSET', payload: { assetId: f.assetId } });
    const worker = new JobWorker(f.jobs, new ReconcilePhotoAssetHandler(storage, f.jobs));
    await worker.runOne();
    const queued = await pool.query("SELECT status, attempts FROM application_jobs WHERE job_type = 'RECONCILE_PHOTO_ASSET' AND payload->>'assetId' = $1", [f.assetId]);
    expect(queued.rows).toEqual([{ status: 'pending', attempts: 1 }]);
    expect(await processingState(f.photoId)).toEqual([]);
    available = true;
    await pool.query("UPDATE application_jobs SET available_at = NOW() WHERE payload->>'assetId' = $1", [f.assetId]);
    await worker.runOne();
    expect(await processingState(f.photoId)).toEqual([{ status: 'pending', attempts: 0 }]);
  });

  it('processes real files, serves client derivatives, releases the original and cleans up deleted assets', async () => {
    const f = await fixture();
    const access = new GalleryAccessService(pool, { deliver: async () => undefined, resend: async () => undefined });
    const grant = await access.create(f.actor, f.galleryId, { permission: 'view_download' });
    await f.photos.uploadComplete(f.actor, f.galleryId, f.photoId);
    expect(await photoState(f.photoId)).toBe('processing');
    await expect(f.galleries.publish(f.actor, f.galleryId)).rejects.toMatchObject({ code: 'GALLERY_NOT_PUBLISHABLE' });
    const worker = new JobWorker(f.jobs, new ProcessPhotoAssetsHandler(f.storage, f.storage));
    expect(await worker.runOne()).toBe(true);
    expect(await photoState(f.photoId)).toBe('active');
    await f.photos.uploadComplete(f.actor, f.galleryId, f.photoId);
    expect(await processingState(f.photoId)).toEqual([{ status: 'completed', attempts: 1 }]);
    await f.galleries.publish(f.actor, f.galleryId);
    const sessions = new ClientSessionService(pool, { assertAllowed: async () => undefined });
    const session = await sessions.create(grant.secretToken, grant.pin, randomUUID());
    const client = await sessions.resolve(session.sessionToken);
    const catalog = new CatalogService(pool, new PhotoRepresentationService(f.storage));
    const listed = await catalog.listClientPhotos(client, f.galleryId, 1, 20);
    expect(listed.items[0].thumbnail).toMatchObject({ mimeType: 'image/webp', width: 480, height: 320 });
    const thumbnail = await binaryResponse(f.app, listed.items[0].thumbnail.url);
    expect(thumbnail.status).toBe(200);
    expect(await sharp(thumbnail.body).metadata()).toMatchObject({ format: 'webp', width: 480, height: 320 });
    const detail = await catalog.getClientPhoto(client, f.galleryId, f.photoId);
    const preview = await binaryResponse(f.app, detail.preview.url);
    expect(preview.status).toBe(200);
    expect(await sharp(preview.body).metadata()).toMatchObject({ format: 'webp', width: 1200, height: 800 });
    const downloads = new DownloadService(pool, f.storage);
    await expect(downloads.create(client, f.photoId)).rejects.toMatchObject({ code: 'DOWNLOAD_NOT_READY' });
    const selections = new SelectionService(pool);
    await selections.setSelection(client, f.photoId, true);
    await selections.submitSelection(client);
    await new ProofingService(pool).setReview(f.actor, f.galleryId, f.photoId, 'approved');
    const deliveries = new DeliveryService(pool);
    await deliveries.prepareDelivery(f.actor, f.galleryId);
    await deliveries.releaseDelivery(f.actor, f.galleryId);
    const capability = await downloads.create(client, f.photoId);
    const original = await binaryResponse(f.app, capability.url);
    expect(original.status).toBe(200);
    expect(original.headers['content-disposition']).toContain('attachment');
    expect(Buffer.compare(original.body, f.image)).toBe(0);
    await f.photos.delete(f.actor, f.galleryId, f.photoId);
    await new JobWorker(f.jobs, new CleanupPhotoAssetsHandler(f.storage)).runOne();
    expect(await f.storage.verifyObject(f.sourceKey)).toBeNull();
    expect((await binaryResponse(f.app, detail.preview.url)).status).toBe(404);
  });

  it('recovers an interrupted verification by queuing processing exactly once', async () => {
    const f = await fixture();
    const unavailable: PhotoStorage = {
      createUploadCapability: f.storage.createUploadCapability.bind(f.storage),
      createViewCapability: f.storage.createViewCapability.bind(f.storage),
      createDownloadCapability: f.storage.createDownloadCapability.bind(f.storage),
      verifyObject: async () => { throw new Error('Temporary storage verification outage'); },
    };
    await expect(new PhotoService(pool, unavailable, f.jobs).uploadComplete(f.actor, f.galleryId, f.photoId)).rejects.toThrow('Temporary storage verification outage');
    await new JobWorker(f.jobs, new ReconcilePhotoAssetHandler(f.storage, f.jobs)).runOne();
    expect(await processingState(f.photoId)).toEqual([{ status: 'pending', attempts: 0 }]);
    await f.photos.uploadComplete(f.actor, f.galleryId, f.photoId);
    await new JobWorker(f.jobs, new ProcessPhotoAssetsHandler(f.storage, f.storage)).runOne();
    expect(await photoState(f.photoId)).toBe('active');
    expect(await processingState(f.photoId)).toEqual([{ status: 'completed', attempts: 1 }]);
  });

  it('retries a failed image-processing transaction without duplicating current derivatives', async () => {
    const f = await fixture();
    await f.photos.uploadComplete(f.actor, f.galleryId, f.photoId);
    let fail = true;
    const previewKeys: string[] = [];
    const processor = {
      createPreview: async (source: string, destination: string) => { previewKeys.push(destination); return f.storage.createPreview(source, destination); },
      createThumbnail: async (source: string, destination: string) => {
        if (fail) throw new Error('Temporary image processor outage');
        return f.storage.createThumbnail(source, destination);
      },
    };
    const worker = new JobWorker(f.jobs, new ProcessPhotoAssetsHandler(processor, f.storage));
    await worker.runOne();
    expect(await photoState(f.photoId)).toBe('processing');
    expect(await processingState(f.photoId)).toEqual([{ status: 'pending', attempts: 1 }]);
    const partial = await pool.query("SELECT COUNT(*)::int AS count FROM photo_assets WHERE photo_id = $1 AND type <> 'original'", [f.photoId]);
    expect(partial.rows[0].count).toBe(0);
    expect(await f.storage.verifyObject(previewKeys[0])).toBeNull();
    expect(await f.storage.verifyObject(f.sourceKey)).not.toBeNull();
    fail = false;
    await pool.query("UPDATE application_jobs SET available_at = NOW() WHERE payload->>'photoId' = $1", [f.photoId]);
    await worker.runOne();
    expect(await photoState(f.photoId)).toBe('active');
    expect(await processingState(f.photoId)).toEqual([{ status: 'completed', attempts: 2 }]);
    expect(previewKeys[1]).toBe(previewKeys[0]);
    const assets = await pool.query("SELECT COUNT(*)::int AS count FROM photo_assets WHERE photo_id = $1 AND type <> 'original' AND state = 'current' AND processing_status = 'ready'", [f.photoId]);
    expect(assets.rows[0].count).toBe(2);
  });

  it('replaces a stale failed derivative without colliding with its historical storage key', async () => {
    const f = await fixture();
    await f.photos.uploadComplete(f.actor, f.galleryId, f.photoId);
    const oldKey = `studios/assets/${f.photoId}/preview`;
    await f.storage.createPreview(f.sourceKey, oldKey);
    await pool.query("INSERT INTO photo_assets (id, photo_id, type, state, storage_key, upload_status, processing_status) VALUES ($1, $2, 'preview', 'current', $3, 'failed', 'failed')", [randomUUID(), f.photoId, oldKey]);
    await new JobWorker(f.jobs, new ProcessPhotoAssetsHandler(f.storage, f.storage)).runOne();
    expect(await photoState(f.photoId)).toBe('active');
    expect(await processingState(f.photoId)).toEqual([{ status: 'completed', attempts: 1 }]);
    const assets = await pool.query("SELECT state, storage_key FROM photo_assets WHERE photo_id = $1 AND type = 'preview' ORDER BY created_at", [f.photoId]);
    expect(assets.rows).toHaveLength(2);
    expect(assets.rows[0]).toMatchObject({ state: 'superseded', storage_key: oldKey });
    expect(assets.rows[1].state).toBe('current');
    expect(assets.rows[1].storage_key).not.toBe(oldKey);
  });
  it('prevents an expired worker from running storage changes after another worker reclaims the job', async () => {
    const f = await fixture();
    await f.photos.uploadComplete(f.actor, f.galleryId, f.photoId);
    const abandoned = await f.jobs.claim('PROCESS_PHOTO_ASSETS');
    expect(abandoned).not.toBeNull();
    if (!abandoned) throw new Error('Processing job was not claimed.');
    await pool.query("UPDATE application_jobs SET locked_until = NOW() - INTERVAL '1 second' WHERE id = $1", [abandoned.id]);
    const current = await f.jobs.claim('PROCESS_PHOTO_ASSETS');
    expect(current?.id).toBe(abandoned.id);
    if (!current) throw new Error('Processing job was not reclaimed.');
    let changedStorage = false;
    await expect(f.jobs.complete(abandoned, async () => { changedStorage = true; })).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    expect(changedStorage).toBe(false);
    const handler = new ProcessPhotoAssetsHandler(f.storage, f.storage);
    await f.jobs.complete(current, (transaction) => handler.execute(current, transaction));
    expect(await photoState(f.photoId)).toBe('active');
    expect(await processingState(f.photoId)).toEqual([{ status: 'completed', attempts: 2 }]);
  });

  it('makes a permanent processing failure visible without deleting the verified original', async () => {
    const f = await fixture();
    await f.photos.uploadComplete(f.actor, f.galleryId, f.photoId);
    const processor = {
      createPreview: f.storage.createPreview.bind(f.storage),
      createThumbnail: async () => { throw new PermanentJobError('Image derivative could not be verified'); },
    };
    await new JobWorker(f.jobs, new ProcessPhotoAssetsHandler(processor, f.storage)).runOne();
    expect(await photoState(f.photoId)).toBe('failed');
    expect(await processingState(f.photoId)).toEqual([{ status: 'failed', attempts: 1 }]);
    expect(await f.storage.verifyObject(f.sourceKey)).not.toBeNull();
    expect((await f.photos.uploadComplete(f.actor, f.galleryId, f.photoId)).status).toBe('failed');
  });

});
