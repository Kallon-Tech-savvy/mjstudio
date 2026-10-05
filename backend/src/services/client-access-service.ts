import { createHash, randomBytes, randomInt, randomUUID, scrypt as callbackScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { ClientContext, PhotographerContext } from '../auth/context.js';
import { ensureGalleryPermission } from '../application/policies/gallery.policy.js';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../errors.js';
import { canAccessGalleryBySession } from '../application/policies/client-gallery.policy.js';
import { inTransaction, resolveGalleryMembership, type Database } from './service-common.js';

const scrypt = promisify(callbackScrypt);
const hashCredential = (value: string) => createHash('sha256').update(value).digest('hex');
const hashPin = async (pin: string, salt = randomBytes(16).toString('hex')) => {
  const derived = await scrypt(pin, salt, 64) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
};
const verifyPin = async (pin: string, storedHash: string) => {
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = await scrypt(pin, salt, expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

export type AccessCredentialDelivery = {
  deliver(input: { galleryId: string; secretToken: string; pin: string }): Promise<void>;
  resend(input: { galleryId: string; accessId: string }): Promise<void>;
};
export type PinAttemptLimiter = { assertAllowed(key: string): Promise<void> };

export class GalleryAccessService {
  constructor(private readonly database: Database, private readonly delivery: AccessCredentialDelivery, private readonly createId: () => string = randomUUID) {}

  async create(actor: PhotographerContext, galleryId: string, input: { permission: 'view' | 'view_download'; expiresAt?: Date | null }) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'gallery.access.create');
    return this.issue(actor, galleryId, input.permission, input.expiresAt ?? null, false);
  }

  async get(actor: PhotographerContext, galleryId: string) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'gallery.access.view');
    const result = await this.database.query(
      `SELECT id, gallery_id AS "galleryId", permission, expires_at AS "expiresAt", revoked_at AS "revokedAt", created_at AS "createdAt"
         FROM gallery_access WHERE gallery_id = $1 ORDER BY created_at DESC`, [galleryId]);
    return result.rows;
  }

  async reset(actor: PhotographerContext, galleryId: string, permission: 'view' | 'view_download', expiresAt?: Date | null) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'gallery.access.reset');
    return this.issue(actor, galleryId, permission, expiresAt ?? null, true);
  }

  async revoke(actor: PhotographerContext, galleryId: string) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'gallery.access.revoke');
    return inTransaction(this.database, async (transaction) => {
      const access = await transaction.query('SELECT id FROM gallery_access WHERE gallery_id = $1 AND revoked_at IS NULL FOR UPDATE', [galleryId]);
      const row = access.rows[0];
      if (!row) throw new NotFoundError('INVALID_GALLERY_ACCESS', 'Active gallery access not found.');
      await transaction.query('UPDATE gallery_access SET revoked_at = NOW(), updated_at = NOW() WHERE id = $1', [row.id]);
      await transaction.query('UPDATE client_sessions SET revoked_at = NOW(), updated_at = NOW() WHERE gallery_access_id = $1 AND revoked_at IS NULL', [row.id]);
      return { revoked: true };
    });
  }

  async resend(actor: PhotographerContext, galleryId: string) {
    const membership = await resolveGalleryMembership(this.database, actor, galleryId);
    ensureGalleryPermission(actor, membership, membership.galleryRole, 'gallery.access.view');
    const result = await this.database.query<{ id: string }>(
      `SELECT id FROM gallery_access WHERE gallery_id = $1 AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())`, [galleryId]);
    const active = result.rows[0];
    if (!active) throw new NotFoundError('INVALID_GALLERY_ACCESS', 'Active gallery access not found.');
    await this.delivery.resend({ galleryId, accessId: active.id });
    return { resent: true, accessId: active.id };
  }

  private async issue(actor: PhotographerContext, galleryId: string, permission: 'view' | 'view_download', expiresAt: Date | null, replace: boolean) {
    if (expiresAt && expiresAt <= new Date()) throw new ValidationError('INVALID_GALLERY_ACCESS', 'Access expiration must be in the future.');
    const secretToken = randomBytes(32).toString('base64url');
    const pin = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const pinHash = await hashPin(pin);
    const grantId = this.createId();
    await inTransaction(this.database, async (transaction) => {
      const gallery = await transaction.query('SELECT id FROM galleries WHERE id = $1 AND studio_id = $2 FOR UPDATE', [galleryId, actor.studioId]);
      if (!gallery.rows[0]) throw new NotFoundError('GALLERY_NOT_FOUND', 'Gallery not found.');
      const current = await transaction.query<{ id: string; expires_at: Date | null }>(
        'SELECT id, expires_at FROM gallery_access WHERE gallery_id = $1 AND revoked_at IS NULL FOR UPDATE', [galleryId]);
      let hasCurrentGrant = Boolean(current.rows[0]);
      if (current.rows[0]?.expires_at && new Date(current.rows[0].expires_at) <= new Date()) {
        await transaction.query('UPDATE gallery_access SET revoked_at = NOW(), updated_at = NOW() WHERE id = $1', [current.rows[0].id]);
        await transaction.query('UPDATE client_sessions SET revoked_at = NOW(), updated_at = NOW() WHERE gallery_access_id = $1 AND revoked_at IS NULL', [current.rows[0].id]);
        hasCurrentGrant = false;
      }
      if (replace) {
        if (!hasCurrentGrant) throw new NotFoundError('INVALID_GALLERY_ACCESS', 'Active gallery access not found.');
        await transaction.query('UPDATE gallery_access SET revoked_at = NOW(), updated_at = NOW() WHERE id = $1', [current.rows[0].id]);
        await transaction.query('UPDATE client_sessions SET revoked_at = NOW(), updated_at = NOW() WHERE gallery_access_id = $1 AND revoked_at IS NULL', [current.rows[0].id]);
      } else if (hasCurrentGrant) {
        throw new ConflictError('INVALID_GALLERY_ACCESS', 'Gallery already has active access; reset it instead.');
      }
      await transaction.query(
        'INSERT INTO gallery_access (id, gallery_id, secret_token_hash, pin_hash, permission, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [grantId, galleryId, hashCredential(secretToken), pinHash, permission, expiresAt],
      );
    });
    await this.delivery.deliver({ galleryId, secretToken, pin });
    return { id: grantId, permission, expiresAt };
  }
}

export class ClientSessionService {
  constructor(private readonly database: Database, private readonly pinAttemptLimiter: PinAttemptLimiter, private readonly createId: () => string = randomUUID) {}

  async create(secretToken: string, pin: string, abuseKey: string) {
    await this.pinAttemptLimiter.assertAllowed(abuseKey);
    await this.pinAttemptLimiter.assertAllowed(`secret:${secretToken}`);
    const grant = await this.database.query<{ id: string; pin_hash: string; gallery_id: string }>(
      `SELECT ga.id, ga.pin_hash, ga.gallery_id FROM gallery_access ga JOIN galleries g ON g.id = ga.gallery_id
        WHERE ga.secret_token_hash = $1 AND ga.revoked_at IS NULL AND g.publication_status = 'published'
          AND g.archived_at IS NULL AND (ga.expires_at IS NULL OR ga.expires_at > NOW())`, [hashCredential(secretToken)]);
    const access = grant.rows[0];
    if (!access || !(await verifyPin(pin, access.pin_hash))) {
      throw new NotFoundError('INVALID_GALLERY_ACCESS', 'Gallery access could not be verified.');
    }
    const sessionToken = randomBytes(32).toString('base64url');
    const sessionId = this.createId();
    const sessionExpiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const created = await inTransaction(this.database, async (transaction) => {
      const current = await transaction.query(
        `SELECT ga.id FROM gallery_access ga JOIN galleries g ON g.id = ga.gallery_id
          WHERE ga.id = $1 AND ga.revoked_at IS NULL AND g.publication_status = 'published'
            AND g.archived_at IS NULL AND (ga.expires_at IS NULL OR ga.expires_at > NOW()) FOR UPDATE OF ga`,
        [access.id]);
      if (!current.rows[0]) throw new NotFoundError('INVALID_GALLERY_ACCESS', 'Gallery access could not be verified.');
      await transaction.query(
        'INSERT INTO client_sessions (id, gallery_access_id, session_token_hash, expires_at) VALUES ($1, $2, $3, $4)',
        [sessionId, access.id, hashCredential(sessionToken), sessionExpiresAt],
      );
      return true;
    });
    if (!created) throw new ForbiddenError('INVALID_GALLERY_ACCESS');
    return { sessionId, sessionToken, expiresAt: sessionExpiresAt, galleryId: access.gallery_id };
  }

  async resolve(sessionToken: string): Promise<ClientContext> {
    const result = await this.database.query<{
      session_id: string; access_id: string; gallery_id: string; permission: 'view' | 'view_download'; session_expires_at: Date | null; access_expires_at: Date | null;
    }>(
      `SELECT cs.id AS session_id, ga.id AS access_id, ga.gallery_id, ga.permission,
              cs.expires_at AS session_expires_at, ga.expires_at AS access_expires_at
         FROM client_sessions cs
         JOIN gallery_access ga ON ga.id = cs.gallery_access_id
         JOIN galleries g ON g.id = ga.gallery_id
        WHERE cs.session_token_hash = $1 AND cs.revoked_at IS NULL AND ga.revoked_at IS NULL
          AND g.archived_at IS NULL AND g.publication_status = 'published'
          AND (cs.expires_at IS NULL OR cs.expires_at > NOW())
          AND (ga.expires_at IS NULL OR ga.expires_at > NOW())`, [hashCredential(sessionToken)]);
    const row = result.rows[0];
    if (!row) throw new UnauthorizedError('Client session is invalid or expired.');
    await this.database.query('UPDATE client_sessions SET last_seen_at = NOW() WHERE id = $1', [row.session_id]);
    return {
      sessionId: row.session_id,
      clientSessionId: row.session_id,
      galleryAccessId: row.access_id,
      galleryId: row.gallery_id,
      permission: row.permission,
      isAuthenticated: true,
      expiresAt: row.session_expires_at?.toISOString(),
    };
  }

  async revoke(sessionId: string, sessionToken: string) {
    const result = await this.database.query(
      'UPDATE client_sessions SET revoked_at = NOW(), updated_at = NOW() WHERE id = $1 AND session_token_hash = $2 AND revoked_at IS NULL RETURNING id',
      [sessionId, hashCredential(sessionToken)],
    );
    if (!result.rows[0]) throw new NotFoundError('INVALID_GALLERY_ACCESS', 'Session not found.');
    return { revoked: true };
  }

  async assertGallery(context: ClientContext, galleryId: string) {
    canAccessGalleryBySession(context, galleryId);
    const current = await this.database.query(
      `SELECT 1 FROM client_sessions cs JOIN gallery_access ga ON ga.id = cs.gallery_access_id
        JOIN galleries g ON g.id = ga.gallery_id
        WHERE cs.id = $1 AND ga.id = $2 AND ga.gallery_id = $3 AND cs.revoked_at IS NULL AND ga.revoked_at IS NULL
          AND g.publication_status = 'published' AND g.archived_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > NOW())
          AND (cs.expires_at IS NULL OR cs.expires_at > NOW()) AND (ga.expires_at IS NULL OR ga.expires_at > NOW())`,
      [context.clientSessionId, context.galleryAccessId, galleryId]);
    if (!current.rows[0]) throw new UnauthorizedError('Client session is invalid or expired.');
  }
}