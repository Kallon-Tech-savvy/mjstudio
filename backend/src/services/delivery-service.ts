import type { ClientContext } from '../auth/context.js';
import { canReadClientGallery } from '../application/policies/client-gallery.policy.js';
import type { PhotographerContext } from '../auth/context.js';
import { ensureGalleryPermission } from '../application/policies/gallery.policy.js';
import { AppError, NotFoundError, ValidationError } from '../errors.js';
import { resolveGalleryMembership, type Database } from './service-common.js';

export interface DeliveryRecord {
  id: string;
  galleryId: string;
  clientId: string;
  status: 'pending' | 'preparing' | 'ready' | 'completed';
  createdAt: string;
  updatedAt: string;
  readyAt?: string | null;
  releasedAt?: string | null;
  completedAt?: string | null;
}

export interface DeliveryItemRecord {
  id: string;
  deliveryId: string;
  photoId: string;
  assetId?: string | null;
  filename: string;
  position: number;
  status: 'preparing' | 'ready' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryDetails extends DeliveryRecord {
  items: DeliveryItemRecord[];
  approvedCount: number;
  totalSelectedCount: number;
  canPrepare: boolean;
}

export class DeliveryService {
  constructor(private readonly database: Database) {}

  async getDelivery(actor: PhotographerContext, galleryId: string): Promise<DeliveryDetails> {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'gallery.view');

    // Get count of selected & approved photos
    const countsResult = await this.database.query(
      `SELECT
         COUNT(DISTINCT si.photo_id)::int AS total_selected,
         COUNT(DISTINCT CASE WHEN pr.status = 'approved' THEN si.photo_id END)::int AS approved_count
       FROM gallery_access a
       JOIN gallery_selections s ON s.gallery_access_id = a.id AND s.status = 'submitted'
       JOIN gallery_selection_items si ON si.gallery_selection_id = s.id AND si.selected = TRUE
       JOIN photos p ON p.id = si.photo_id AND p.deleted_at IS NULL AND p.status = 'active'
       LEFT JOIN gallery_proofing_reviews pr ON pr.gallery_id = p.gallery_id AND pr.photo_id = p.id
      WHERE a.gallery_id = $1 AND a.revoked_at IS NULL
        AND (a.expires_at IS NULL OR a.expires_at > NOW())`,
      [galleryId],
    );

    const totalSelectedCount = countsResult.rows[0]?.total_selected ?? 0;
    const approvedCount = countsResult.rows[0]?.approved_count ?? 0;
    const canPrepare = totalSelectedCount > 0 && totalSelectedCount === approvedCount;

    const deliveryRes = await this.database.query(
      `SELECT id, gallery_id AS "galleryId", client_id AS "clientId", status,
              created_at AS "createdAt", updated_at AS "updatedAt",
              ready_at AS "readyAt", released_at AS "releasedAt", completed_at AS "completedAt"
         FROM gallery_deliveries
        WHERE gallery_id = $1`,
      [galleryId],
    );

    let delivery = deliveryRes.rows[0] as DeliveryRecord | undefined;
    let items: DeliveryItemRecord[] = [];

    if (delivery) {
      const itemsRes = await this.database.query(
        `SELECT di.id, di.delivery_id AS "deliveryId", di.photo_id AS "photoId",
                di.asset_id AS "assetId", di.status, di.created_at AS "createdAt",
                di.updated_at AS "updatedAt", p.filename, p.position
           FROM gallery_delivery_items di
           JOIN photos p ON p.id = di.photo_id
          WHERE di.delivery_id = $1
          ORDER BY p.position, p.id`,
        [delivery.id],
      );
      items = itemsRes.rows;
    }

    return {
      id: delivery?.id ?? '',
      galleryId,
      clientId: delivery?.clientId ?? '',
      status: delivery?.status ?? 'pending',
      createdAt: delivery?.createdAt ?? new Date().toISOString(),
      updatedAt: delivery?.updatedAt ?? new Date().toISOString(),
      readyAt: delivery?.readyAt,
      releasedAt: delivery?.releasedAt,
      completedAt: delivery?.completedAt,
      items,
      approvedCount,
      totalSelectedCount,
      canPrepare,
    };
  }

  async prepareDelivery(actor: PhotographerContext, galleryId: string): Promise<DeliveryDetails> {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'gallery.update');

    // Verify all selected photos are approved
    const unapprovedRes = await this.database.query(
      `SELECT p.id, p.filename, COALESCE(pr.status, 'pending') AS status
         FROM gallery_access a
         JOIN gallery_selections s ON s.gallery_access_id = a.id AND s.status = 'submitted'
         JOIN gallery_selection_items si ON si.gallery_selection_id = s.id AND si.selected = TRUE
         JOIN photos p ON p.id = si.photo_id AND p.deleted_at IS NULL AND p.status = 'active'
         LEFT JOIN gallery_proofing_reviews pr ON pr.gallery_id = p.gallery_id AND pr.photo_id = p.id
        WHERE a.gallery_id = $1 AND a.revoked_at IS NULL
          AND (a.expires_at IS NULL OR a.expires_at > NOW())
          AND (pr.status IS NULL OR pr.status != 'approved')`,
      [galleryId],
    );

    if (unapprovedRes.rows.length > 0) {
      throw new ValidationError(
        'UNAPPROVED_PHOTOS_EXIST',
        'All selected photographs must be approved in proofing before delivery can be prepared.',
      );
    }

    // Fetch approved photos
    const approvedPhotosRes = await this.database.query(
      `SELECT p.id AS photo_id, g.client_id, pa.id AS asset_id
         FROM gallery_access a
         JOIN gallery_selections s ON s.gallery_access_id = a.id AND s.status = 'submitted'
         JOIN gallery_selection_items si ON si.gallery_selection_id = s.id AND si.selected = TRUE
         JOIN photos p ON p.id = si.photo_id AND p.deleted_at IS NULL AND p.status = 'active'
         JOIN galleries g ON g.id = p.gallery_id
         LEFT JOIN photo_assets pa ON pa.photo_id = p.id AND pa.status = 'ready'
         JOIN gallery_proofing_reviews pr ON pr.gallery_id = p.gallery_id AND pr.photo_id = p.id AND pr.status = 'approved'
        WHERE a.gallery_id = $1 AND a.revoked_at IS NULL
          AND (a.expires_at IS NULL OR a.expires_at > NOW())`,
      [galleryId],
    );

    if (approvedPhotosRes.rows.length === 0) {
      throw new ValidationError('NO_APPROVED_PHOTOS', 'No approved selected photographs found for delivery.');
    }

    const clientId = approvedPhotosRes.rows[0].client_id;

    // Execute upsert in transaction
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');

      // Create or update delivery record
      const deliveryUpsert = await client.query(
        `INSERT INTO gallery_deliveries (id, gallery_id, client_id, status, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'preparing', NOW())
         ON CONFLICT (gallery_id)
         DO UPDATE SET status = 'preparing', updated_at = NOW()
         RETURNING id`,
        [galleryId, clientId],
      );

      const deliveryId = deliveryUpsert.rows[0].id;

      // Upsert delivery items for all approved photos
      for (const row of approvedPhotosRes.rows) {
        await client.query(
          `INSERT INTO gallery_delivery_items (id, delivery_id, photo_id, asset_id, status, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'ready', NOW())
           ON CONFLICT (delivery_id, photo_id)
           DO UPDATE SET asset_id = EXCLUDED.asset_id, status = 'ready', updated_at = NOW()`,
          [deliveryId, row.photo_id, row.asset_id],
        );
      }

      // Mark delivery as ready
      await client.query(
        `UPDATE gallery_deliveries
            SET status = CASE WHEN released_at IS NOT NULL THEN 'ready' ELSE 'preparing' END,
                ready_at = NOW(),
                updated_at = NOW()
          WHERE id = $1`,
        [deliveryId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return this.getDelivery(actor, galleryId);
  }

  async releaseDelivery(actor: PhotographerContext, galleryId: string): Promise<DeliveryDetails> {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'gallery.update');

    const deliveryRes = await this.database.query(
      `SELECT id, status FROM gallery_deliveries WHERE gallery_id = $1`,
      [galleryId],
    );

    if (!deliveryRes.rows[0]) {
      throw new NotFoundError('DELIVERY_NOT_PREPARED', 'Delivery must be prepared before it can be released.');
    }

    const deliveryId = deliveryRes.rows[0].id;

    await this.database.query(
      `UPDATE gallery_deliveries
          SET status = 'ready',
              released_at = COALESCE(released_at, NOW()),
              ready_at = COALESCE(ready_at, NOW()),
              updated_at = NOW()
        WHERE id = $1`,
      [deliveryId],
    );

    return this.getDelivery(actor, galleryId);
  }

  async getClientDelivery(client: ClientContext, galleryId: string) {
    canReadClientGallery(client, galleryId);

    const deliveryRes = await this.database.query(
      `SELECT id, gallery_id AS "galleryId", status, released_at AS "releasedAt"
         FROM gallery_deliveries
        WHERE gallery_id = $1 AND released_at IS NOT NULL`,
      [galleryId],
    );

    const delivery = deliveryRes.rows[0];
    if (!delivery) {
      return {
        isReleased: false,
        items: [],
      };
    }

    const itemsRes = await this.database.query(
      `SELECT di.id, di.photo_id AS "photoId", p.position, p.filename
         FROM gallery_delivery_items di
         JOIN photos p ON p.id = di.photo_id
        WHERE di.delivery_id = $1 AND di.status = 'ready' AND p.deleted_at IS NULL AND p.status = 'active'
        ORDER BY p.position, p.id`,
      [delivery.id],
    );

    return {
      isReleased: true,
      releasedAt: delivery.releasedAt,
      items: itemsRes.rows,
    };
  }

}
