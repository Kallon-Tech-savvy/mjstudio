import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import sharp from 'sharp';
import { LocalPhotoStorage } from '../src/services/local-photo-storage.js';
import { SharpImageProcessor } from '../src/services/sharp-image-processor.js';
import { ProcessPhotoAssetsHandler } from '../src/services/job-handlers.js';
import { JobService, JobWorker } from '../src/services/job-service.js';
import { PhotoService } from '../src/services/photo-service.js';

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

  async function createFixture(imageBytes: Buffer, mimeType: string) {
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
    await database.query('INSERT INTO gallery_members (id, gallery_id, user_id, role) VALUES ($1, $2, $3, $4)', [
      randomUUID(), galleryId, userId, 'owner',
    ]);
    await database.query('INSERT INTO clients (id, studio_id, name) VALUES ($1, $2, $3)', [clientId, studioId, 'Integration Client']);
    await database.query('INSERT INTO galleries (id, studio_id, client_id, name) VALUES ($1, $2, $3, $4)', [
      galleryId, studioId, clientId, 'Processing Test Gallery',
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
    await photoService.uploadComplete({
      userId,
      email: `${userId}@integration.test`,
      displayName: 'Integration Photographer',
      studioId,
      membershipId,
      role: 'owner',
    }, galleryId, photoId);
    const worker = new JobWorker(jobs, new ProcessPhotoAssetsHandler(new SharpImageProcessor(storage), storage));
    return { photoId, worker, jobs, storage, storageKey, galleryId };
  }

  it('claims a persisted job, generates both verified derivatives, and activates the photo transactionally', async () => {
    const bytes = await sharp({
      create: { width: 900, height: 600, channels: 3, background: { r: 40, g: 100, b: 160 } },
    }).jpeg().toBuffer();
    const { photoId, worker, jobs } = await createFixture(bytes, 'image/jpeg');

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
    const job = await database.query("SELECT status FROM application_jobs WHERE job_type = 'PROCESS_PHOTO_ASSETS' AND payload->>'photoId' = $1", [photoId]);
    expect(job.rows[0]?.status).toBe('completed');
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
