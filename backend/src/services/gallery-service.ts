import { randomUUID } from 'node:crypto';
import type { PhotographerContext } from '../auth/context.js';
import { ensureGalleryPermission, type GalleryPermission } from '../application/policies/gallery.policy.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { assertGalleryCanArchive, assertGalleryCanPublish, inTransaction, resolveGalleryMembership, validateGalleryName, type Database } from './service-common.js';

export type NewClientInput = { name?: string; email?: string; phone?: string };

export type CreateGalleryInput = {
  clientId?: string;
  newClient?: NewClientInput;
  name: string;
  workflowStatus?: 'draft' | 'reviewing' | 'completed';
  expiresAt?: Date | null;
};
export type UpdateGalleryInput = { name?: string; expiresAt?: Date | null };

export class GalleryService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async create(actor: PhotographerContext, input: CreateGalleryInput) {
    if (!actor) throw new ForbiddenError('Authenticated photographer required.');
    if (!['owner', 'admin'].includes(actor.role)) throw new ForbiddenError('Gallery creation is not permitted for this studio role.');
    if ((input.clientId === undefined) === (input.newClient === undefined)) {
      throw new ValidationError('INVALID_GALLERY_DATA', 'Provide either an existing client or new client details.');
    }
    const name = validateGalleryName(input.name);
    if (input.expiresAt && input.expiresAt <= new Date()) throw new ValidationError('INVALID_GALLERY_DATA', 'Expiration must be in the future.');
    const workflowStatus = input.workflowStatus ?? 'draft';

    return inTransaction(this.database, async (transaction) => {
      const membership = await transaction.query<{ role: string }>('SELECT role FROM studio_members WHERE studio_id = $1 AND user_id = $2 FOR SHARE', [actor.studioId, actor.userId]);
      if (!membership.rows[0]) throw new ForbiddenError('Studio membership is required.');
      if (!['owner', 'admin'].includes(membership.rows[0].role)) throw new ForbiddenError('Gallery creation is not permitted for this studio role.');

      let clientId: string;
      if (input.newClient) {
        // All client details are optional; fall back to a label so the record is still identifiable.
        const details = input.newClient;
        const label = details.name?.trim() || details.email?.trim() || details.phone?.trim() || 'Unnamed client';
        clientId = this.createId();
        await transaction.query(
          `INSERT INTO clients (id, studio_id, name, email, phone) VALUES ($1, $2, $3, $4, $5)`,
          [clientId, actor.studioId, label, details.email?.trim() || null, details.phone?.trim() || null],
        );
      } else {
        const client = await transaction.query('SELECT id FROM clients WHERE id = $1 AND studio_id = $2 FOR SHARE', [input.clientId, actor.studioId]);
        if (!client.rows[0]) throw new NotFoundError('CLIENT_NOT_FOUND', 'Client not found in this studio.');
        clientId = input.clientId as string;
      }

      const galleryId = this.createId();
      await transaction.query(
        `INSERT INTO galleries (id, studio_id, client_id, name, workflow_status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [galleryId, actor.studioId, clientId, name, workflowStatus, input.expiresAt ?? null],
      );
      await transaction.query(
        `INSERT INTO gallery_members (id, gallery_id, user_id, role)
         VALUES ($1, $2, $3, 'owner')`,
        [this.createId(), galleryId, actor.userId],
      );
      return { id: galleryId, studioId: actor.studioId, clientId, name, workflowStatus, publicationStatus: 'unpublished' };
    });
  }

  async get(actor: PhotographerContext, galleryId: string) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'gallery.view');
    const result = await this.database.query(
      `SELECT id, studio_id AS "studioId", client_id AS "clientId", name,
              workflow_status AS "workflowStatus", publication_status AS "publicationStatus",
              expires_at AS "expiresAt", published_at AS "publishedAt", archived_at AS "archivedAt"
         FROM galleries WHERE id = $1 AND studio_id = $2`,
      [galleryId, actor.studioId],
    );
    if (!result.rows[0]) throw new NotFoundError('GALLERY_NOT_FOUND', 'Gallery not found.');
    return result.rows[0];
  }

  async update(actor: PhotographerContext, galleryId: string, input: UpdateGalleryInput) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'gallery.update');
    if (input.name === undefined && input.expiresAt === undefined) throw new ValidationError('INVALID_GALLERY_DATA', 'At least one editable gallery field is required.');
    if (input.expiresAt && input.expiresAt <= new Date()) throw new ValidationError('INVALID_GALLERY_DATA', 'Expiration must be in the future.');
    const result = await this.database.query(
      `UPDATE galleries SET name = COALESCE($3, name), expires_at = CASE WHEN $4 THEN $5 ELSE expires_at END,
              updated_at = NOW()
        WHERE id = $1 AND studio_id = $2 AND archived_at IS NULL
        RETURNING id, name, expires_at AS "expiresAt", workflow_status AS "workflowStatus", publication_status AS "publicationStatus"`,
      [galleryId, actor.studioId, input.name === undefined ? null : validateGalleryName(input.name), input.expiresAt !== undefined, input.expiresAt ?? null],
    );
    if (!result.rows[0]) throw new ConflictError('INVALID_GALLERY_STATE', 'Archived galleries cannot be updated.');
    return result.rows[0];
  }

  async publish(actor: PhotographerContext, galleryId: string) {
    return inTransaction(this.database, async (transaction) => {
      const locked = await transaction.query(
        `SELECT id, studio_id, workflow_status, publication_status, archived_at
           FROM galleries WHERE id = $1 AND studio_id = $2 FOR UPDATE`,
        [galleryId, actor.studioId],
      );
      const row = locked.rows[0];
      if (!row) throw new NotFoundError('GALLERY_NOT_FOUND', 'Gallery not found.');
      const membership = await resolveGalleryMembership(transaction, actor, galleryId);
      ensureGalleryPermission(actor, membership, membership.galleryRole, 'gallery.publish');
      const readiness = await transaction.query(
        `SELECT EXISTS (
           SELECT 1 FROM photos p WHERE p.gallery_id = $1 AND p.deleted_at IS NULL
         ) AND NOT EXISTS (
           SELECT 1 FROM photos p WHERE p.gallery_id = $1 AND p.deleted_at IS NULL
             AND (p.status <> 'active'
               OR NOT EXISTS (SELECT 1 FROM photo_assets pa WHERE pa.photo_id = p.id AND pa.type = 'preview' AND pa.state = 'current' AND pa.upload_status = 'uploaded' AND pa.processing_status = 'ready')
               OR NOT EXISTS (SELECT 1 FROM photo_assets pa WHERE pa.photo_id = p.id AND pa.type = 'thumbnail' AND pa.state = 'current' AND pa.upload_status = 'uploaded' AND pa.processing_status = 'ready'))
         ) AS has_usable_photos,
         EXISTS (SELECT 1 FROM clients c WHERE c.id = g.client_id AND c.studio_id = g.studio_id) AS has_client,
         EXISTS (SELECT 1 FROM gallery_access ga WHERE ga.gallery_id = g.id AND ga.revoked_at IS NULL
                   AND (ga.expires_at IS NULL OR ga.expires_at > NOW())) AS has_active_access
         FROM galleries g WHERE g.id = $1`,
        [galleryId],
      );
      const deps = readiness.rows[0];
      assertGalleryCanPublish(row, {
        hasUsablePhotos: deps.has_usable_photos,
        hasClient: deps.has_client,
        hasActiveAccess: deps.has_active_access,
      });
      const updated = await transaction.query(
        `UPDATE galleries SET publication_status = 'published', published_at = NOW(), updated_at = NOW()
          WHERE id = $1 RETURNING id, publication_status AS "publicationStatus", published_at AS "publishedAt"`,
        [galleryId],
      );
      return updated.rows[0];
    });
  }

  async archive(actor: PhotographerContext, galleryId: string) {
    return inTransaction(this.database, async (transaction) => {
      const result = await transaction.query(
        `SELECT id, studio_id, archived_at FROM galleries WHERE id = $1 AND studio_id = $2 FOR UPDATE`,
        [galleryId, actor.studioId],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundError('GALLERY_NOT_FOUND', 'Gallery not found.');
      const membership = await resolveGalleryMembership(transaction, actor, galleryId);
      ensureGalleryPermission(actor, membership, membership.galleryRole, 'gallery.archive');
      assertGalleryCanArchive({ archivedAt: row.archived_at });
      const updated = await transaction.query(
        `UPDATE galleries SET archived_at = NOW(), publication_status = 'revoked', updated_at = NOW()
          WHERE id = $1 RETURNING id, archived_at AS "archivedAt", publication_status AS "publicationStatus"`,
        [galleryId],
      );
      return updated.rows[0];
    });
  }
}

export function requiredGalleryPermission(value: string): GalleryPermission {
  const allowed: GalleryPermission[] = ['gallery.view', 'gallery.update', 'gallery.publish', 'gallery.archive', 'gallery.access.view', 'gallery.access.create', 'gallery.access.reset', 'gallery.access.revoke', 'photo.view', 'photo.create', 'photo.update', 'photo.delete', 'photo.reorder', 'photo.recommend', 'photo.upload', 'activity.view'];
  if (!allowed.includes(value as GalleryPermission)) throw new ValidationError('INVALID_PERMISSION', 'Unknown gallery permission.');
  return value as GalleryPermission;
}