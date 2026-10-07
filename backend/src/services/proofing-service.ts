import type { PhotographerContext } from '../auth/context.js';
import { ensureGalleryPermission } from '../application/policies/gallery.policy.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { resolveGalleryMembership, type Database } from './service-common.js';

export type ProofingReviewStatus = 'pending' | 'approved' | 'needs_revision';

export class ProofingService {
  constructor(private readonly database: Database) {}

  async setReview(
    actor: PhotographerContext,
    galleryId: string,
    photoId: string,
    status: Exclude<ProofingReviewStatus, 'pending'>,
    note?: string | null,
  ) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'proofing.review');

    const normalizedNote = note?.trim() || null;
    if (status === 'needs_revision' && !normalizedNote) {
      throw new ValidationError('REVISION_NOTE_REQUIRED', 'A revision note is required when a photograph needs revision.');
    }
    if (normalizedNote && normalizedNote.length > 2000) {
      throw new ValidationError('INVALID_REVISION_NOTE', 'Revision note must be 2000 characters or fewer.');
    }

    const result = await this.database.query(`
      INSERT INTO gallery_proofing_reviews (id, gallery_id, photo_id, status, note, reviewed_by, reviewed_at)
      SELECT gen_random_uuid(), $1, p.id, $3, $4, $5, NOW()
        FROM photos p
        JOIN gallery_access a ON a.gallery_id = p.gallery_id
          AND a.revoked_at IS NULL
          AND (a.expires_at IS NULL OR a.expires_at > NOW())
        JOIN gallery_selections s ON s.gallery_access_id = a.id AND s.status = 'submitted'
        JOIN gallery_selection_items si ON si.gallery_selection_id = s.id
          AND si.photo_id = p.id AND si.selected = TRUE
       WHERE p.id = $2 AND p.gallery_id = $1 AND p.deleted_at IS NULL AND p.status = 'active'
      ON CONFLICT (gallery_id, photo_id)
      DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note,
                    reviewed_by = EXCLUDED.reviewed_by, reviewed_at = EXCLUDED.reviewed_at,
                    updated_at = NOW()
      RETURNING id, gallery_id AS "galleryId", photo_id AS "photoId",
                status, note, reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt",
                updated_at AS "updatedAt"`,
      [galleryId, photoId, status, normalizedNote, actor.userId],
    );

    if (!result.rows[0]) {
      throw new NotFoundError('SELECTED_PHOTO_NOT_FOUND', 'Photo is not part of the submitted client selection.');
    }
    return result.rows[0];
  }

  async list(actor: PhotographerContext, galleryId: string) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'gallery.view');

    const result = await this.database.query(`
      SELECT p.id AS "photoId", p.position, p.filename,
             COALESCE(r.status, 'pending') AS status,
             r.note, r.reviewed_by AS "reviewedBy", r.reviewed_at AS "reviewedAt"
        FROM gallery_access a
        JOIN gallery_selections s ON s.gallery_access_id = a.id AND s.status = 'submitted'
        JOIN gallery_selection_items si ON si.gallery_selection_id = s.id AND si.selected = TRUE
        JOIN photos p ON p.id = si.photo_id
        LEFT JOIN gallery_proofing_reviews r ON r.gallery_id = p.gallery_id AND r.photo_id = p.id
       WHERE a.gallery_id = $1 AND a.revoked_at IS NULL
         AND (a.expires_at IS NULL OR a.expires_at > NOW())
         AND p.gallery_id = $1 AND p.deleted_at IS NULL AND p.status = 'active'
       ORDER BY p.position, p.id`, [galleryId]);
    return result.rows;
  }
}
