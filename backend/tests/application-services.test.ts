import { describe, expect, it } from 'vitest';
import { ensureGalleryPermission } from '../src/application/policies/gallery.policy.js';
import { buildPhotographerContext } from '../src/auth/context.js';
import { assertGalleryCanArchive, assertGalleryCanPublish } from '../src/services/service-common.js';
import { PhotoService } from '../src/services/photo-service.js';

describe('application-service rules', () => {
  it('requires an explicit gallery capability rather than studio role alone', () => {
    const actor = buildPhotographerContext({ role: 'owner' });
    const gallery = { id: 'gallery-1', studioId: actor.studioId };

    expect(() => ensureGalleryPermission(actor, gallery, 'uploader', 'gallery.publish')).toThrowError();
    expect(() => ensureGalleryPermission(actor, gallery, 'owner', 'gallery.publish')).not.toThrow();
  });

  it('rejects publication unless all dependencies and lifecycle conditions are valid', () => {
    expect(() => assertGalleryCanPublish(
      { archivedAt: null, workflowStatus: 'reviewing', publicationStatus: 'unpublished' },
      { hasUsablePhotos: true, hasClient: true, hasActiveAccess: true },
    )).not.toThrow();

    expect(() => assertGalleryCanPublish(
      { archivedAt: null, workflowStatus: 'draft', publicationStatus: 'unpublished' },
      { hasUsablePhotos: true, hasClient: true, hasActiveAccess: true },
    )).toThrowError(expect.objectContaining({ code: 'GALLERY_NOT_PUBLISHABLE' }));

    expect(() => assertGalleryCanPublish(
      { archivedAt: null, workflowStatus: 'completed', publicationStatus: 'unpublished' },
      { hasUsablePhotos: false, hasClient: true, hasActiveAccess: true },
    )).toThrowError(expect.objectContaining({ code: 'GALLERY_NOT_PUBLISHABLE' }));
  });

  it('rejects repeat archive transitions', () => {
    expect(() => assertGalleryCanArchive({ archivedAt: new Date() })).toThrowError(expect.objectContaining({ code: 'INVALID_GALLERY_STATE' }));
  });

  it('rejects reorder requests that do not include the complete active gallery set', async () => {
    const database = {
      query: async (sql: string) => sql.includes('JOIN studio_members')
        ? { rows: [{ id: 'gallery-1', studio_id: '22222222-2222-4222-8222-222222222222', role: 'owner', workflow_status: 'reviewing', publication_status: 'unpublished', archived_at: null }] }
        : { rows: [] },
      connect: async () => ({
        query: async (sql: string) => sql.includes('SELECT id FROM photos')
          ? { rows: [{ id: 'photo-a' }, { id: 'photo-b' }] }
          : { rows: [] },
        release: () => undefined,
      }),
    } as never;
    const service = new PhotoService(database, {} as never, {} as never);
    const actor = buildPhotographerContext();

    await expect(service.reorder(actor, 'gallery-1', ['photo-a'])).rejects.toThrowError(
      expect.objectContaining({ code: 'INVALID_PHOTO_ORDER' }),
    );
  });
});