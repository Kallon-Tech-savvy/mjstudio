import { describe, expect, it, vi } from 'vitest';
import type { PhotographerContext } from '../src/auth/context.js';
import { FeedbackService } from '../src/services/client-workflow-services.js';
import { GalleryAccessService } from '../src/services/client-access-service.js';

const actor: PhotographerContext = {
  userId: 'user-1',
  studioId: 'studio-1',
  role: 'owner',
  sessionToken: 'session-token',
};

describe('GalleryAccessService reset persistence', () => {
  it('moves client selections and feedback to the replacement grant transactionally', async () => {
    const statements: Array<{ sql: string; values?: unknown[] }> = [];
    const transaction = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        statements.push({ sql, values });
        if (sql.includes('SELECT id FROM galleries')) return { rows: [{ id: 'gallery-1' }] };
        if (sql.includes('SELECT id, expires_at FROM gallery_access')) {
          return { rows: [{ id: 'previous-grant', expires_at: null }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const database = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM galleries g')) {
          return {
            rows: [{
              id: 'gallery-1',
              studio_id: 'studio-1',
              role: 'owner',
              workflow_status: 'reviewing',
              publication_status: 'published',
              archived_at: null,
            }],
          };
        }
        return { rows: [] };
      }),
      connect: vi.fn(async () => transaction),
    };
    const service = new GalleryAccessService(database as never, {
      deliver: vi.fn(),
      resend: vi.fn(),
    }, () => 'replacement-grant');

    await service.reset(actor, 'gallery-1', 'view_download');

    const insertIndex = statements.findIndex(({ sql }) => sql.includes('INSERT INTO gallery_access'));
    expect(insertIndex).toBeGreaterThan(-1);
    for (const table of ['gallery_selections', 'photo_selections', 'gallery_feedback', 'photo_feedback']) {
      const transferIndex = statements.findIndex(({ sql }) =>
        sql.includes(`UPDATE ${table} SET gallery_access_id = $2`),
      );
      expect(transferIndex).toBeGreaterThan(insertIndex);
      expect(statements[transferIndex].values).toEqual(['previous-grant', 'replacement-grant']);
    }

    expect(statements[0].sql).toBe('BEGIN');
    expect(statements.at(-1)?.sql).toBe('COMMIT');
    expect(transaction.release).toHaveBeenCalledOnce();
  });

  it.each([
    { state: 'revoked', grantId: 'revoked-grant', current: [] as Array<{ id: string; expires_at: Date | null }> },
    { state: 'expired', grantId: 'expired-grant', current: [{ id: 'expired-grant', expires_at: new Date(0) }] },
  ])('preserves client work when issuing a new grant after the previous grant was $state', async ({ grantId, current }) => {
    const statements: Array<{ sql: string; values?: unknown[] }> = [];
    const transaction = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        statements.push({ sql, values });
        if (sql.includes('SELECT id FROM galleries')) return { rows: [{ id: 'gallery-1' }] };
        if (sql.includes('SELECT id, expires_at FROM gallery_access')) return { rows: current };
        if (sql.includes('SELECT id FROM gallery_access')) return { rows: [{ id: grantId }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const database = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM galleries g')) {
          return {
            rows: [{
              id: 'gallery-1',
              studio_id: 'studio-1',
              role: 'owner',
              workflow_status: 'reviewing',
              publication_status: 'published',
              archived_at: null,
            }],
          };
        }
        return { rows: [] };
      }),
      connect: vi.fn(async () => transaction),
    };
    const service = new GalleryAccessService(database as never, {
      deliver: vi.fn(),
      resend: vi.fn(),
    }, () => 'replacement-grant');

    await service.create(actor, 'gallery-1', { permission: 'view_download' });

    const insertIndex = statements.findIndex(({ sql }) => sql.includes('INSERT INTO gallery_access'));
    expect(insertIndex).toBeGreaterThan(-1);
    for (const table of ['gallery_selections', 'photo_selections', 'gallery_feedback', 'photo_feedback']) {
      const transferIndex = statements.findIndex(({ sql }) =>
        sql.includes(`UPDATE ${table} SET gallery_access_id = $2`),
      );
      expect(transferIndex).toBeGreaterThan(insertIndex);
      expect(statements[transferIndex].values).toEqual([grantId, 'replacement-grant']);
    }

    expect(statements.at(-1)?.sql).toBe('COMMIT');
  });

  it('keeps feedback from revoked grants visible to the studio', async () => {
    let feedbackQuery = '';
    const database = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM galleries g')) {
          return {
            rows: [{
              id: 'gallery-1',
              studio_id: 'studio-1',
              role: 'owner',
              workflow_status: 'reviewing',
              publication_status: 'published',
              archived_at: null,
            }],
          };
        }
        feedbackQuery = sql;
        return { rows: [{ id: 'feedback-1', message: 'Please keep this moment.' }] };
      }),
    };
    const service = new FeedbackService(database as never);

    await expect(service.listForStudio(actor, 'gallery-1')).resolves.toEqual([
      { id: 'feedback-1', message: 'Please keep this moment.' },
    ]);
    expect(feedbackQuery).toContain('WHERE ga.gallery_id = $1');
    expect(feedbackQuery).not.toContain('ga.revoked_at IS NULL');
  });
});
