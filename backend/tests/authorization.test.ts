import { describe, expect, it } from 'vitest';
import { canAccessGalleryBySession, canManageGalleryAccess, canManageGalleryMetadata, canRecommendPhoto, canReadClientGallery, ensurePhotoInGallery, ensureStudioScope, ensureUserCanAccessGallery } from '../src/application/policies/index.js';
import { buildClientContext, buildPhotographerContext } from '../src/auth/context.js';

describe('authorization policy enforcement', () => {
  it('denies cross-studio photographer access', () => {
    const user = buildPhotographerContext({ studioId: '22222222-2222-4222-8222-222222222222' });

    expect(() => ensureStudioScope(user, '33333333-3333-4333-8333-333333333333')).toThrowError();
  });

  it('enforces gallery ownership and scope for a photographer', () => {
    const user = buildPhotographerContext({
      userId: '11111111-1111-4111-8111-111111111111',
      studioId: '22222222-2222-4222-8222-222222222222',
      role: 'owner',
    });

    expect(() => ensureUserCanAccessGallery(user, { id: '55555555-5555-4555-8555-555555555555', studioId: '22222222-2222-4222-8222-222222222222' })).not.toThrow();
    expect(() => ensureUserCanAccessGallery(user, { id: '99999999-9999-4999-8999-999999999999', studioId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })).toThrowError();
  });

  it('denies a client access to another gallery even when a matching photo id is supplied', () => {
    const client = buildClientContext({ galleryId: '55555555-5555-4555-8555-555555555555', permission: 'view' });

    expect(() => canReadClientGallery(client, '55555555-5555-4555-8555-555555555555')).not.toThrow();
    expect(() => canReadClientGallery(client, '11111111-1111-4111-8111-111111111111')).toThrowError();
  });

  it('requires photo membership in the same gallery before allowing an operation', () => {
    const user = buildPhotographerContext({ studioId: '22222222-2222-4222-8222-222222222222', role: 'owner' });

    expect(() => ensurePhotoInGallery({ id: 'photo-1', galleryId: '55555555-5555-4555-8555-555555555555' }, '55555555-5555-4555-8555-555555555555')).not.toThrow();
    expect(() => ensurePhotoInGallery({ id: 'photo-1', galleryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, '55555555-5555-4555-8555-555555555555')).toThrowError();
    expect(() => canRecommendPhoto(user, { id: '55555555-5555-4555-8555-555555555555', studioId: '22222222-2222-4222-8222-222222222222' }, { id: 'photo-1', galleryId: '55555555-5555-4555-8555-555555555555' })).not.toThrow();
  });

  it('allows only the correct gallery access operations for the matched gallery role', () => {
    const user = buildPhotographerContext({ studioId: '22222222-2222-4222-8222-222222222222', role: 'owner' });

    expect(() => canManageGalleryMetadata(user, { id: '55555555-5555-4555-8555-555555555555', studioId: '22222222-2222-4222-8222-222222222222' }, 'owner')).not.toThrow();
    expect(() => canManageGalleryAccess(user, { id: '55555555-5555-4555-8555-555555555555', studioId: '22222222-2222-4222-8222-222222222222' }, 'owner')).not.toThrow();
  });

  it('keeps client gallery access tied to a valid server-derived gallery session', () => {
    const client = buildClientContext({ galleryId: '55555555-5555-4555-8555-555555555555', permission: 'view_download' });

    expect(() => canAccessGalleryBySession(client, '55555555-5555-4555-8555-555555555555')).not.toThrow();
    expect(() => canAccessGalleryBySession(client, '99999999-9999-4999-8999-999999999999')).toThrowError();
  });
});
