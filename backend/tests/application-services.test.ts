import { describe, expect, it } from 'vitest';
import { ensureGalleryPermission } from '../src/application/policies/gallery.policy.js';
import { buildPhotographerContext } from '../src/auth/context.js';
import { ProcessPhotoAssetsHandler } from '../src/services/job-handlers.js';
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

  it('supersedes stale current derivatives before generating a replacement', async () => {
    const queries: string[] = [];
    const transaction = {
      query: async (sql: string, params?: unknown[]) => {
        queries.push(sql);
        if (sql.includes('FROM photos p JOIN photo_assets pa ON pa.photo_id = p.id') && sql.includes('WHERE p.id = $1 AND pa.id = $2')) {
          return { rows: [{ gallery_id: 'gallery-1', storage_key: 'studios/original', upload_status: 'uploaded', state: 'current', deleted_at: null }] };
        }
        if (sql.includes('SELECT id, upload_status, processing_status, state FROM photo_assets') && sql.includes('WHERE photo_id = $1 AND type = $2')) {
          return { rows: [{ id: 'old-preview', upload_status: 'failed', processing_status: 'failed', state: 'current' }] };
        }
        if (sql.includes("UPDATE photo_assets SET state = 'superseded'")) {
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes("INSERT INTO photo_assets (id, photo_id, type, state, storage_key, upload_status, processing_status)")) {
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes("UPDATE photo_assets SET upload_status = 'uploaded', processing_status = 'ready'")) {
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes('SELECT COUNT(*) FILTER')) {
          return { rows: [{ ready: true }] };
        }
        if (sql.includes("UPDATE photos SET status = 'active'")) {
          return { rowCount: 1, rows: [] };
        }
        return { rows: [] };
      },
    } as never;

    const handler = new ProcessPhotoAssetsHandler(
      {
        createPreview: async () => ({ mimeType: 'image/jpeg', fileSize: 200 }),
        createThumbnail: async () => ({ mimeType: 'image/jpeg', fileSize: 120 }),
      },
      { verifyObject: async () => ({ mimeType: 'image/jpeg', fileSize: 200 }) },
    );

    await handler.execute(
      { id: 'job-1', type: 'PROCESS_PHOTO_ASSETS', attempts: 1, lockToken: 'lock-1', payload: { photoId: '11111111-1111-4111-8111-111111111111', sourceAssetId: '22222222-2222-4222-8222-222222222222' } },
      transaction,
    );

    expect(queries.some((sql) => sql.includes("state = 'superseded'"))).toBe(true);
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