import type { Pool, PoolClient } from 'pg';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import type { GalleryRole } from '../application/policies/gallery.policy.js';
import type { PhotographerContext } from '../auth/context.js';

export type Database = Pick<Pool, 'query' | 'connect'>;
export type Transaction = PoolClient;

export async function inTransaction<T>(database: Database, operation: (transaction: Transaction) => Promise<T>): Promise<T> {
  const transaction = await database.connect();
  try {
    await transaction.query('BEGIN');
    const result = await operation(transaction);
    await transaction.query('COMMIT');
    return result;
  } catch (error) {
    await transaction.query('ROLLBACK');
    throw error;
  } finally {
    transaction.release();
  }
}

export async function resolveGalleryMembership(
  queryable: Pick<PoolClient, 'query'>,
  actor: PhotographerContext,
  galleryId: string,
): Promise<{ id: string; studioId: string; galleryRole: GalleryRole; workflowStatus: string; publicationStatus: string; archivedAt: Date | null }> {
  const result = await queryable.query<{
    id: string;
    studio_id: string;
    role: GalleryRole;
    workflow_status: string;
    publication_status: string;
    archived_at: Date | null;
  }>(
    `SELECT g.id, g.studio_id, g.workflow_status, g.publication_status, g.archived_at, gm.role
       FROM galleries g
       JOIN studio_members sm ON sm.studio_id = g.studio_id AND sm.user_id = $2
       JOIN gallery_members gm ON gm.gallery_id = g.id AND gm.user_id = $2
      WHERE g.id = $1 AND g.studio_id = $3`,
    [galleryId, actor.userId, actor.studioId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('GALLERY_NOT_FOUND', 'Gallery not found.');
  return {
    id: row.id,
    studioId: row.studio_id,
    galleryRole: row.role,
    workflowStatus: row.workflow_status,
    publicationStatus: row.publication_status,
    archivedAt: row.archived_at,
  };
}

export function validateGalleryName(name: string): string {
  const normalized = name.trim();
  if (normalized.length < 1 || normalized.length > 200) {
    throw new ValidationError('INVALID_GALLERY_DATA', 'Gallery name must be between 1 and 200 characters.');
  }
  return normalized;
}

export function assertGalleryCanPublish(gallery: { archivedAt: Date | null; workflowStatus: string; publicationStatus: string }, dependencies: { hasUsablePhotos: boolean; hasClient: boolean; hasActiveAccess: boolean }): void {
  if (gallery.archivedAt) throw new ConflictError('GALLERY_NOT_PUBLISHABLE', 'Archived galleries cannot be published.');
  if (gallery.publicationStatus === 'published') throw new ConflictError('GALLERY_ALREADY_PUBLISHED', 'Gallery is already published.');
  if (!['reviewing', 'completed'].includes(gallery.workflowStatus) || !dependencies.hasUsablePhotos || !dependencies.hasClient || !dependencies.hasActiveAccess) {
    throw new ConflictError('GALLERY_NOT_PUBLISHABLE', 'Gallery does not meet the requirements for publication.');
  }
}

export function assertGalleryCanArchive(gallery: { archivedAt: Date | null }): void {
  if (gallery.archivedAt) throw new ConflictError('INVALID_GALLERY_STATE', 'Gallery is already archived.');
}