import { randomUUID } from 'node:crypto';
import type { ClientContext, PhotographerContext } from '../auth/context.js';
import { ensureGalleryPermission } from '../application/policies/gallery.policy.js';
import { canDownloadFromGallery, canReadClientGallery } from '../application/policies/client-gallery.policy.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import type { PhotoStorage } from './photo-service.js';
import { inTransaction, resolveGalleryMembership, type Database } from './service-common.js';

export class SelectionService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async setSelection(client: ClientContext, photoId: string, selection: 'neutral' | 'favourite' | 'not_for_me') {
    canReadClientGallery(client, client.galleryId);
    if (!['neutral', 'favourite', 'not_for_me'].includes(selection)) throw new ValidationError('INVALID_SELECTION', 'Selection value is invalid.');
    return inTransaction(this.database, async (transaction) => {
      await this.assertCurrentGrant(transaction, client);
      const photo = await transaction.query(
        "SELECT id FROM photos WHERE id = $1 AND gallery_id = $2 AND deleted_at IS NULL AND status = 'active'",
        [photoId, client.galleryId]);
      if (!photo.rows[0]) throw new NotFoundError('PHOTO_NOT_FOUND', 'Photo not found.');
      const result = await transaction.query(
        `INSERT INTO photo_selections (id, gallery_access_id, photo_id, selection)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (gallery_access_id, photo_id) DO UPDATE SET selection = EXCLUDED.selection, updated_at = NOW()
         RETURNING id, photo_id AS "photoId", selection, updated_at AS "updatedAt"`,
        [this.createId(), client.galleryAccessId, photoId, selection]);
      return result.rows[0];
    });
  }

  async getSelections(client: ClientContext) {
    await this.assertCurrentGrant(this.database, client);
    const result = await this.database.query(
      `SELECT ps.photo_id AS "photoId", ps.selection, ps.updated_at AS "updatedAt"
         FROM photo_selections ps JOIN photos p ON p.id = ps.photo_id
        WHERE ps.gallery_access_id = $1 AND p.gallery_id = $2 AND p.deleted_at IS NULL ORDER BY p.position`,
      [client.galleryAccessId, client.galleryId]);
    return result.rows;
  }

  private async assertCurrentGrant(queryable: { query: Database['query'] }, client: ClientContext) {
    const result = await queryable.query(
      `SELECT 1 FROM client_sessions cs JOIN gallery_access ga ON ga.id = cs.gallery_access_id
         JOIN galleries g ON g.id = ga.gallery_id
        WHERE cs.id = $1 AND ga.id = $2 AND ga.gallery_id = $3 AND cs.revoked_at IS NULL AND ga.revoked_at IS NULL
          AND g.archived_at IS NULL AND (cs.expires_at IS NULL OR cs.expires_at > NOW())
          AND g.publication_status = 'published' AND (ga.expires_at IS NULL OR ga.expires_at > NOW())`,
      [client.clientSessionId, client.galleryAccessId, client.galleryId]);
    if (!result.rows[0]) throw new ForbiddenError('INVALID_GALLERY_ACCESS');
  }
}

export class RecommendationService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async recommend(actor: PhotographerContext, galleryId: string, photoId: string) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'photo.recommend');
    return inTransaction(this.database, async (transaction) => {
      const photo = await transaction.query("SELECT id FROM photos WHERE id = $1 AND gallery_id = $2 AND deleted_at IS NULL AND status = 'active'", [photoId, galleryId]);
      if (!photo.rows[0]) throw new NotFoundError('PHOTO_NOT_IN_GALLERY', 'Photo not found in this gallery.');
      const result = await transaction.query(
        `INSERT INTO recommendations (id, gallery_id, photo_id) VALUES ($1, $2, $3)
         ON CONFLICT (gallery_id, photo_id) DO NOTHING RETURNING id, gallery_id AS "galleryId", photo_id AS "photoId"`,
        [this.createId(), galleryId, photoId]);
      if (result.rows[0]) return result.rows[0];
      const existing = await transaction.query('SELECT id, gallery_id AS "galleryId", photo_id AS "photoId" FROM recommendations WHERE gallery_id = $1 AND photo_id = $2', [galleryId, photoId]);
      return existing.rows[0];
    });
  }

  async unrecommend(actor: PhotographerContext, galleryId: string, photoId: string) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'photo.recommend');
    const photo = await this.database.query('SELECT id FROM photos WHERE id = $1 AND gallery_id = $2', [photoId, galleryId]);
    if (!photo.rows[0]) throw new NotFoundError('PHOTO_NOT_IN_GALLERY', 'Photo not found in this gallery.');
    await this.database.query('DELETE FROM recommendations WHERE gallery_id = $1 AND photo_id = $2', [galleryId, photoId]);
    return { galleryId, photoId, recommended: false };
  }

  async list(actor: PhotographerContext, galleryId: string) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'gallery.view');
    const result = await this.database.query(
      `SELECT r.photo_id AS "photoId", r.created_at AS "createdAt" FROM recommendations r
        JOIN photos p ON p.id = r.photo_id
       WHERE r.gallery_id = $1 AND p.gallery_id = r.gallery_id AND p.deleted_at IS NULL ORDER BY r.created_at`, [galleryId]);
    return result.rows;
  }
}

export class DownloadService {
  constructor(private readonly database: Database, private readonly storage: PhotoStorage, private readonly createId: () => string = randomUUID) {}

  async create(client: ClientContext, photoId: string) {
    canReadClientGallery(client, client.galleryId);
    canDownloadFromGallery(client, client.galleryId);
    const result = await this.database.query<{ storage_key: string; photo_id: string }>(
      `SELECT pa.storage_key, p.id AS photo_id FROM photos p JOIN photo_assets pa ON pa.photo_id = p.id
        JOIN galleries g ON g.id = p.gallery_id
        JOIN client_sessions cs ON cs.id = $3 JOIN gallery_access ga ON ga.id = cs.gallery_access_id
       WHERE p.id = $1 AND p.gallery_id = $2 AND p.deleted_at IS NULL AND p.status = 'active'
         AND pa.type = 'original' AND pa.state = 'current' AND pa.upload_status = 'uploaded'
         AND EXISTS (SELECT 1 FROM photo_assets pv WHERE pv.photo_id = p.id AND pv.type = 'preview' AND pv.state = 'current' AND pv.upload_status = 'uploaded' AND pv.processing_status = 'ready')
         AND EXISTS (SELECT 1 FROM photo_assets pt WHERE pt.photo_id = p.id AND pt.type = 'thumbnail' AND pt.state = 'current' AND pt.upload_status = 'uploaded' AND pt.processing_status = 'ready')
         AND g.publication_status = 'published' AND g.archived_at IS NULL
         AND ga.id = $4 AND ga.gallery_id = p.gallery_id AND ga.permission = 'view_download'
         AND ga.revoked_at IS NULL AND cs.revoked_at IS NULL
         AND (ga.expires_at IS NULL OR ga.expires_at > NOW()) AND (cs.expires_at IS NULL OR cs.expires_at > NOW())`,
      [photoId, client.galleryId, client.clientSessionId, client.galleryAccessId]);
    const photo = result.rows[0];
    if (!photo) throw new NotFoundError('DOWNLOAD_NOT_READY', 'Photo is not available for download.');
    await this.database.query('INSERT INTO photo_downloads (id, gallery_access_id, client_session_id, photo_id) VALUES ($1, $2, $3, $4)', [this.createId(), client.galleryAccessId, client.clientSessionId, photoId]);
    const capability = await this.storage.createDownloadCapability(photo.storage_key, 120);
    return capability;
  }
}

export class FeedbackService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async createGalleryFeedback(client: ClientContext, message: string) {
    const normalized = this.validateMessage(message);
    await this.assertCurrentClientScope(client);
    const result = await this.database.query(
      'INSERT INTO gallery_feedback (id, gallery_access_id, message) VALUES ($1, $2, $3) RETURNING id, message, created_at AS "createdAt"',
      [this.createId(), client.galleryAccessId, normalized]);
    return result.rows[0];
  }

  async createPhotoFeedback(client: ClientContext, photoId: string, message: string) {
    const normalized = this.validateMessage(message);
    await this.assertCurrentClientScope(client);
    const photo = await this.database.query(
      "SELECT id FROM photos WHERE id = $1 AND gallery_id = $2 AND deleted_at IS NULL AND status = 'active'", [photoId, client.galleryId]);
    if (!photo.rows[0]) throw new NotFoundError('PHOTO_NOT_IN_GALLERY', 'Photo not found in this gallery.');
    const result = await this.database.query(
      'INSERT INTO photo_feedback (id, gallery_access_id, photo_id, message) VALUES ($1, $2, $3, $4) RETURNING id, photo_id AS "photoId", message, created_at AS "createdAt"',
      [this.createId(), client.galleryAccessId, photoId, normalized]);
    return result.rows[0];
  }

  private validateMessage(message: string) {
    const normalized = message.trim();
    if (!normalized || normalized.length > 5000) throw new ValidationError('INVALID_FEEDBACK', 'Feedback must be between 1 and 5000 characters.');
    return normalized;
  }

  private async assertCurrentClientScope(client: ClientContext) {
    canReadClientGallery(client, client.galleryId);
    const grant = await this.database.query(
      `SELECT 1 FROM client_sessions cs JOIN gallery_access ga ON ga.id = cs.gallery_access_id JOIN galleries g ON g.id = ga.gallery_id
        WHERE cs.id = $1 AND ga.id = $2 AND ga.gallery_id = $3 AND cs.revoked_at IS NULL AND ga.revoked_at IS NULL
          AND g.archived_at IS NULL AND g.publication_status = 'published' AND (cs.expires_at IS NULL OR cs.expires_at > NOW())
          AND (ga.expires_at IS NULL OR ga.expires_at > NOW())`,
      [client.clientSessionId, client.galleryAccessId, client.galleryId]);
    if (!grant.rows[0]) throw new ForbiddenError('INVALID_GALLERY_ACCESS');
  }
}