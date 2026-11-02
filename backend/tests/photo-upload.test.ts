import { describe, expect, it, vi } from 'vitest';
import { buildPhotographerContext } from '../src/auth/context.js';
import { PhotoService } from '../src/services/photo-service.js';

describe('photo upload setup', () => {
  it('does not create a pending photo when storage cannot issue an upload capability', async () => {
    const database = {
      query: vi.fn(async () => ({
        rows: [{
          id: '55555555-5555-4555-8555-555555555555',
          studio_id: '22222222-2222-4222-8222-222222222222',
          role: 'owner',
          workflow_status: 'draft',
          publication_status: 'unpublished',
          archived_at: null,
        }],
      })),
      connect: vi.fn(),
    };
    const storage = {
      createUploadCapability: vi.fn().mockRejectedValue(new Error('Storage unavailable')),
      verifyObject: vi.fn(),
      createViewCapability: vi.fn(),
      createDownloadCapability: vi.fn(),
    };
    const service = new PhotoService(
      database as never,
      storage,
      {} as never,
      () => '66666666-6666-4666-8666-666666666666',
    );
    const actor = buildPhotographerContext({
      studioId: '22222222-2222-4222-8222-222222222222',
      role: 'owner',
    });

    await expect(service.create(actor, '55555555-5555-4555-8555-555555555555', {
      filename: 'portrait.jpg',
      mimeType: 'image/jpeg',
    })).rejects.toThrow('Storage unavailable');
    expect(storage.createUploadCapability).toHaveBeenCalledOnce();
    expect(database.connect).not.toHaveBeenCalled();
    expect(database.query).toHaveBeenCalledOnce();
  });
});
