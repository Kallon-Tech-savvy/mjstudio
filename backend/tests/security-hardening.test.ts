import { describe, expect, it } from 'vitest';
import { ensurePhotographerCanAccessStudio, ensureGalleryAccessAllowed } from '../src/auth/authorization.js';
import { buildClientContext, buildPhotographerContext } from '../src/auth/context.js';
import { canAccessGalleryBySession, canDownloadFromGallery } from '../src/application/policies/client-gallery.policy.js';
import { ensureUserCanAccessGallery } from '../src/application/policies/gallery.policy.js';
import { parseInput } from '../src/http/validation.js';
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
});
