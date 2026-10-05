import { describe, expect, it, vi } from 'vitest';
import { ensurePhotographerCanAccessStudio, ensureGalleryAccessAllowed } from '../src/auth/authorization.js';
import { buildClientContext, buildPhotographerContext } from '../src/auth/context.js';
import { canAccessGalleryBySession, canDownloadFromGallery } from '../src/application/policies/client-gallery.policy.js';
import { ensureUserCanAccessGallery } from '../src/application/policies/gallery.policy.js';
import { parseInput } from '../src/http/validation.js';
import { sanitizeForLogging, recordAuditEvent } from '../src/logging/audit.js';
import { ProcessPhotoAssetsHandler } from '../src/services/job-handlers.js';
import { z } from 'zod';

describe('security hardening and adversarial invariants', () => {
  it('denies cross-studio access even when the request carries a valid-looking actor identity', () => {
    const user = buildPhotographerContext({ studioId: '22222222-2222-4222-8222-222222222222' });

    expect(() => ensurePhotographerCanAccessStudio(user, '33333333-3333-4333-8333-333333333333')).toThrow();
  });

  it('rejects mismatched gallery IDs before a client session can act on a resource', () => {
    const client = buildClientContext({ galleryId: '55555555-5555-4555-8555-555555555555', permission: 'view' });

    expect(() => canAccessGalleryBySession(client, '11111111-1111-4111-8111-111111111111')).toThrow();
  });

  it('requires explicit download permission and rejects a lower-privilege access grant', () => {
    const client = buildClientContext({ galleryId: '55555555-5555-4555-8555-555555555555', permission: 'view' });

    expect(() => ensureGalleryAccessAllowed(client, 'view_download')).toThrow();
    expect(() => canDownloadFromGallery(client, '55555555-5555-4555-8555-555555555555')).toThrow();
  });

  it('refuses a forged studio or role payload on gallery creation', () => {
    const schema = z.object({
      clientId: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
      studioId: z.string().uuid().optional(),
      role: z.string().optional(),
    }).strict();

    expect(() => parseInput(schema, { clientId: '44444444-4444-4444-8444-444444444444', name: 'Portraits', studioId: 'attacker-studio', role: 'owner' }, 'INVALID_GALLERY_DATA')).toThrow();
  });

  it('keeps gallery authority anchored to the authenticated studio, not to the browser-supplied tuple', () => {
    const user = buildPhotographerContext({ studioId: '22222222-2222-4222-8222-222222222222' });

    expect(() => ensureUserCanAccessGallery(user, { id: '55555555-5555-4555-8555-555555555555', studioId: '22222222-2222-4222-8222-222222222222' })).not.toThrow();
    expect(() => ensureUserCanAccessGallery(user, { id: '55555555-5555-4555-8555-555555555555', studioId: '99999999-9999-4999-8999-999999999999' })).toThrow();
  });

  it('creates derivative assets without depending on a browser-like global crypto object', async () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });

    try {
      const handler = new ProcessPhotoAssetsHandler(
        { createPreview: vi.fn().mockResolvedValue({ mimeType: 'image/jpeg', fileSize: 2200 }), createThumbnail: vi.fn().mockResolvedValue({ mimeType: 'image/jpeg', fileSize: 800 }) },
        { verifyObject: vi.fn().mockResolvedValue({ mimeType: 'image/jpeg', fileSize: 2200 }), deleteObject: vi.fn().mockResolvedValue(undefined) },
      );

      const transaction = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('FROM photos p JOIN photo_assets pa')) {
            return { rows: [{ gallery_id: '11111111-1111-4111-8111-111111111111', storage_key: 'studios/1/galleries/1/photos/1/original', upload_status: 'uploaded', state: 'current', deleted_at: null }] };
          }
          if (sql.includes('SELECT id, upload_status, processing_status, state FROM photo_assets')) {
            return { rows: [] };
          }
          if (sql.includes('UPDATE photo_assets SET processing_status = \'processing\'')) {
            return { rowCount: 1 };
          }
          if (sql.includes('UPDATE photo_assets SET upload_status = \'uploaded\', processing_status = \'ready\'')) {
            return { rowCount: 1 };
          }
          if (sql.includes('SELECT COUNT(*) FILTER')) {
            return { rows: [{ ready: true }] };
          }
          if (sql.includes('UPDATE photos SET status = \'active\'')) {
            return { rowCount: 1 };
          }
          return { rows: [] };
        }),
      } as any;

      await expect(handler.execute({ id: 'job-1', type: 'PROCESS_PHOTO_ASSETS', payload: { photoId: '22222222-2222-4222-8222-222222222222', sourceAssetId: '33333333-3333-4333-8333-333333333333' }, attempts: 1, lockToken: 'token' }, transaction)).resolves.toBeUndefined();
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true, writable: true });
    }
  });

  it('redacts sensitive values before emitting structured logs and records a security audit event', () => {
    const sanitized = sanitizeForLogging({
      password: 's3cr3t',
      pin: '123456',
      secretToken: 'abc',
      sessionToken: 'def',
      nested: { storageKey: 'private/path', accessToken: 'ghi' },
      galleryId: '11111111-1111-4111-8111-111111111111',
      action: 'gallery.publish',
    });

    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.pin).toBe('[REDACTED]');
    expect(sanitized.secretToken).toBe('[REDACTED]');
    expect(sanitized.sessionToken).toBe('[REDACTED]');
    expect(sanitized.nested.storageKey).toBe('[REDACTED]');
    expect(sanitized.nested.accessToken).toBe('[REDACTED]');
    expect(sanitized.galleryId).toBe('11111111-1111-4111-8111-111111111111');

    const audit = recordAuditEvent({
      event: 'gallery.publish',
      actorId: 'owner-1',
      resourceType: 'gallery',
      resourceId: 'gallery-1',
      requestId: 'req-123',
      outcome: 'success',
      occurredAt: new Date().toISOString(),
      details: { secretToken: 'topsecret', sessionToken: 'abc', galleryId: 'gallery-1' },
    });

    expect(audit.event).toBe('gallery.publish');
    expect(audit.details.secretToken).toBe('[REDACTED]');
    expect(audit.details.sessionToken).toBe('[REDACTED]');
    expect(audit.details.galleryId).toBe('gallery-1');
  });
});
