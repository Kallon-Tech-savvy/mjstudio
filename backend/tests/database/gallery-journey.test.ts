import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildPhotographerContext, type PhotographerContext } from '../../src/auth/context.js';
import { GalleryService } from '../../src/services/gallery-service.js';
import { ClientSessionService, GalleryAccessService } from '../../src/services/client-access-service.js';
import { DownloadService, SelectionService } from '../../src/services/client-workflow-services.js';
import { ProofingService } from '../../src/services/proofing-service.js';
import { DeliveryService } from '../../src/services/delivery-service.js';
import type { PhotoStorage } from '../../src/services/photo-service.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) {
  throw new Error('Database journey tests require TEST_DATABASE_URL pointing to a database whose name ends in _test.');
}
const pool = new Pool({ connectionString: url, max: 4 });
const cleanup: Array<{ studioId: string; userId: string }> = [];
const delivery = { deliver: async () => undefined, resend: async () => undefined };
const limiter = { assertAllowed: async () => undefined };
const galleries = new GalleryService(pool);
const access = new GalleryAccessService(pool, delivery);
const sessions = new ClientSessionService(pool, limiter);
const selections = new SelectionService(pool);
const proofing = new ProofingService(pool);
const deliveries = new DeliveryService(pool);

async function fixture() {
  const userId = randomUUID();
  const studioId = randomUUID();
  const membershipId = randomUUID();
  cleanup.push({ studioId, userId });
  const email = `journey-${userId}@example.test`;
  await pool.query("INSERT INTO users (id, email, display_name, auth_provider) VALUES ($1, $2, 'Test owner', 'integration-test')", [userId, email]);
  await pool.query("INSERT INTO studios (id, name) VALUES ($1, 'Test studio')", [studioId]);
  await pool.query("INSERT INTO studio_members (id, studio_id, user_id, role) VALUES ($1, $2, $3, 'owner')", [membershipId, studioId, userId]);
  const actor = buildPhotographerContext({ userId, studioId, membershipId, email, displayName: 'Test owner', role: 'owner' });
  const gallery = await galleries.create(actor, { name: 'Integration portraits', newClient: { name: 'Test client' } });
  return { actor, galleryId: gallery.id as string };
}

async function readyPhoto(galleryId: string, missingThumbnail = false) {
  const photoId = randomUUID();
  await pool.query("INSERT INTO photos (id, gallery_id, filename, position, status) VALUES ($1, $2, 'portrait.jpg', 0, 'active')", [photoId, galleryId]);
  for (const type of missingThumbnail ? ['original', 'preview'] : ['original', 'preview', 'thumbnail']) {
    await pool.query(`INSERT INTO photo_assets (id, photo_id, type, state, storage_key, mime_type, upload_status, processing_status)
      VALUES ($1, $2, $3, 'current', $4, 'image/jpeg', 'uploaded', $5)`,
    [randomUUID(), photoId, type, `integration/${photoId}/${type}`, type === 'original' ? 'not_required' : 'ready']);
  }
  return photoId;
}

async function publishedFixture(permission: 'view' | 'view_download' = 'view_download') {
  const context = await fixture();
  const photoId = await readyPhoto(context.galleryId);
  const grant = await access.create(context.actor, context.galleryId, { permission });
  await galleries.publish(context.actor, context.galleryId);
  const session = await sessions.create(grant.secretToken, grant.pin, randomUUID());
  const client = await sessions.resolve(session.sessionToken);
  return { ...context, photoId, client, session };
}

beforeAll(async () => {
  const result = await pool.query('SELECT COUNT(*)::int AS count FROM schema_migrations');
  expect(result.rows[0].count).toBeGreaterThanOrEqual(7);
});
afterEach(async () => {
  for (const row of cleanup.splice(0)) {
    await pool.query('DELETE FROM studios WHERE id = $1', [row.studioId]);
    await pool.query('DELETE FROM users WHERE id = $1', [row.userId]);
  }
});
afterAll(async () => { await pool.end(); });

describe('PostgreSQL gallery journey', () => {
  it('persists publication, verified client access, selection, proofing and explicit delivery release', async () => {
    const { actor, galleryId, photoId, client } = await publishedFixture();
    const stored = await galleries.get(actor, galleryId);
    expect(stored.publicationStatus).toBe('published');
    expect(stored.workflowStatus).toBe('reviewing');
    await selections.setSelection(client, photoId, true);
    const first = await selections.submitSelection(client);
    const retry = await selections.submitSelection(client);
    expect(first.selectedCount).toBe(1);
    expect(retry.id).toBe(first.id);
    await expect(selections.setSelection(client, photoId, false)).rejects.toMatchObject({ code: 'SELECTION_ALREADY_SUBMITTED' });
    await expect(deliveries.prepareDelivery(actor, galleryId)).rejects.toMatchObject({ code: 'UNAPPROVED_PHOTOS_EXIST' });
    await proofing.setReview(actor, galleryId, photoId, 'approved');
    const prepared = await deliveries.prepareDelivery(actor, galleryId);
    expect(prepared.items).toHaveLength(1);
    expect((await deliveries.getClientDelivery(client, galleryId)).isReleased).toBe(false);
    await deliveries.releaseDelivery(actor, galleryId);
    const released = await deliveries.getClientDelivery(client, galleryId);
    expect(released.isReleased).toBe(true);
    expect(released.items[0].photoId).toBe(photoId);
    const signer: Pick<PhotoStorage, 'createDownloadCapability'> = { createDownloadCapability: async () => ({ url: 'https://example.test/fixture-download', expiresAt: new Date(Date.now() + 60_000) }) };
    await new DownloadService(pool, signer as PhotoStorage).create(client, photoId);
    const downloads = await pool.query('SELECT COUNT(*)::int AS count FROM photo_downloads WHERE photo_id = $1', [photoId]);
    expect(downloads.rows[0].count).toBe(1);
  });

  it('keeps incomplete or access-less galleries private without a partial publication update', async () => {
    const { actor, galleryId } = await fixture();
    await readyPhoto(galleryId, true);
    await expect(galleries.publish(actor, galleryId)).rejects.toMatchObject({ code: 'GALLERY_NOT_PUBLISHABLE' });
    await access.create(actor, galleryId, { permission: 'view' });
    await expect(galleries.publish(actor, galleryId)).rejects.toMatchObject({ code: 'GALLERY_NOT_PUBLISHABLE' });
    const stored = await galleries.get(actor, galleryId);
    expect(stored.publicationStatus).toBe('unpublished');
    expect(stored.workflowStatus).toBe('draft');
    expect(stored.publishedAt).toBeNull();
  });

  it('revokes old sessions while retaining submitted choices when an access link is replaced', async () => {
    const { actor, galleryId, photoId, client, session } = await publishedFixture();
    await selections.setSelection(client, photoId, true);
    await selections.submitSelection(client);
    const replacement = await access.reset(actor, galleryId, 'view');
    await expect(sessions.resolve(session.sessionToken)).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
    const fresh = await sessions.create(replacement.secretToken, replacement.pin, randomUUID());
    const current = await sessions.resolve(fresh.sessionToken);
    const selection = await selections.getSelection(current);
    expect(selection.status).toBe('submitted');
    expect(selection.items.map((item) => item.photoId)).toContain(photoId);
    await expect(new DownloadService(pool, {} as PhotoStorage).create(current, photoId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a different studio and a gallery uploader attempting to publish', async () => {
    const { actor, galleryId } = await fixture();
    await readyPhoto(galleryId);
    await access.create(actor, galleryId, { permission: 'view' });
    await expect(galleries.publish({ ...actor, studioId: randomUUID() }, galleryId)).rejects.toMatchObject({ code: 'GALLERY_NOT_FOUND' });
    const uploaderId = randomUUID();
    cleanup.push({ studioId: actor.studioId, userId: uploaderId });
    await pool.query("INSERT INTO users (id, email, display_name, auth_provider) VALUES ($1, $2, 'Test uploader', 'integration-test')", [uploaderId, `uploader-${uploaderId}@example.test`]);
    await pool.query("INSERT INTO studio_members (id, studio_id, user_id, role) VALUES ($1, $2, $3, 'assistant')", [randomUUID(), actor.studioId, uploaderId]);
    await pool.query("INSERT INTO gallery_members (id, gallery_id, user_id, role) VALUES ($1, $2, $3, 'uploader')", [randomUUID(), galleryId, uploaderId]);
    const uploader: PhotographerContext = { ...actor, userId: uploaderId, role: 'assistant' };
    await expect(galleries.publish(uploader, galleryId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await galleries.get(actor, galleryId)).publicationStatus).toBe('unpublished');
  });
});
