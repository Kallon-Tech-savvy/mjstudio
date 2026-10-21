import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import sharp from 'sharp';
import { LocalPhotoStorage } from '../src/services/local-photo-storage.js';
import { SharpImageProcessor } from '../src/services/sharp-image-processor.js';
import { CleanupPhotoAssetsHandler, ProcessPhotoAssetsHandler, ReconcilePhotoAssetHandler } from '../src/services/job-handlers.js';
import { JobService, JobWorker } from '../src/services/job-service.js';
import { PhotoService } from '../src/services/photo-service.js';
import { createApp } from '../src/app.js';
import { CatalogService } from '../src/services/catalog-service.js';
import { ClientSessionService } from '../src/services/client-access-service.js';
import { DownloadService } from '../src/services/client-workflow-services.js';
import request from 'supertest';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('photo processing against PostgreSQL', () => {
  const database = new Pool({ connectionString: databaseUrl, max: 4 });
  let storageRoot = '';
  let storage: LocalPhotoStorage;

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'mjstudio-db-processing-'));
    storage = new LocalPhotoStorage(storageRoot, 'http://localhost:3001', 'database-integration-test-secret-long-enough');
  });

  afterAll(async () => {
    await database.end();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });

  async function createFixture(imageBytes: Buffer, mimeType: string, completeUpload = true) {
    const userId = randomUUID();
    const studioId = randomUUID();
    const clientId = randomUUID();
    const galleryId = randomUUID();
    const photoId = randomUUID();
    const assetId = randomUUID();
    const storageKey = `studios/${studioId}/galleries/${galleryId}/photos/${photoId}/original`;

    await database.query('INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)', [
      userId, `${userId}@integration.test`, 'Integration Photographer', 'test-hash',
    ]);
    await database.query('INSERT INTO studios (id, name) VALUES ($1, $2)', [studioId, 'Integration Studio']);
    const membershipId = randomUUID();
    await database.query('INSERT INTO studio_members (id, studio_id, user_id, role) VALUES ($1, $2, $3, $4)', [
      membershipId, studioId, userId, 'owner',
    ]);
    await database.query('INSERT INTO clients (id, studio_id, name) VALUES ($1, $2, $3)', [clientId, studioId, 'Integration Client']);
    await database.query('INSERT INTO galleries (id, studio_id, client_id, name) VALUES ($1, $2, $3, $4)', [
      galleryId, studioId, clientId, 'Processing Test Gallery',
    ]);
    await database.query('INSERT INTO gallery_members (id, gallery_id, user_id, role) VALUES ($1, $2, $3, $4)', [
      randomUUID(), galleryId, userId, 'owner',
    ]);
    await database.query('INSERT INTO photos (id, gallery_id, filename, position, status) VALUES ($1, $2, $3, 0, $4)', [
      photoId, galleryId, 'integration.jpg', 'processing',
    ]);
    await database.query(
      `INSERT INTO photo_assets (id, photo_id, type, state, storage_key, mime_type, file_size, upload_status, processing_status)
       VALUES ($1, $2, 'original', 'current', $3, $4, $5, 'pending', 'not_required')`,
      [assetId, photoId, storageKey, mimeType, imageBytes.length],
    );
    const upload = await storage.createUploadCapability(storageKey, 60);
    const token = new URL(upload.url).pathname.split('/').at(-1)!;
    await storage.acceptUpload(token, mimeType, imageBytes);
    const jobs = new JobService(database);
    const photoService = new PhotoService(database, storage, jobs);
    if (completeUpload) {
      await photoService.uploadComplete({
        userId,
        email: `${userId}@integration.test`,
        displayName: 'Integration Photographer',
        studioId,
        membershipId,
        role: 'owner',
      }, galleryId, photoId);
    }
    const worker = new JobWorker(jobs, new ProcessPhotoAssetsHandler(new SharpImageProcessor(storage), storage));
    const reconcileWorker = new JobWorker(jobs, new ReconcilePhotoAssetHandler(storage, jobs));
    return { photoId, worker, reconcileWorker, jobs, storage, storageKey, galleryId, assetId, userId };
  }

  it('claims a persisted job, generates both verified derivatives, and activates the photo transactionally', async () => {
    const bytes = await sharp({
      create: { width: 900, height: 600, channels: 3, background: { r: 40, g: 100, b: 160 } },
    }).jpeg().toBuffer();
    const { photoId, worker, jobs, storageKey } = await createFixture(bytes, 'image/jpeg');

    expect(await worker.runOne()).toBe(true);
    const photo = await database.query('SELECT status FROM photos WHERE id = $1', [photoId]);
    expect(photo.rows[0]?.status).toBe('active');
    const assets = await database.query(
      `SELECT type, upload_status, processing_status, mime_type, width, height
         FROM photo_assets WHERE photo_id = $1 AND type IN ('preview', 'thumbnail') AND state = 'current'
         ORDER BY type`, [photoId],
    );
    expect(assets.rows).toHaveLength(2);
    expect(assets.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'preview', upload_status: 'uploaded', processing_status: 'ready', mime_type: 'image/webp', width: 900, height: 600 }),
      expect.objectContaining({ type: 'thumbnail', upload_status: 'uploaded', processing_status: 'ready', mime_type: 'image/webp', width: 600, height: 400 }),
    ]));
    const preview = await database.query(
      `SELECT storage_key, mime_type, width, height FROM photo_assets
        WHERE photo_id = $1 AND type = 'preview' AND state = 'current'`,
      [photoId],
    );
    const verifiedPreview = await storage.verifyObject(preview.rows[0].storage_key);
    expect(verifiedPreview).toMatchObject({ width: 900, height: 600, mimeType: 'image/webp' });
    const previewBytes = await storage.readObjectBytes(preview.rows[0].storage_key);
    expect(previewBytes.subarray(0, 4).toString('ascii')).toBe('RIFF');

    const job = await database.query("SELECT status FROM application_jobs WHERE job_type = 'PROCESS_PHOTO_ASSETS' AND payload->>'photoId' = $1", [photoId]);
    expect(job.rows[0]?.status).toBe('completed');

    // Exercise the persisted cleanup queue against the original and both derivatives.
    await database.query('UPDATE photos SET deleted_at = NOW() WHERE id = $1', [photoId]);
    await jobs.enqueue({ type: 'CLEANUP_PHOTO_ASSETS', payload: { photoId } });
    const cleanupWorker = new JobWorker(jobs, new CleanupPhotoAssetsHandler(storage));
    expect(await cleanupWorker.runOne()).toBe(true);
    expect(await storage.verifyObject(storageKey)).toBeNull();
    expect(await storage.verifyObject(`studios/assets/${photoId}/preview`)).toBeNull();
    expect(await storage.verifyObject(`studios/assets/${photoId}/thumbnail`)).toBeNull();
    await database.query('DELETE FROM photos WHERE id = $1', [photoId]);
  });

  it('regenerates a derivative whose database row is ready but whose object is missing', async () => {
    const bytes = await sharp({
      create: { width: 900, height: 600, channels: 3, background: { r: 40, g: 100, b: 160 } },
    }).jpeg().toBuffer();
    const { photoId, assetId, worker, jobs, storage: fixtureStorage } = await createFixture(bytes, 'image/jpeg');
    expect(await worker.runOne()).toBe(true);
    const previewKey = `studios/assets/${photoId}/preview`;
    await fixtureStorage.deleteObject(previewKey);
    await database.query(
      "UPDATE application_jobs SET status = 'failed', failed_at = NOW() WHERE job_type = 'PROCESS_PHOTO_ASSETS' AND payload->>'photoId' = $1",
      [photoId],
    );
    await jobs.enqueue({ type: 'PROCESS_PHOTO_ASSETS', payload: { photoId, sourceAssetId: assetId } });

    expect(await worker.runOne()).toBe(true);
    expect(await fixtureStorage.verifyObject(previewKey)).toMatchObject({ mimeType: 'image/webp', width: 900, height: 600 });
    const previewRows = await database.query(
      "SELECT state, upload_status, processing_status FROM photo_assets WHERE photo_id = $1 AND type = 'preview' ORDER BY created_at DESC",
      [photoId],
    );
    expect(previewRows.rows[0]).toMatchObject({ state: 'current', upload_status: 'uploaded', processing_status: 'ready' });
    const photo = await database.query('SELECT status FROM photos WHERE id = $1', [photoId]);
    expect(photo.rows[0]?.status).toBe('active');
    await database.query('DELETE FROM photos WHERE id = $1', [photoId]);
  });

  it('reconciliation queues processing when a verified original upload was left pending', async () => {
    const bytes = await sharp({
      create: { width: 900, height: 600, channels: 3, background: { r: 40, g: 100, b: 160 } },
    }).jpeg().toBuffer();
    const { photoId, assetId, worker, reconcileWorker, jobs } = await createFixture(bytes, 'image/jpeg', false);

    await jobs.enqueue({ type: 'RECONCILE_PHOTO_ASSET', payload: { assetId } });
    expect(await reconcileWorker.runOne()).toBe(true);
    const original = await database.query(
      "SELECT upload_status FROM photo_assets WHERE id = $1",
      [assetId],
    );
    expect(original.rows[0]?.upload_status).toBe('uploaded');
    const processingJob = await database.query(
      "SELECT status FROM application_jobs WHERE job_type = 'PROCESS_PHOTO_ASSETS' AND payload->>'photoId' = $1",
      [photoId],
    );
    expect(processingJob.rows[0]?.status).toBe('pending');

    expect(await worker.runOne()).toBe(true);
    const photo = await database.query('SELECT status FROM photos WHERE id = $1', [photoId]);
    expect(photo.rows[0]?.status).toBe('active');
    await database.query('DELETE FROM photos WHERE id = $1', [photoId]);
  });

  it('serves a processed photo through the authenticated client gallery HTTP endpoint', async () => {
    const bytes = await sharp({
      create: { width: 900, height: 600, channels: 3, background: { r: 40, g: 100, b: 160 } },
    }).jpeg().toBuffer();
    const { photoId, worker, galleryId, storage: photoStorage, userId } = await createFixture(bytes, 'image/jpeg');
    expect(await worker.runOne()).toBe(true);

    const gallery = await database.query(
      `SELECT g.studio_id, g.client_id FROM galleries g WHERE g.id = $1`,
      [galleryId],
    );
    await database.query(
      "UPDATE galleries SET publication_status = 'published', published_at = NOW() WHERE id = $1",
      [galleryId],
    );
    const accessId = randomUUID();
    const sessionId = randomUUID();
    const sessionToken = randomUUID() + randomUUID();
    await database.query(
      `INSERT INTO gallery_access (id, gallery_id, secret_token_hash, pin_hash, permission)
       VALUES ($1, $2, $3, $4, 'view_download')`,
      [accessId, galleryId, createHash('sha256').update(randomUUID()).digest('hex'), 'test-pin-hash'],
    );
    await database.query(
      `INSERT INTO client_sessions (id, gallery_access_id, session_token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')`,
      [sessionId, accessId, createHash('sha256').update(sessionToken).digest('hex')],
    );

    const clientSessions = new ClientSessionService(database, { assertAllowed: async () => undefined });
    const studioSessionToken = randomUUID() + randomUUID();
    const services = {
      auth: { resolve: async () => ({
        userId,
        email: `${userId}@integration.test`,
        displayName: 'Integration Photographer',
        studioId: gallery.rows[0].studio_id,
        membershipId: randomUUID(),
        role: 'owner' as const,
      }) }, galleries: {}, photos: {}, galleryAccess: {},
      clientSessions, selections: {}, recommendations: {}, downloads: new DownloadService(database, photoStorage), feedback: {},
      proofing: {}, delivery: {},
      catalog: new CatalogService(database),
      photoStorage,
      rateLimits: { assertAllowed: async () => undefined },
      jobs: new JobService(database),
    } as unknown as import('../src/services/container.js').ApplicationServices;
    const app = createApp(services, { allowedOrigins: ['http://localhost:3000'], localPhotoStorage: photoStorage });

    try {
      await request(app)
        .get(`/api/client/galleries/${galleryId}/photos`)
        .expect(401);

      const response = await request(app)
        .get(`/api/client/galleries/${galleryId}/photos`)
        .set('Cookie', `__Secure-mj_client_session=${sessionToken}`);
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({ photoId, position: 0 });
      expect(response.body.data[0].thumbnail).toMatchObject({
        width: 600,
        height: 400,
        mimeType: 'image/webp',
      });

      const thumbnailPath = new URL(response.body.data[0].thumbnail.url).pathname;
      const imageResponse = await request(app)
        .get(thumbnailPath)
        .set('Cookie', `__Secure-mj_client_session=${sessionToken}`);
      expect(imageResponse.status).toBe(200);
      expect(imageResponse.headers['content-type']).toContain('image/webp');
      expect(imageResponse.headers['cache-control']).toBe('private, no-store');
      expect(Buffer.from(imageResponse.body).subarray(0, 4).toString('ascii')).toBe('RIFF');

      // Studio previews are session-authorized too; previously issued URLs must not be bearer capabilities.
      const studioPreview = await request(app)
        .get(`/api/galleries/${galleryId}/photos/${photoId}/representations/preview`)
        .set('Cookie', `__Host-mj_session=${studioSessionToken}`);
      expect(studioPreview.status).toBe(200);
      expect(studioPreview.headers['cache-control']).toBe('private, no-store');
      expect(Buffer.from(studioPreview.body).subarray(0, 4).toString('ascii')).toBe('RIFF');

      // The route must not permit callers to request the original asset as a representation.
      await request(app)
        .get(`/api/client/galleries/${galleryId}/photos/${photoId}/representations/original`)
        .set('Cookie', `__Secure-mj_client_session=${sessionToken}`)
        .expect(422);

      // Download authorization is checked again at fetch time, including permission changes.
      await database.query("UPDATE gallery_access SET permission = 'view' WHERE id = $1", [accessId]);
      await request(app)
        .get(`/api/client/galleries/${galleryId}/photos/${photoId}/download-file`)
        .set('Cookie', `__Secure-mj_client_session=${sessionToken}`)
        .expect(403);
      await database.query("UPDATE gallery_access SET permission = 'view_download' WHERE id = $1", [accessId]);

      // The same image URL must stop working as soon as its session is revoked.
      await database.query('UPDATE client_sessions SET revoked_at = NOW() WHERE id = $1', [sessionId]);
      await request(app)
        .get(thumbnailPath)
        .set('Cookie', `__Secure-mj_client_session=${sessionToken}`)
        .expect(401);

      // Download URLs are authenticated routes, not bearer capabilities; revocation must invalidate them immediately.
      await request(app)
        .get(`/api/client/galleries/${galleryId}/photos/${photoId}/download-file`)
        .set('Cookie', `__Secure-mj_client_session=${sessionToken}`)
        .expect(401);
      await request(app)
        .get(`/api/client/galleries/${galleryId}/photos/${photoId}/download-file`)
        .expect(401);
    } finally {
      await database.query('DELETE FROM photos WHERE id = $1', [photoId]);
      await database.query('DELETE FROM client_sessions WHERE id = $1', [sessionId]);
      await database.query('DELETE FROM gallery_access WHERE id = $1', [accessId]);
      await database.query('DELETE FROM galleries WHERE id = $1', [galleryId]);
      await database.query('DELETE FROM clients WHERE id = $1', [gallery.rows[0].client_id]);
      await database.query('DELETE FROM studio_members WHERE studio_id = $1', [gallery.rows[0].studio_id]);
      await database.query('DELETE FROM studios WHERE id = $1', [gallery.rows[0].studio_id]);
      await database.query('DELETE FROM users WHERE id = $1', [userId]);
    }
  });

  it('marks a crashed job terminal when its final lease expires', async () => {
    const bytes = await sharp({
      create: { width: 900, height: 600, channels: 3, background: { r: 40, g: 100, b: 160 } },
    }).jpeg().toBuffer();
    const { photoId, worker, jobs } = await createFixture(bytes, 'image/jpeg');
    await database.query(
      "UPDATE application_jobs SET status = 'processing', attempts = max_attempts, locked_until = NOW() - INTERVAL '1 second', lock_token = $2 WHERE job_type = 'PROCESS_PHOTO_ASSETS' AND payload->>'photoId' = $1",
      [photoId, randomUUID()],
    );

    expect(await worker.runOne()).toBe(false);
    const state = await database.query(
      "SELECT p.status AS photo_status, j.status AS job_status, j.attempts FROM photos p JOIN application_jobs j ON j.payload->>'photoId' = p.id::text WHERE p.id = $1 AND j.job_type = 'PROCESS_PHOTO_ASSETS'",
      [photoId],
    );
    expect(state.rows[0]).toMatchObject({ photo_status: 'failed', job_status: 'failed', attempts: 5 });
    await database.query('DELETE FROM photos WHERE id = $1', [photoId]);
  });

  it('retries a transient processing failure and activates the photo on the next attempt', async () => {
    const bytes = await sharp({
      create: { width: 900, height: 600, channels: 3, background: { r: 40, g: 100, b: 160 } },
    }).jpeg().toBuffer();
    const { photoId, worker: successfulWorker, jobs } = await createFixture(bytes, 'image/jpeg');
    const transientProcessor = {
      createPreview: async () => { throw new Error('temporary filesystem read failure'); },
      createThumbnail: async () => { throw new Error('preview should fail first'); },
    };
    const failingWorker = new JobWorker(jobs, new ProcessPhotoAssetsHandler(transientProcessor, storage));

    expect(await failingWorker.runOne()).toBe(true);
    const afterFailure = await database.query(
      "SELECT p.status AS photo_status, j.status AS job_status, j.attempts FROM photos p JOIN application_jobs j ON j.payload->>'photoId' = p.id::text WHERE p.id = $1 AND j.job_type = 'PROCESS_PHOTO_ASSETS'",
      [photoId],
    );
    expect(afterFailure.rows[0]).toMatchObject({ photo_status: 'processing', job_status: 'pending', attempts: 1 });

    await database.query(
      "UPDATE application_jobs SET available_at = NOW() WHERE job_type = 'PROCESS_PHOTO_ASSETS' AND payload->>'photoId' = $1",
      [photoId],
    );
    expect(await successfulWorker.runOne()).toBe(true);
    const afterRetry = await database.query(
      "SELECT p.status AS photo_status, j.status AS job_status, j.attempts FROM photos p JOIN application_jobs j ON j.payload->>'photoId' = p.id::text WHERE p.id = $1 AND j.job_type = 'PROCESS_PHOTO_ASSETS'",
      [photoId],
    );
    expect(afterRetry.rows[0]).toMatchObject({ photo_status: 'active', job_status: 'completed', attempts: 2 });
    await database.query('DELETE FROM photos WHERE id = $1', [photoId]);
  });

  it('marks a malformed original and its processing job failed without activating the photo', async () => {
    const malformed = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const { photoId, worker } = await createFixture(malformed, 'image/jpeg');

    expect(await worker.runOne()).toBe(true);
    const photo = await database.query('SELECT status FROM photos WHERE id = $1', [photoId]);
    expect(photo.rows[0]?.status).toBe('failed');
    const job = await database.query("SELECT status, attempts FROM application_jobs WHERE job_type = 'PROCESS_PHOTO_ASSETS' AND payload->>'photoId' = $1", [photoId]);
    expect(job.rows[0]).toMatchObject({ status: 'failed', attempts: 1 });
    await database.query('DELETE FROM photos WHERE id = $1', [photoId]);
  });
});
