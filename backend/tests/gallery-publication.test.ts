import { describe, expect, it } from 'vitest';
import { buildPhotographerContext } from '../src/auth/context.js';
import { GalleryService } from '../src/services/gallery-service.js';

function publicationFixture(options: { archived?: boolean; published?: boolean; ready?: boolean; access?: boolean; client?: boolean; role?: string } = {}) {
  const actor = buildPhotographerContext();
  const statements: string[] = [];
  const row = { id: 'gallery-1', studio_id: actor.studioId, workflow_status: 'draft', publication_status: options.published ? 'published' : 'unpublished', archived_at: options.archived ? new Date() : null, role: options.role ?? 'owner' };
  const transaction = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('AS has_usable_photos')) return { rows: [{ has_usable_photos: options.ready ?? true, has_client: options.client ?? true, has_active_access: options.access ?? true }] };
      if (sql.includes('UPDATE galleries')) return { rows: [{ id: row.id, publicationStatus: 'published', workflowStatus: 'reviewing' }] };
      if (sql.includes('FROM galleries')) return { rows: [row] };
      return { rows: [] };
    },
    release: () => undefined,
  };
  const service = new GalleryService({ connect: async () => transaction } as never);
  return { actor, service, statements };
}

describe('gallery publication transition', () => {
  it('publishes a ready draft and starts client review atomically', async () => {
    const { service, actor, statements } = publicationFixture();
    await expect(service.publish(actor, 'gallery-1')).resolves.toMatchObject({ publicationStatus: 'published', workflowStatus: 'reviewing' });
    expect(statements.find((sql) => sql.includes('UPDATE galleries'))).toContain("workflow_status = CASE");
    expect(statements).toContain('COMMIT');
  });

  for (const options of [{ ready: false }, { access: false }, { client: false }, { archived: true }, { published: true }, { role: 'uploader' }]) {
    it(`rejects publication without authoritative prerequisites: ${JSON.stringify(options)}`, async () => {
      const { service, actor, statements } = publicationFixture(options);
      await expect(service.publish(actor, 'gallery-1')).rejects.toThrow();
      expect(statements.some((sql) => sql.includes('UPDATE galleries'))).toBe(false);
      expect(statements).toContain('ROLLBACK');
    });
  }
});
