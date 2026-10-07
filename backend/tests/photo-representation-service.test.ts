import { describe, expect, it, vi } from 'vitest';
import { PhotoRepresentationService } from '../src/services/photo-representation-service.js';

describe('PhotoRepresentationService', () => {
  it('creates an authorized view representation without exposing storage metadata', async () => {
    const createViewCapability = vi.fn(async () => ({
      url: 'https://example.com/signed-preview',
      expiresAt: new Date('2026-01-01T00:10:00.000Z'),
    }));
    const service = new PhotoRepresentationService({
      createUploadCapability: vi.fn(),
      verifyObject: vi.fn(),
      createViewCapability,
      createDownloadCapability: vi.fn(),
    });

    const result = await service.createView({
      storageKey: 'studios/studio-1/galleries/gallery-1/photos/photo-1/preview',
      width: 2400,
      height: 1600,
      mimeType: 'image/jpeg',
    }, 600);

    expect(createViewCapability).toHaveBeenCalledWith(
      'studios/studio-1/galleries/gallery-1/photos/photo-1/preview',
      600,
    );
    expect(result).toEqual({
      url: 'https://example.com/signed-preview',
      expiresAt: new Date('2026-01-01T00:10:00.000Z'),
      width: 2400,
      height: 1600,
      mimeType: 'image/jpeg',
    });
    expect(result).not.toHaveProperty('storageKey');
  });

  it('rejects incomplete representation metadata before calling storage', async () => {
    const createViewCapability = vi.fn();
    const service = new PhotoRepresentationService({
      createUploadCapability: vi.fn(),
      verifyObject: vi.fn(),
      createViewCapability,
      createDownloadCapability: vi.fn(),
    });

    await expect(service.createView({
      storageKey: 'preview',
      width: 0,
      height: 1600,
      mimeType: 'image/jpeg',
    }, 600)).rejects.toThrow('Photo representation metadata is incomplete.');

    expect(createViewCapability).not.toHaveBeenCalled();
  });

  it('rejects invalid expiry before calling storage', async () => {
    const createViewCapability = vi.fn();
    const service = new PhotoRepresentationService({
      createUploadCapability: vi.fn(),
      verifyObject: vi.fn(),
      createViewCapability,
      createDownloadCapability: vi.fn(),
    });

    await expect(service.createView({
      storageKey: 'preview',
      width: 600,
      height: 400,
      mimeType: 'image/jpeg',
    }, 0)).rejects.toThrow('Photo representation expiry must be a positive integer.');

    expect(createViewCapability).not.toHaveBeenCalled();
  });
});
