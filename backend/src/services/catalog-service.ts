import type { PhotographerContext, ClientContext } from '../auth/context.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import type { Database } from './service-common.js';
import { PhotoRepresentationService } from './photo-representation-service.js';
import type { PhotoStorage } from './photo-service.js';

export const MAX_PAGE_SIZE = 100;
export function validatePage(page: number, limit: number) {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new ValidationError('INVALID_PAGINATION', `page must be >= 1 and limit must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
}

export class CatalogService {
  constructor(
    private readonly database: Database,
    private readonly photoRepresentations?: PhotoRepresentationService,
  ) {}

  async listClients(actor: PhotographerContext, page: number, limit: number) {
    validatePage(page, limit);
    const offset = (page - 1) * limit;
    const [items, count] = await Promise.all([
      this.database.query(
        `SELECT id, name, email, phone, created_at AS "createdAt" FROM clients
          WHERE studio_id = $1 ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`, [actor.studioId, limit, offset]),
      this.database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM clients WHERE studio_id = $1', [actor.studioId]),
    ]);
    return { items: items.rows, total: Number(count.rows[0]?.count ?? 0) };
  }

  async getClient(actor: PhotographerContext, clientId: string) {
    const result = await this.database.query(
      `SELECT id, name, email, phone, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM clients WHERE id = $1 AND studio_id = $2`, [clientId, actor.studioId]);
    if (!result.rows[0]) throw new NotFoundError('CLIENT_NOT_FOUND', 'Client not found.');
    return result.rows[0];
  }

  async createClient(actor: PhotographerContext, input: { name: string; email?: string; phone?: string }) {
    if (!['owner', 'admin'].includes(actor.role)) throw new ForbiddenError('Client creation is not permitted for this studio role.');
    const name = input.name.trim();
    if (!name || name.length > 200) throw new ValidationError('INVALID_CLIENT_DATA', 'Client name must be between 1 and 200 characters.');
    const result = await this.database.query(
      `INSERT INTO clients (id, studio_id, name, email, phone) VALUES (gen_random_uuid(), $1, $2, $3, $4)
       RETURNING id, name, email, phone, created_at AS "createdAt"`,
      [actor.studioId, name, input.email?.trim() || null, input.phone?.trim() || null]);
    return result.rows[0];
  }

  async updateClient(actor: PhotographerContext, clientId: string, input: { name?: string; email?: string | null; phone?: string | null }) {
    if (!['owner', 'admin'].includes(actor.role)) throw new ForbiddenError('Client updates are not permitted for this studio role.');
    if (input.name === undefined && input.email === undefined && input.phone === undefined) throw new ValidationError('INVALID_CLIENT_DATA', 'At least one editable field is required.');
    if (input.name !== undefined && (!input.name.trim() || input.name.trim().length > 200)) throw new ValidationError('INVALID_CLIENT_DATA', 'Client name must be between 1 and 200 characters.');
    const result = await this.database.query(
      `UPDATE clients SET name = COALESCE($3, name), email = CASE WHEN $4 THEN $5 ELSE email END,
           phone = CASE WHEN $6 THEN $7 ELSE phone END, updated_at = NOW()
        WHERE id = $1 AND studio_id = $2 RETURNING id, name, email, phone, updated_at AS "updatedAt"`,
      [clientId, actor.studioId, input.name?.trim() ?? null, input.email !== undefined, input.email?.trim() || null, input.phone !== undefined, input.phone?.trim() || null]);
    if (!result.rows[0]) throw new NotFoundError('CLIENT_NOT_FOUND', 'Client not found.');
    return result.rows[0];
  }

  async listGalleries(actor: PhotographerContext, page: number, limit: number) {
    validatePage(page, limit);
    const offset = (page - 1) * limit;
    const [items, count] = await Promise.all([
      this.database.query(
        `SELECT g.id, g.client_id AS "clientId", g.name, g.workflow_status AS "workflowStatus",
                g.publication_status AS "publicationStatus", g.expires_at AS "expiresAt",
                g.published_at AS "publishedAt", g.created_at AS "createdAt",
                c.name AS "clientName",
                ga.selection_status AS "selectionStatus",
                ga.selection_submitted_at AS "selectionSubmittedAt",
                COALESCE(ga.selected_count, 0)::int AS "selectedCount"
           FROM galleries g
           JOIN clients c ON c.id = g.client_id
           JOIN gallery_members gm ON gm.gallery_id = g.id AND gm.user_id = $1
           JOIN studio_members sm ON sm.studio_id = g.studio_id AND sm.user_id = $1
           LEFT JOIN LATERAL (
             SELECT s.status AS selection_status,
                    s.submitted_at AS selection_submitted_at,
                    COUNT(si.id) FILTER (WHERE si.selected)::int AS selected_count
               FROM gallery_access a
               LEFT JOIN gallery_selections s ON s.gallery_access_id = a.id
               LEFT JOIN gallery_selection_items si ON si.gallery_selection_id = s.id
              WHERE a.gallery_id = g.id
                AND a.revoked_at IS NULL
                AND (a.expires_at IS NULL OR a.expires_at > NOW())
              GROUP BY s.status, s.submitted_at
              ORDER BY a.created_at DESC
              LIMIT 1
           ) ga ON TRUE
          WHERE g.studio_id = $2 AND g.archived_at IS NULL ORDER BY g.created_at DESC, g.id LIMIT $3 OFFSET $4`,
        [actor.userId, actor.studioId, limit, offset]),
      this.database.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM galleries g JOIN gallery_members gm ON gm.gallery_id = g.id AND gm.user_id = $1
          JOIN studio_members sm ON sm.studio_id = g.studio_id AND sm.user_id = $1
          WHERE g.studio_id = $2 AND g.archived_at IS NULL`, [actor.userId, actor.studioId]),
    ]);
    return { items: items.rows, total: Number(count.rows[0]?.count ?? 0) };
  }

  async listPhotos(actor: PhotographerContext, galleryId: string, page: number, limit: number) {
    validatePage(page, limit);
    const offset = (page - 1) * limit;
    const membership = await this.database.query(
      `SELECT 1 FROM galleries g JOIN gallery_members gm ON gm.gallery_id = g.id AND gm.user_id = $1
        JOIN studio_members sm ON sm.studio_id = g.studio_id AND sm.user_id = $1
       WHERE g.id = $2 AND g.studio_id = $3`, [actor.userId, galleryId, actor.studioId]);
    if (!membership.rows[0]) throw new NotFoundError('GALLERY_NOT_FOUND', 'Gallery not found.');
    const [items, count] = await Promise.all([
      this.database.query(
        `SELECT id, gallery_id AS "galleryId", filename, status, position, created_at AS "createdAt"
           FROM photos WHERE gallery_id = $1 AND deleted_at IS NULL ORDER BY position, id LIMIT $2 OFFSET $3`, [galleryId, limit, offset]),
      this.database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM photos WHERE gallery_id = $1 AND deleted_at IS NULL', [galleryId]),
    ]);
    return { items: items.rows, total: Number(count.rows[0]?.count ?? 0) };
  }

  async listSelectedPhotos(actor: PhotographerContext, galleryId: string) {
    if (!this.photoRepresentations) throw new Error('Photo representation service is not configured.');

    const membership = await this.database.query(
      `SELECT 1 FROM galleries g
         JOIN gallery_members gm ON gm.gallery_id = g.id AND gm.user_id = $1
         JOIN studio_members sm ON sm.studio_id = g.studio_id AND sm.user_id = $1
        WHERE g.id = $2 AND g.studio_id = $3 AND g.archived_at IS NULL`,
      [actor.userId, galleryId, actor.studioId],
    );
    if (!membership.rows[0]) throw new NotFoundError('GALLERY_NOT_FOUND', 'Gallery not found.');

    const result = await this.database.query(
      `SELECT p.id AS "photoId", p.position, p.filename,
              pa.storage_key AS "previewStorageKey", pa.width AS "previewWidth",
              pa.height AS "previewHeight", pa.mime_type AS "previewMimeType"
         FROM gallery_access a
         JOIN gallery_selections s ON s.gallery_access_id = a.id AND s.status = 'submitted'
         JOIN gallery_selection_items si ON si.gallery_selection_id = s.id AND si.selected = TRUE
         JOIN photos p ON p.id = si.photo_id AND p.gallery_id = $1 AND p.deleted_at IS NULL AND p.status = 'active'
         JOIN photo_assets pa ON pa.photo_id = p.id AND pa.type = 'preview' AND pa.state = 'current'
           AND pa.upload_status = 'uploaded' AND pa.processing_status = 'ready'
        WHERE a.gallery_id = $1 AND a.revoked_at IS NULL
          AND (a.expires_at IS NULL OR a.expires_at > NOW())
        ORDER BY p.position, p.id`,
      [galleryId],
    );

    return Promise.all(result.rows.map(async (item) => ({
      photoId: item.photoId,
      position: item.position,
      filename: item.filename,
      preview: await this.photoRepresentations!.createView({
        storageKey: item.previewStorageKey,
        width: item.previewWidth,
        height: item.previewHeight,
        mimeType: item.previewMimeType,
      }, 600),
    })));
  }

  async getClientGallery(client: ClientContext, galleryId: string) {
    if (client.galleryId !== galleryId) throw new NotFoundError('GALLERY_NOT_FOUND', 'Gallery not found.');
    const result = await this.database.query(
      `SELECT g.id, g.name, g.expires_at AS "expiresAt", g.published_at AS "publishedAt", c.name AS "clientName"
         FROM galleries g JOIN clients c ON c.id = g.client_id
        WHERE g.id = $1 AND g.publication_status = 'published' AND g.archived_at IS NULL
          AND EXISTS (SELECT 1 FROM client_sessions cs JOIN gallery_access ga ON ga.id = cs.gallery_access_id
            WHERE cs.id = $2 AND ga.id = $3 AND ga.gallery_id = g.id AND cs.revoked_at IS NULL AND ga.revoked_at IS NULL
              AND (cs.expires_at IS NULL OR cs.expires_at > NOW()) AND (ga.expires_at IS NULL OR ga.expires_at > NOW()))
          AND (g.expires_at IS NULL OR g.expires_at > NOW())`, [galleryId, client.clientSessionId, client.galleryAccessId]);
    if (!result.rows[0]) throw new NotFoundError('GALLERY_NOT_FOUND', 'Gallery not found.');
    return result.rows[0];
  }

  async getClientPhoto(client: ClientContext, galleryId: string, photoId: string) {
    if (client.galleryId !== galleryId) throw new NotFoundError('PHOTO_NOT_FOUND', 'Photo not found.');
    if (!this.photoRepresentations) throw new Error('Photo representation service is not configured.');

    const result = await this.database.query(
      `SELECT p.id, p.position, r.photo_id IS NOT NULL AS recommended,
              pa.storage_key AS "previewStorageKey", pa.width AS "previewWidth",
              pa.height AS "previewHeight", pa.mime_type AS "previewMimeType"
         FROM photos p
         LEFT JOIN recommendations r ON r.photo_id = p.id AND r.gallery_id = p.gallery_id
         JOIN photo_assets pa ON pa.photo_id = p.id AND pa.type = 'preview' AND pa.state = 'current'
           AND pa.upload_status = 'uploaded' AND pa.processing_status = 'ready'
        WHERE p.id = $1 AND p.gallery_id = $2 AND p.deleted_at IS NULL AND p.status = 'active'
          AND EXISTS (
            SELECT 1 FROM client_sessions cs
            JOIN gallery_access ga ON ga.id = cs.gallery_access_id
            JOIN galleries g ON g.id = ga.gallery_id
            WHERE cs.id = $3 AND ga.id = $4 AND ga.gallery_id = p.gallery_id
              AND cs.revoked_at IS NULL AND ga.revoked_at IS NULL
              AND g.publication_status = 'published' AND g.archived_at IS NULL
              AND (cs.expires_at IS NULL OR cs.expires_at > NOW())
              AND (ga.expires_at IS NULL OR ga.expires_at > NOW())
          )`,
      [photoId, galleryId, client.clientSessionId, client.galleryAccessId],
    );

    const item = result.rows[0];
    if (!item) throw new NotFoundError('PHOTO_NOT_FOUND', 'Photo not found.');

    return {
      photoId: item.id,
      position: item.position,
      recommended: item.recommended,
      preview: await this.photoRepresentations.createView({
        storageKey: item.previewStorageKey,
        width: item.previewWidth,
        height: item.previewHeight,
        mimeType: item.previewMimeType,
      }, 600),
    };
  }

  async listClientPhotos(client: ClientContext, galleryId: string, page: number, limit: number) {
    validatePage(page, limit);
    if (client.galleryId !== galleryId) throw new NotFoundError('GALLERY_NOT_FOUND', 'Gallery not found.');
    if (!this.photoRepresentations) throw new Error('Photo representation service is not configured.');
    const offset = (page - 1) * limit;
    const [items, count] = await Promise.all([
      this.database.query(
        `SELECT p.id, p.position, r.photo_id IS NOT NULL AS recommended,
                pa.storage_key AS "thumbnailStorageKey", pa.width AS "thumbnailWidth",
                pa.height AS "thumbnailHeight", pa.mime_type AS "thumbnailMimeType"
           FROM photos p LEFT JOIN recommendations r ON r.photo_id = p.id AND r.gallery_id = p.gallery_id
           JOIN photo_assets pa ON pa.photo_id = p.id AND pa.type = 'thumbnail' AND pa.state = 'current'
             AND pa.upload_status = 'uploaded' AND pa.processing_status = 'ready'
          WHERE p.gallery_id = $1 AND p.deleted_at IS NULL AND p.status = 'active'
            AND EXISTS (SELECT 1 FROM client_sessions cs JOIN gallery_access ga ON ga.id = cs.gallery_access_id
              JOIN galleries g ON g.id = ga.gallery_id
              WHERE cs.id = $4 AND ga.id = $5 AND ga.gallery_id = p.gallery_id AND cs.revoked_at IS NULL AND ga.revoked_at IS NULL
                AND g.publication_status = 'published' AND g.archived_at IS NULL
                AND (cs.expires_at IS NULL OR cs.expires_at > NOW()) AND (ga.expires_at IS NULL OR ga.expires_at > NOW()))
          ORDER BY p.position, p.id LIMIT $2 OFFSET $3`, [galleryId, limit, offset, client.clientSessionId, client.galleryAccessId]),
      this.database.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM photos p WHERE p.gallery_id = $1 AND p.deleted_at IS NULL AND p.status = 'active'
          AND EXISTS (SELECT 1 FROM client_sessions cs JOIN gallery_access ga ON ga.id = cs.gallery_access_id
            JOIN galleries g ON g.id = ga.gallery_id
            WHERE cs.id = $2 AND ga.id = $3 AND ga.gallery_id = p.gallery_id AND cs.revoked_at IS NULL AND ga.revoked_at IS NULL
              AND g.publication_status = 'published' AND g.archived_at IS NULL
              AND (cs.expires_at IS NULL OR cs.expires_at > NOW()) AND (ga.expires_at IS NULL OR ga.expires_at > NOW()))
          AND EXISTS (SELECT 1 FROM photo_assets pa WHERE pa.photo_id = p.id AND pa.type = 'thumbnail' AND pa.state = 'current'
            AND pa.upload_status = 'uploaded' AND pa.processing_status = 'ready')`, [galleryId, client.clientSessionId, client.galleryAccessId]),
    ]);
    const resolvedItems = await Promise.all(items.rows.map(async (item) => ({
      photoId: item.id,
      position: item.position,
      recommended: item.recommended,
      thumbnail: await this.photoRepresentations!.createView({
        storageKey: item.thumbnailStorageKey,
        width: item.thumbnailWidth,
        height: item.thumbnailHeight,
        mimeType: item.thumbnailMimeType,
      }, 1800),
    })));
    return { items: resolvedItems, total: Number(count.rows[0]?.count ?? 0) };
  }

  async getStudioSummary(actor: PhotographerContext) {
    const result = await this.database.query(
      `SELECT s.id, s.name, COUNT(DISTINCT sm_all.user_id)::int AS "memberCount"
         FROM studios s JOIN studio_members sm ON sm.studio_id = s.id AND sm.user_id = $1
         JOIN studio_members sm_all ON sm_all.studio_id = s.id
        WHERE s.id = $2 GROUP BY s.id, s.name`, [actor.userId, actor.studioId]);
    if (!result.rows[0]) throw new NotFoundError('STUDIO_NOT_FOUND', 'Studio not found.');
    return result.rows[0];
  }

  async listStudioMembers(actor: PhotographerContext, page: number, limit: number) {
    validatePage(page, limit);
    const offset = (page - 1) * limit;
    const [items, count] = await Promise.all([
      this.database.query(
        `SELECT sm.id, sm.user_id AS "userId", u.email, u.display_name AS "displayName", sm.role
           FROM studio_members sm JOIN users u ON u.id = sm.user_id
          WHERE sm.studio_id = $1 ORDER BY sm.created_at, sm.id LIMIT $2 OFFSET $3`, [actor.studioId, limit, offset]),
      this.database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM studio_members WHERE studio_id = $1', [actor.studioId]),
    ]);
    return { items: items.rows, total: Number(count.rows[0]?.count ?? 0) };
  }
}