import { randomUUID } from 'node:crypto';
import type { Transaction } from './service-common.js';
import type { JobHandler, ClaimedJob, ProcessPhotoAssetsPayload, CleanupPhotoAssetsPayload, ReconcilePhotoAssetPayload } from './job-service.js';
import { PermanentJobError } from './job-service.js';

export type DerivativeObject = { mimeType: string; fileSize: number };
export interface ImageProcessor {
  createPreview(sourceKey: string, destinationKey: string): Promise<DerivativeObject>;
  createThumbnail(sourceKey: string, destinationKey: string): Promise<DerivativeObject>;
}
export interface AssetStorage {
  verifyObject(storageKey: string): Promise<DerivativeObject | null>;
  deleteObject(storageKey: string): Promise<void>;
}

export class ProcessPhotoAssetsHandler implements JobHandler<'PROCESS_PHOTO_ASSETS'> {
  type = 'PROCESS_PHOTO_ASSETS' as const;
  constructor(private readonly processor: ImageProcessor, private readonly storage: AssetStorage) {}

  async execute(job: ClaimedJob<'PROCESS_PHOTO_ASSETS'>, transaction: Transaction) {
    const { photoId, sourceAssetId } = job.payload;
    const source = await transaction.query<{ gallery_id: string; storage_key: string; upload_status: string; state: string; deleted_at: Date | null }>(
      `SELECT p.gallery_id, pa.storage_key, pa.upload_status, pa.state, p.deleted_at
         FROM photos p JOIN photo_assets pa ON pa.photo_id = p.id
        WHERE p.id = $1 AND pa.id = $2 FOR UPDATE OF p, pa`, [photoId, sourceAssetId]);
    const sourceRow = source.rows[0];
    if (!sourceRow || sourceRow.deleted_at || sourceRow.upload_status !== 'uploaded' || sourceRow.state !== 'current') {
      throw new PermanentJobError('Source asset is not a current verified original.');
    }
    const derivatives = [
      { type: 'preview', key: `studios/assets/${photoId}/preview` },
      { type: 'thumbnail', key: `studios/assets/${photoId}/thumbnail` },
    ] as const;
    for (const derivative of derivatives) {
      const existing = await transaction.query<{ id: string; upload_status: string; processing_status: string; state: string }>(
        `SELECT id, upload_status, processing_status, state FROM photo_assets
          WHERE photo_id = $1 AND type = $2 AND state = 'current' FOR UPDATE`, [photoId, derivative.type]);
      let assetId = existing.rows[0]?.id;
      if (existing.rows[0]?.upload_status === 'uploaded' && existing.rows[0]?.processing_status === 'ready') continue;
      if (existing.rows[0]) {
        await transaction.query(
          "UPDATE photo_assets SET state = 'superseded', updated_at = NOW() WHERE id = $1 AND state = 'current'",
          [existing.rows[0].id],
        );
        assetId = undefined;
      }
      if (!assetId) {
        assetId = randomUUID();
        await transaction.query(
          `INSERT INTO photo_assets (id, photo_id, type, state, storage_key, upload_status, processing_status)
           VALUES ($1, $2, $3, 'current', $4, 'pending', 'pending')`,
          [assetId, photoId, derivative.type, derivative.key]);
      }
      await transaction.query("UPDATE photo_assets SET processing_status = 'processing', updated_at = NOW() WHERE id = $1 AND processing_status IN ('pending', 'failed')", [assetId]);
      const generated = derivative.type === 'preview'
        ? await this.processor.createPreview(sourceRow.storage_key, derivative.key)
        : await this.processor.createThumbnail(sourceRow.storage_key, derivative.key);
      const verified = await this.storage.verifyObject(derivative.key);
      if (!verified || verified.fileSize <= 0 || verified.mimeType !== generated.mimeType) {
        throw new PermanentJobError(`Generated ${derivative.type} did not pass object verification.`);
      }
      await transaction.query(
        `UPDATE photo_assets SET upload_status = 'uploaded', processing_status = 'ready',
                mime_type = $2, file_size = $3, updated_at = NOW() WHERE id = $1`,
        [assetId, verified.mimeType, verified.fileSize]);
    }
    const readiness = await transaction.query(
      `SELECT COUNT(*) FILTER (WHERE type = 'preview' AND upload_status = 'uploaded' AND processing_status = 'ready' AND state = 'current') = 1
          AND COUNT(*) FILTER (WHERE type = 'thumbnail' AND upload_status = 'uploaded' AND processing_status = 'ready' AND state = 'current') = 1 AS ready
         FROM photo_assets WHERE photo_id = $1`, [photoId]);
    if (!readiness.rows[0]?.ready) throw new Error('Required derivatives are not ready.');
    await transaction.query("UPDATE photos SET status = 'active', updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL", [photoId]);
  }
}

export class CleanupPhotoAssetsHandler implements JobHandler<'CLEANUP_PHOTO_ASSETS'> {
  type = 'CLEANUP_PHOTO_ASSETS' as const;
  constructor(private readonly storage: AssetStorage) {}

  async execute(job: ClaimedJob<'CLEANUP_PHOTO_ASSETS'>, transaction: Transaction) {
    const { photoId } = job.payload;
    const assets = await transaction.query<{ storage_key: string; state: string }>(
      `SELECT pa.storage_key, pa.state FROM photo_assets pa JOIN photos p ON p.id = pa.photo_id
        WHERE p.id = $1 AND p.deleted_at IS NOT NULL`, [photoId]);
    for (const asset of assets.rows) {
      await this.storage.deleteObject(asset.storage_key);
    }
  }
}

export class ReconcilePhotoAssetHandler implements JobHandler<'RECONCILE_PHOTO_ASSET'> {
  type = 'RECONCILE_PHOTO_ASSET' as const;
  constructor(private readonly storage: AssetStorage) {}

  async execute(job: ClaimedJob<'RECONCILE_PHOTO_ASSET'>, transaction: Transaction) {
    const { assetId } = job.payload;
    const result = await transaction.query<{ id: string; photo_id: string; storage_key: string; type: string; upload_status: string; processing_status: string; state: string }>(
      `SELECT id, photo_id, storage_key, type, upload_status, processing_status, state
         FROM photo_assets WHERE id = $1 FOR UPDATE`, [assetId]);
    const asset = result.rows[0];
    if (!asset) return;
    const object = await this.storage.verifyObject(asset.storage_key);
    if (!object && asset.upload_status === 'uploaded') {
      await transaction.query("UPDATE photo_assets SET upload_status = 'failed', processing_status = CASE WHEN type = 'original' THEN 'not_required' ELSE 'failed' END, updated_at = NOW() WHERE id = $1", [assetId]);
      await transaction.query("UPDATE photos SET status = 'failed', updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL", [asset.photo_id]);
      return;
    }
    if (object && asset.type !== 'original' && asset.processing_status === 'ready' && object.fileSize > 0) return;
    if (object && asset.upload_status === 'pending') {
      await transaction.query("UPDATE photo_assets SET upload_status = 'uploaded', updated_at = NOW() WHERE id = $1", [assetId]);
    }
  }
}