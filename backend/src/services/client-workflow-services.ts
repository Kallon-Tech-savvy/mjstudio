import { randomUUID } from 'node:crypto';
import type { ClientContext, PhotographerContext } from '../auth/context.js';
import { ensureGalleryPermission } from '../application/policies/gallery.policy.js';
import { canDownloadFromGallery, canReadClientGallery } from '../application/policies/client-gallery.policy.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import type { PhotoStorage } from './photo-service.js';
import { inTransaction, resolveGalleryMembership, type Database } from './service-common.js';

export class SelectionService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async getSelection(client: ClientContext) {
    await this.assertCurrentGrant(this.database, client);
    return inTransaction(this.database, async (transaction) => {
      const selection = await this.ensureSelection(transaction, client);
      const items = await transaction.query(
        `SELECT gsi.photo_id AS "photoId", gsi.selected, gsi.updated_at AS "updatedAt"
           FROM gallery_selection_items gsi
           JOIN photos p ON p.id = gsi.photo_id
          WHERE gsi.gallery_selection_id = $1 AND p.gallery_id = $2 AND p.deleted_at IS NULL
          ORDER BY p.position`,
        [selection.id, client.galleryId],
      );
      return {
        id: selection.id,
        status: selection.status,
        submittedAt: selection.submitted_at,
        createdAt: selection.created_at,
        updatedAt: selection.updated_at,
        items: items.rows,
      };
    });
  }

  async setSelection(client: ClientContext, photoId: string, selected: boolean) {
    canReadClientGallery(client, client.galleryId);
    if (typeof selected !== 'boolean') throw new ValidationError('INVALID_SELECTION', 'Selection value is invalid.');

    return inTransaction(this.database, async (transaction) => {
      await this.assertCurrentGrant(transaction, client);
      const selection = await this.ensureSelection(transaction, client);
      if (selection.status === 'submitted') {
        throw new ConflictError('SELECTION_ALREADY_SUBMITTED', 'Selection has already been submitted.');
      }

      const photo = await transaction.query(
        "SELECT id FROM photos WHERE id = $1 AND gallery_id = $2 AND deleted_at IS NULL AND status = 'active'",
        [photoId, client.galleryId],
      );
      if (!photo.rows[0]) throw new NotFoundError('PHOTO_NOT_FOUND', 'Photo not found.');

      const result = await transaction.query(
        `INSERT INTO gallery_selection_items (id, gallery_selection_id, photo_id, selected)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (gallery_selection_id, photo_id)
         DO UPDATE SET selected = EXCLUDED.selected, updated_at = NOW()
         RETURNING id, photo_id AS "photoId", selected, updated_at AS "updatedAt"`,
        [this.createId(), selection.id, photoId, selected],
      );

      await transaction.query(
        `INSERT INTO photo_selections (id, gallery_access_id, photo_id, selection)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (gallery_access_id, photo_id)
         DO UPDATE SET selection = EXCLUDED.selection, updated_at = NOW()`,
        [this.createId(), client.galleryAccessId, photoId, selected ? 'favourite' : 'neutral'],
      );

      return { ...result.rows[0], status: selection.status };
    });
  }

  async submitSelection(client: ClientContext) {
    canReadClientGallery(client, client.galleryId);
    return inTransaction(this.database, async (transaction) => {
      await this.assertCurrentGrant(transaction, client);
      const selection = await this.ensureSelection(transaction, client);

      if (selection.status === 'submitted') {
        return {
          id: selection.id,
          status: selection.status,
          submittedAt: selection.submitted_at,
          selectedCount: await this.countSelected(transaction, selection.id),
        };
      }

      const result = await transaction.query(
        `UPDATE gallery_selections
            SET status = 'submitted', submitted_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND status = 'draft'
          RETURNING id, status, submitted_at AS "submittedAt"`,
        [selection.id],
      );
      const submitted = result.rows[0];
      if (!submitted) throw new ConflictError('SELECTION_ALREADY_SUBMITTED', 'Selection has already been submitted.');

      return {
        ...submitted,
        selectedCount: await this.countSelected(transaction, selection.id),
      };
    });
  }

  async getSelections(client: ClientContext) {
    const selection = await this.getSelection(client);
    return selection.items;
  }

  private async ensureSelection(queryable: { query: Database['query'] }, client: ClientContext) {
    const existing = await queryable.query(
      `SELECT id, status, submitted_at, created_at, updated_at
         FROM gallery_selections
        WHERE gallery_access_id = $1`,
      [client.galleryAccessId],
    );
    if (existing.rows[0]) return existing.rows[0];

    const result = await queryable.query(
      `INSERT INTO gallery_selections (id, gallery_access_id)
       VALUES ($1, $2)
       ON CONFLICT (gallery_access_id) DO UPDATE SET updated_at = gallery_selections.updated_at
       RETURNING id, status, submitted_at, created_at, updated_at`,
      [this.createId(), client.galleryAccessId],
    );
    return result.rows[0];
  }

  private async countSelected(queryable: { query: Database['query'] }, selectionId: string) {
    const result = await queryable.query(
      'SELECT COUNT(*)::int AS count FROM gallery_selection_items WHERE gallery_selection_id = $1 AND selected = TRUE',
      [selectionId],
    );
    return result.rows[0].count;
  }

  private async assertCurrentGrant(queryable: { query: Database['query'] }, client: ClientContext) {
    const result = await queryable.query(
      `SELECT 1 FROM client_sessions cs JOIN gallery_access ga ON ga.id = cs.gallery_access_id
         JOIN galleries g ON g.id = ga.gallery_id
        WHERE cs.id = $1 AND ga.id = $2 AND ga.gallery_id = $3 AND cs.revoked_at IS NULL AND ga.revoked_at IS NULL
          AND g.archived_at IS NULL AND (cs.expires_at IS NULL OR cs.expires_at > NOW())
          AND g.publication_status = 'published' AND (ga.expires_at IS NULL OR ga.expires_at > NOW())`,
      [client.clientSessionId, client.galleryAccessId, client.galleryId],
    );
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