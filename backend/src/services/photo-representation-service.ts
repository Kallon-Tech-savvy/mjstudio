import type { PhotoStorage } from './photo-service.js';

export type PhotoRepresentation = {
  url: string;
  expiresAt: Date;
  width: number;
  height: number;
  mimeType: string;
};

export class PhotoRepresentationService {
  constructor(private readonly storage: PhotoStorage) {}

  async createView(
    asset: {
      storageKey: string;
      width: number | null;
      height: number | null;
      mimeType: string | null;
    },
    expiresInSeconds: number,
  ): Promise<PhotoRepresentation> {
    if (!asset.storageKey || !asset.width || !asset.height || !asset.mimeType) {
      throw new Error('Photo representation metadata is incomplete.');
    }

    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
      throw new Error('Photo representation expiry must be a positive integer.');
    }

    const capability = await this.storage.createViewCapability(
      asset.storageKey,
      expiresInSeconds,
    );

    return {
      url: capability.url,
      expiresAt: capability.expiresAt,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType,
    };
  }
}
