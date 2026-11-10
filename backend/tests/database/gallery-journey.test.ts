import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
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

async function readyPhoto(galleryId: string, missingThumbnail = false, position = 0) {
  const photoId = randomUUID();
  await pool.query("INSERT INTO photos (id, gallery_id, filename, position, status) VALUES ($1, $2, 'portrait.jpg', $3, 'active')", [photoId, galleryId, position]);
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

async function waitForBlockedRequest(blockerPid: number, settled: () => boolean) {
  const deadline = Date.now() + 5_000;
  while (!settled() && Date.now() < deadline) {
    const result = await pool.query('SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS blocked', [blockerPid]);
    if (result.rows[0].blocked) return true;
    await delay(10);
  }
  return false;
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
  it('creates one gallery and client for concurrent attempts and a later lost-response retry', async () => {
    const { actor } = await fixture();
    const input = { requestId: randomUUID(), name: 'Retry portraits', newClient: { name: 'Retry client' } };
    const [first, second] = await Promise.all([galleries.create(actor, input), galleries.create(actor, input)]);
    expect(second).toEqual(first);
    expect(await galleries.create(actor, input)).toEqual(first);
    const count = await pool.query('SELECT COUNT(*)::int AS count FROM galleries WHERE studio_id = $1 AND name = $2', [actor.studioId, input.name]);
    expect(count.rows[0].count).toBe(1);
    const clients = await pool.query('SELECT COUNT(*)::int AS count FROM clients WHERE studio_id = $1 AND name = $2', [actor.studioId, input.newClient.name]);
    expect(clients.rows[0].count).toBe(1);
  });

  it('rejects changed payloads and rechecks membership before returning a creation receipt', async () => {
    const { actor } = await fixture();
    const input = { requestId: randomUUID(), name: 'Original request', newClient: { name: 'Receipt client' } };
    await galleries.create(actor, input);
    await expect(galleries.create(actor, { ...input, name: 'Changed request' })).rejects.toMatchObject({ code: 'CREATION_REQUEST_CONFLICT' });
    await pool.query('DELETE FROM studio_members WHERE studio_id = $1 AND user_id = $2', [actor.studioId, actor.userId]);
    await expect(galleries.create(actor, input)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('scopes creation receipts to the authenticated studio and photographer', async () => {
    const a = await fixture();
    const b = await fixture();
    const input = { requestId: randomUUID(), name: 'Shared key', newClient: { name: 'Isolated client' } };
    const first = await galleries.create(a.actor, input);
    const second = await galleries.create(b.actor, input);
    expect(first.id).not.toBe(second.id);
    expect(first.studioId).toBe(a.actor.studioId);
    expect(second.studioId).toBe(b.actor.studioId);
  });

  it('rolls back failed attempts without orphan clients or receipts and allows a corrected retry', async () => {
    const { actor } = await fixture();
    const input = { requestId: randomUUID(), name: 'Rollback request', newClient: { name: 'Rollback client' }, expiresAt: new Date('2000-01-01') };
    await expect(galleries.create(actor, input)).rejects.toMatchObject({ code: 'INVALID_GALLERY_DATA' });
    const clients = await pool.query('SELECT COUNT(*)::int AS count FROM clients WHERE studio_id = $1 AND name = $2', [actor.studioId, input.newClient.name]);
    expect(clients.rows[0].count).toBe(0);
    const receipts = await pool.query('SELECT COUNT(*)::int AS count FROM gallery_creation_requests WHERE studio_id = $1', [actor.studioId]);
    expect(receipts.rows[0].count).toBe(0);
    const result = await galleries.create(actor, { ...input, expiresAt: null });
    expect(result.name).toBe(input.name);
  });

  async function preparedFixture() {
    const f = await publishedFixture();
    const otherId = await readyPhoto(f.galleryId, false, 1);
    for (const id of [f.photoId, otherId]) await selections.setSelection(f.client, id, true);
    await selections.submitSelection(f.client);
    for (const id of [f.photoId, otherId]) await proofing.setReview(f.actor, f.galleryId, id, 'approved');
    await deliveries.prepareDelivery(f.actor, f.galleryId);
    return { ...f, otherId };
  }

  it('preserves a released delivery when preparation and release are retried together', async () => {
    const f = await preparedFixture();
    const released = await deliveries.releaseDelivery(f.actor, f.galleryId);
    const results = await Promise.all([
      deliveries.prepareDelivery(f.actor, f.galleryId),
      deliveries.releaseDelivery(f.actor, f.galleryId),
    ]);
    for (const result of results) {
      expect(result.releasedAt).toEqual(released.releasedAt);
      expect(result.items).toEqual(released.items);
      expect(result.status).toBe('ready');
    }
  });

  it.each(['deleted', 'missing-original'] as const)('rejects release if any prepared item is %s', async (state) => {
    const f = await preparedFixture();
    if (state === 'deleted') await pool.query('UPDATE photos SET deleted_at = NOW() WHERE id = $1', [f.otherId]);
    else await pool.query("UPDATE photo_assets SET state = 'superseded' WHERE photo_id = $1 AND type = 'original'", [f.otherId]);
    await expect(deliveries.releaseDelivery(f.actor, f.galleryId)).rejects.toMatchObject({ code: 'DELIVERY_NOT_READY' });
    expect((await deliveries.getClientDelivery(f.client, f.galleryId)).isReleased).toBe(false);
  });

  it('removes stale items only when the photographer prepares the unreleased delivery again', async () => {
    const f = await preparedFixture();
    await pool.query('UPDATE photos SET deleted_at = NOW() WHERE id = $1', [f.otherId]);
    const prepared = await deliveries.prepareDelivery(f.actor, f.galleryId);
    expect(prepared.items.map((item) => item.photoId)).toEqual([f.photoId]);
    expect(prepared.releasedAt).toBeNull();
    await deliveries.releaseDelivery(f.actor, f.galleryId);
    expect((await deliveries.getClientDelivery(f.client, f.galleryId)).items).toHaveLength(1);
  });

  it('keeps the approval of a released delivery item immutable', async () => {
    const f = await preparedFixture();
    await deliveries.releaseDelivery(f.actor, f.galleryId);
    await expect(proofing.setReview(f.actor, f.galleryId, f.photoId, 'needs_revision', 'Check the crop'))
      .rejects.toMatchObject({ code: 'DELIVERY_ALREADY_RELEASED' });
    const review = await pool.query('SELECT status FROM gallery_proofing_reviews WHERE photo_id = $1', [f.photoId]);
    expect(review.rows[0].status).toBe('approved');
  });

  it('waits for an overlapping proofing change before validating release', async () => {
    const f = await preparedFixture();
    const reviewing = await pool.connect();
    let release: Promise<unknown> | undefined;
    try {
      await reviewing.query('BEGIN');
      const { rows: [{ pid }] } = await reviewing.query('SELECT pg_backend_pid() AS pid');
      await reviewing.query('SELECT id FROM galleries WHERE id = $1 FOR UPDATE', [f.galleryId]);
      await reviewing.query("UPDATE gallery_proofing_reviews SET status = 'needs_revision', note = 'Check the crop' WHERE photo_id = $1", [f.photoId]);
      let settled = false;
      release = deliveries.releaseDelivery(f.actor, f.galleryId).then(
        (value) => { settled = true; return value; },
        (error: unknown) => { settled = true; return error; },
      );
      expect(await waitForBlockedRequest(pid, () => settled)).toBe(true);
      await reviewing.query('COMMIT');
      expect(await release).toMatchObject({ code: 'DELIVERY_NOT_READY' });
      expect((await deliveries.getClientDelivery(f.client, f.galleryId)).isReleased).toBe(false);
    } finally { await reviewing.query('ROLLBACK'); reviewing.release(); await release; }
  });

  it('rejects an edit that overlaps a submission and preserves both selection records', async () => {
    const { client, photoId } = await publishedFixture();
    await selections.setSelection(client, photoId, true);
    const selection = await selections.getSelection(client);
    const submitting = await pool.connect();
    let edit: Promise<unknown> | undefined;
    try {
      await submitting.query('BEGIN');
      const { rows: [{ pid }] } = await submitting.query('SELECT pg_backend_pid() AS pid');
      // Hold the same row update as submitSelection before its commit. The other
      // connection must wait BEFORE trusting the old draft status.
      await submitting.query("UPDATE gallery_selections SET status = 'submitted', submitted_at = NOW() WHERE id = $1", [selection.id]);
      let settled = false;
      edit = selections.setSelection(client, photoId, false).then(
        (value) => { settled = true; return value; },
        (error: unknown) => { settled = true; return error; },
      );
      const blocked = await waitForBlockedRequest(pid, () => settled);
      expect(blocked, 'edit must wait for the submission transaction').toBe(true);
      await submitting.query('COMMIT');
      expect(await edit).toMatchObject({ code: 'SELECTION_ALREADY_SUBMITTED' });
      const stored = await selections.getSelection(client);
      expect(stored.status).toBe('submitted');
      expect(stored.items).toEqual([expect.objectContaining({ photoId, selected: true })]);
      const legacy = await pool.query('SELECT selection FROM photo_selections WHERE gallery_access_id = $1 AND photo_id = $2', [client.galleryAccessId, photoId]);
      expect(legacy.rows[0].selection).toBe('favourite');
      expect((await selections.submitSelection(client)).selectedCount).toBe(1);
    } finally {
      await submitting.query('ROLLBACK');
      submitting.release();
      await edit;
    }
  });

  it.each([false, true])('returns one stable receipt for simultaneous submissions (existing shortlist: %s)', async (existing) => {
    const { client, photoId } = await publishedFixture();
    if (existing) await selections.setSelection(client, photoId, true);
    const receipts = await Promise.all([
      selections.submitSelection(client),
      selections.submitSelection(client),
    ]);
    expect(receipts[0]).toEqual(receipts[1]);
    expect(receipts[0]).toMatchObject({ status: 'submitted', selectedCount: existing ? 1 : 0 });
    await expect(selections.setSelection(client, photoId, false)).rejects.toMatchObject({ code: 'SELECTION_ALREADY_SUBMITTED' });
  });

  it.each(['read', 'edit', 'submit'] as const)('rejects a %s waiting on access revocation without changing the shortlist', async (operation) => {
    const { client, photoId } = await publishedFixture();
    await selections.setSelection(client, photoId, true);
    const revoking = await pool.connect();
    let request: Promise<unknown> | undefined;
    try {
      await revoking.query('BEGIN');
      const { rows: [{ pid }] } = await revoking.query('SELECT pg_backend_pid() AS pid');
      await revoking.query('UPDATE gallery_access SET revoked_at = NOW() WHERE id = $1', [client.galleryAccessId]);
      let settled = false;
      const pending = operation === 'read' ? selections.getSelection(client)
        : operation === 'edit' ? selections.setSelection(client, photoId, false)
        : selections.submitSelection(client);
      request = pending.then(
        (value) => { settled = true; return value; },
        (error: unknown) => { settled = true; return error; },
      );
      expect(await waitForBlockedRequest(pid, () => settled)).toBe(true);
      await revoking.query('COMMIT');
      expect(await request).toMatchObject({ statusCode: 403, code: 'FORBIDDEN', message: 'INVALID_GALLERY_ACCESS' });
      const stored = await pool.query(`SELECT gs.status, gsi.selected FROM gallery_selections gs
        JOIN gallery_selection_items gsi ON gsi.gallery_selection_id = gs.id
        WHERE gs.gallery_access_id = $1`, [client.galleryAccessId]);
      expect(stored.rows).toEqual([{ status: 'draft', selected: true }]);
    } finally {
      await revoking.query('ROLLBACK');
      revoking.release();
      await request;
    }
  });

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
