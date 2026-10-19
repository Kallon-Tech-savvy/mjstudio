import sharp, { type OutputInfo } from 'sharp';
import type { ImageProcessor } from './job-handlers.js';
import { PermanentJobError } from './job-service.js';
import type { LocalPhotoStorage } from './local-photo-storage.js';

type DerivativePreset = { width: number; height: number };

export class SharpImageProcessor implements ImageProcessor {
  constructor(
    private readonly storage: Pick<LocalPhotoStorage, 'readObjectBytes' | 'writeDerivative'>,
    private readonly preview: DerivativePreset = { width: 2400, height: 2400 },
    private readonly thumbnail: DerivativePreset = { width: 600, height: 600 },
  ) {}

  createPreview(sourceKey: string, destinationKey: string): Promise<DerivativeObject> {
    return this.createDerivative(sourceKey, destinationKey, this.preview);
  }

  createThumbnail(sourceKey: string, destinationKey: string): Promise<DerivativeObject> {
    return this.createDerivative(sourceKey, destinationKey, this.thumbnail);
  }

  private async createDerivative(sourceKey: string, destinationKey: string, preset: DerivativePreset): Promise<DerivativeObject> {
    let source: Buffer;
    try {
      source = await this.storage.readObjectBytes(sourceKey);
    } catch {
      throw new PermanentJobError('Source image is missing or failed storage verification.');
    }
    let output: { data: Buffer; info: OutputInfo };
    try {
      output = await sharp(source, { failOn: 'error', limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: preset.width, height: preset.height, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new PermanentJobError('Source image could not be decoded for derivative generation.');
    }
    if (!output.info.width || !output.info.height || output.data.length === 0 || output.info.format !== 'webp') {
      throw new PermanentJobError('Image processor returned invalid derivative metadata.');
    }
    const result = {
      mimeType: 'image/webp',
      fileSize: output.data.length,
      width: output.info.width,
      height: output.info.height,
    };
    await this.storage.writeDerivative(destinationKey, output.data, result);
    return result;
  }
}
