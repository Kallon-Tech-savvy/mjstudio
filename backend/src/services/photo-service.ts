import { randomUUID } from 'node:crypto';
import type { PhotographerContext } from '../auth/context.js';
import { ensureGalleryPermission, type GalleryPermission } from '../application/policies/gallery.policy.js';
import { ensurePhotoInGallery } from '../application/policies/photo.policy.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { inTransaction, resolveGalleryMembership, type Database } from './service-common.js';
import { JobService } from './job-service.js';

export type VerifiedStoredObject = { storageKey: string; mimeType: string; fileSize: number; width: number; height: number };
export interface PhotoStorage {
  createUploadCapability(storageKey: string, expiresInSeconds: number): Promise<{ url: string; expiresAt: Date }>;
  verifyObject(storageKey: string): Promise<VerifiedStoredObject | null>;
  createViewCapability(storageKey: string, expiresInSeconds: number): Promise<{ url: string; expiresAt: Date }>;
  createDownloadCapability(storageKey: string, expiresInSeconds: number): Promise<{ url: string; expiresAt: Date }>;
}
export class PhotoService {
  constructor(
    private readonly database: Database,
    private readonly storage: PhotoStorage,
    private readonly jobs: JobService,
    private readonly createId: () => string = randomUUID,
  ) {}

  async create(actor: PhotographerContext, galleryId: string, input: { filename: string; mimeType: string; fileSize?: number }) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'photo.create');
    if (membership.archivedAt) throw new ConflictError('INVALID_GALLERY_STATE', 'Cannot add photos to an archived gallery.');
    const filename = input.filename.trim();
    if (!filename || filename.length > 255 || !input.mimeType.trim() || (input.fileSize !== undefined && (!Number.isSafeInteger(input.fileSize) || input.fileSize < 1))) throw new ValidationError('INVALID_PHOTO_DATA', 'A valid filename, MIME type, and file size are required.');
    const photoId = this.createId();
    const assetId = this.createId();
    const storageKey = `studios/${actor.studioId}/galleries/${galleryId}/photos/${photoId}/original`;
    const result = await inTransaction(this.database, async (transaction) => {
      const state = await transaction.query('SELECT archived_at FROM galleries WHERE id = $1 AND studio_id = $2 FOR UPDATE', [galleryId, actor.studioId]);
      if (!state.rows[0]) throw new NotFoundError('GALLERY_NOT_FOUND', 'Gallery not found.');
      if (state.rows[0].archived_at) throw new ConflictError('INVALID_GALLERY_STATE', 'Cannot add photos to an archived gallery.');
      const photo = await transaction.query(
        `INSERT INTO photos (id, gallery_id, filename, position, status)
         SELECT $1, $2, $3, COALESCE(MAX(position) + 1, 0), 'processing' FROM photos WHERE gallery_id = $2 AND deleted_at IS NULL
         RETURNING id, gallery_id AS "galleryId", filename, status, position`,
        [photoId, galleryId, filename],
      );
      await transaction.query(
        `INSERT INTO photo_assets (id, photo_id, type, state, storage_key, mime_type, file_size, upload_status, processing_status)
         VALUES ($1, $2, 'original', 'current', $3, $4, $5, 'pending', 'not_required')`,
        [assetId, photoId, storageKey, input.mimeType.trim(), input.fileSize ?? null]);
      return photo.rows[0];
    });
    const capability = await this.storage.createUploadCapability(storageKey, 600);
    return {
      photo: { id: result.id, position: result.position, status: result.status },
      asset: { id: assetId, type: 'original', uploadStatus: 'pending', processingStatus: 'not_required', state: 'current' },
      upload: { method: 'PUT', url: capability.url, expiresAt: capability.expiresAt },
    };
  }

  async get(actor: PhotographerContext, galleryId: string, photoId: string) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'photo.view');
    const result = await this.database.query(
      `SELECT p.id, p.gallery_id AS "galleryId", p.filename, p.status, p.position
         FROM photos p WHERE p.id = $1 AND p.gallery_id = $2 AND p.deleted_at IS NULL`, [photoId, galleryId]);
    if (!result.rows[0]) throw new NotFoundError('PHOTO_NOT_FOUND', 'Photo not found.');
    return result.rows[0];
  }

  async resolveGalleryId(actor: PhotographerContext, photoId: string): Promise<string> {
    const result = await this.database.query<{ gallery_id: string }>(
      `SELECT p.gallery_id FROM photos p JOIN galleries g ON g.id = p.gallery_id
        JOIN studio_members sm ON sm.studio_id = g.studio_id AND sm.user_id = $2
        JOIN gallery_members gm ON gm.gallery_id = g.id AND gm.user_id = $2
      WHERE p.id = $1 AND g.studio_id = $3 AND p.deleted_at IS NULL`, [photoId, actor.userId, actor.studioId]);
    const row = result.rows[0];
    if (!row || actor.studioId === '') throw new NotFoundError('PHOTO_NOT_FOUND', 'Photo not found.');
    return row.gallery_id;
  }

  async list(actor: PhotographerContext, galleryId: string, page: number, limit: number) {
    return this.catalogList(actor, galleryId, page, limit);
  }

  private async catalogList(actor: PhotographerContext, galleryId: string, page: number, limit: number) {
    const { CatalogService } = await import('./catalog-service.js');
    return new CatalogService(this.database).listPhotos(actor, galleryId, page, limit);
  }

  async update(actor: PhotographerContext, galleryId: string, photoId: string, input: { filename: string }) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'photo.update');
    const filename = input.filename.trim();
    if (!filename || filename.length > 255) throw new ValidationError('INVALID_PHOTO_DATA', 'Filename must be between 1 and 255 characters.');
    const result = await this.database.query(
      `UPDATE photos SET filename = $3, updated_at = NOW()
        WHERE id = $1 AND gallery_id = $2 AND deleted_at IS NULL RETURNING id, gallery_id AS "galleryId", filename, status, position`,
      [photoId, galleryId, filename]);
    if (!result.rows[0]) throw new NotFoundError('PHOTO_NOT_FOUND', 'Photo not found.');
    return result.rows[0];
  }

  async delete(actor: PhotographerContext, galleryId: string, photoId: string) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'photo.delete');
    const result = await inTransaction(this.database, async (transaction) => {
      const photo = await transaction.query('SELECT id FROM photos WHERE id = $1 AND gallery_id = $2 AND deleted_at IS NULL FOR UPDATE', [photoId, galleryId]);
      if (!photo.rows[0]) throw new NotFoundError('PHOTO_NOT_FOUND', 'Photo not found.');
        const assets = await transaction.query<{ storage_key: string }>('SELECT storage_key FROM photo_assets WHERE photo_id = $1', [photoId]);
      await transaction.query('UPDATE photos SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [photoId]);
      const job = await this.jobs.enqueueInTransaction(transaction, {
        type: 'CLEANUP_PHOTO_ASSETS',
        payload: { photoId },
      });
      return assets.rows.map((asset) => asset.storage_key);
    });
    return { id: photoId, deleted: true, cleanupScheduled: result.length };
  }

  async reorder(actor: PhotographerContext, galleryId: string, orderedPhotoIds: string[]) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'photo.reorder');
    if (new Set(orderedPhotoIds).size !== orderedPhotoIds.length) throw new ValidationError('INVALID_PHOTO_ORDER', 'Photo order contains duplicate IDs.');
    return inTransaction(this.database, async (transaction) => {
      await transaction.query('SELECT id FROM galleries WHERE id = $1 AND studio_id = $2 FOR UPDATE', [galleryId, actor.studioId]);
      const active = await transaction.query<{ id: string; position: number }>('SELECT id, position FROM photos WHERE gallery_id = $1 AND deleted_at IS NULL ORDER BY position FOR UPDATE', [galleryId]);
      const activeIds = active.rows.map((photo) => photo.id);
      if (orderedPhotoIds.length !== activeIds.length || orderedPhotoIds.some((id) => !activeIds.includes(id))) {
        throw new ValidationError('INVALID_PHOTO_ORDER', 'Ordering must contain every active gallery photo exactly once.');
      }
      const offset = Math.max(0, ...active.rows.map((photo) => photo.position)) + activeIds.length + 1;
      for (const [index, photoId] of orderedPhotoIds.entries()) {
        await transaction.query('UPDATE photos SET position = $3 WHERE id = $1 AND gallery_id = $2 AND deleted_at IS NULL', [photoId, galleryId, offset + index]);
      }
      for (const [position, photoId] of orderedPhotoIds.entries()) {
        await transaction.query('UPDATE photos SET position = $3, updated_at = NOW() WHERE id = $1 AND gallery_id = $2 AND deleted_at IS NULL', [photoId, galleryId, position]);
      }
      return orderedPhotoIds;
    });
  }

  async uploadComplete(actor: PhotographerContext, galleryId: string, photoId: string) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'photo.upload');
    const pending = await this.database.query<{ id: string; storage_key: string; upload_status: string; processing_status: string }>(
      `SELECT pa.id, pa.storage_key, pa.upload_status, pa.processing_status
         FROM photo_assets pa JOIN photos p ON p.id = pa.photo_id
        WHERE p.id = $1 AND p.gallery_id = $2 AND p.deleted_at IS NULL
          AND pa.type = 'original' AND pa.state = 'current'`, [photoId, galleryId]);
    const asset = pending.rows[0];
    if (!asset) throw new NotFoundError('PHOTO_NOT_FOUND', 'Photo not found.');
    if (asset.upload_status === 'uploaded') {
      const state = await this.database.query<{ status: string; processing_status: string }>(
        `SELECT p.status, pa.processing_status FROM photos p JOIN photo_assets pa ON pa.photo_id = p.id
          WHERE p.id = $1 AND pa.id = $2`, [photoId, asset.id]);
      return { photoId, assetId: asset.id, status: state.rows[0]?.status ?? 'processing', asset: { uploadStatus: 'uploaded', processingStatus: state.rows[0]?.processing_status ?? 'not_required' } };
    }
    let verified: VerifiedStoredObject | null;
    try {
      verified = await this.storage.verifyObject(asset.storage_key);
    } catch (error) {
      await this.jobs.enqueue({ type: 'RECONCILE_PHOTO_ASSET', payload: { assetId: asset.id } });
      throw error;
    }
    if (!verified || verified.storageKey !== asset.storage_key || verified.fileSize <= 0 || verified.width <= 0 || verified.height <= 0) {
      await inTransaction(this.database, async (transaction) => {
        await transaction.query("UPDATE photo_assets SET upload_status = 'failed', updated_at = NOW() WHERE id = $1 AND upload_status = 'pending'", [asset.id]);
        await transaction.query("UPDATE photos SET status = 'failed', updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL", [photoId]);
      });
      throw new ConflictError('UPLOAD_NOT_VERIFIED', 'Uploaded object could not be verified.');
    }
    const result = await inTransaction(this.database, async (transaction) => {
      const row = await transaction.query<{ upload_status: string }>('SELECT upload_status FROM photo_assets WHERE id = $1 FOR UPDATE', [asset.id]);
      if (!row.rows[0]) throw new NotFoundError('PHOTO_NOT_FOUND', 'Photo asset not found.');
      if (row.rows[0].upload_status === 'uploaded') return { alreadyUploaded: true };
      await transaction.query("UPDATE photo_assets SET upload_status = 'uploaded', mime_type = $2, file_size = $3, width = $4, height = $5, updated_at = NOW() WHERE id = $1", [asset.id, verified.mimeType, verified.fileSize, verified.width, verified.height]);
      const job = await this.jobs.enqueueInTransaction(transaction, {
        type: 'PROCESS_PHOTO_ASSETS',
        payload: { photoId, sourceAssetId: asset.id },
      });
      return { alreadyUploaded: false, jobId: job.id };
    });
    return { photoId, status: 'processing', asset: { id: asset.id, uploadStatus: 'uploaded', processingStatus: 'not_required' }, jobId: result.jobId };
  }
}