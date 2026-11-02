import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import sharp, { type Metadata } from 'sharp';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import type { ImageProcessor, DerivativeObject, AssetStorage } from '../services/job-handlers.js';
import type { PhotoStorage, VerifiedStoredObject } from '../services/photo-service.js';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 60_000_000;
const SUPPORTED_MIME_TYPES: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  tiff: 'image/tiff',
  gif: 'image/gif',
};

type Capability = {
  key: string;
  expiresAt: number;
  purpose: 'upload' | 'view' | 'download';
  mimeType?: string;
};

export class LocalDevelopmentPhotoStorage implements PhotoStorage, AssetStorage {
  private readonly signingKey = randomBytes(32);

  constructor(
    private readonly rootDirectory: string,
    private readonly baseUrl: string,
  ) {}

  async createUploadCapability(storageKey: string, expiresInSeconds: number, contentType: string) {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    if (!Object.values(SUPPORTED_MIME_TYPES).includes(contentType)) {
      throw new ValidationError('INVALID_UPLOAD_TYPE', 'Choose a supported raster image format.');
    }
    this.resolveObjectPath(storageKey);
    const token = this.createToken({ key: storageKey, expiresAt: Math.floor(expiresAt.getTime() / 1000), purpose: 'upload', mimeType: contentType });
    return {
      method: 'PUT' as const,
      url: `${this.baseUrl}/api/local-photo-storage/upload`,
      headers: { 'X-Upload-Capability': token },
      expiresAt,
    };
  }

  async verifyObject(storageKey: string): Promise<(VerifiedStoredObject & DerivativeObject) | null> {
    const filePath = this.resolveObjectPath(storageKey);
    try {
      const fileStats = await stat(filePath);
      if (!fileStats.isFile() || fileStats.size <= 0) return null;
      const metadata = await sharp(filePath, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
      const mimeType = metadata.format ? SUPPORTED_MIME_TYPES[metadata.format] : undefined;
      if (!mimeType || !metadata.width || !metadata.height) return null;
      return {
        storageKey,
        mimeType,
        fileSize: fileStats.size,
        width: metadata.width,
        height: metadata.height,
      };
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async createViewCapability(storageKey: string, expiresInSeconds: number) {
    return this.createReadCapability(storageKey, expiresInSeconds, 'view');
  }

  async createDownloadCapability(storageKey: string, expiresInSeconds: number) {
    return this.createReadCapability(storageKey, expiresInSeconds, 'download');
  }

  async acceptUpload(token: string | undefined, contentType: string | undefined, contents: Buffer): Promise<void> {
    const capability = this.readToken(token, 'upload');
    if (!capability.mimeType || contentType?.toLowerCase() !== capability.mimeType) {
      throw new ValidationError('INVALID_UPLOAD_TYPE', 'The uploaded file type does not match its upload capability.');
    }
    if (contents.length === 0 || contents.length > MAX_UPLOAD_BYTES) {
      throw new ValidationError('INVALID_UPLOAD_SIZE', 'Image uploads must be between 1 byte and 25 MB.');
    }

    let metadata: Metadata;
    try {
      metadata = await sharp(contents, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
    } catch {
      throw new ValidationError('INVALID_IMAGE', 'The uploaded file is not a supported image.');
    }
    if (!metadata.format || SUPPORTED_MIME_TYPES[metadata.format] !== capability.mimeType || !metadata.width || !metadata.height) {
      throw new ValidationError('INVALID_IMAGE', 'The uploaded file is not a supported image matching its declared type.');
    }

    const filePath = this.resolveObjectPath(capability.key);
    await mkdir(dirname(filePath), { recursive: true });
    try {
      await writeFile(filePath, contents, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (isAlreadyExists(error)) throw new ForbiddenError('This upload capability has already been used.');
      throw error;
    }
  }

  async resolveReadCapability(token: string | undefined, purpose: 'view' | 'download') {
    const capability = this.readToken(token, purpose);
    const object = await this.verifyObject(capability.key);
    if (!object) throw new NotFoundError('PHOTO_OBJECT_NOT_FOUND', 'Photo is not available.');
    return { filePath: this.resolveObjectPath(capability.key), object };
  }

  async createPreview(sourceKey: string, destinationKey: string): Promise<DerivativeObject> {
    return this.createDerivative(sourceKey, destinationKey, 2048, 84);
  }

  async createThumbnail(sourceKey: string, destinationKey: string): Promise<DerivativeObject> {
    return this.createDerivative(sourceKey, destinationKey, 480, 78);
  }

  async deleteObject(storageKey: string): Promise<void> {
    try {
      await rm(this.resolveObjectPath(storageKey), { force: true });
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }

  private async createReadCapability(storageKey: string, expiresInSeconds: number, purpose: 'view' | 'download') {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const token = this.createToken({ key: storageKey, expiresAt: Math.floor(expiresAt.getTime() / 1000), purpose });
    const path = purpose === 'view' ? 'view' : 'download';
    return {
      url: `${this.baseUrl}/api/local-photo-storage/${path}?capability=${encodeURIComponent(token)}`,
      expiresAt,
    };
  }

  private async createDerivative(sourceKey: string, destinationKey: string, size: number, quality: number): Promise<DerivativeObject> {
    const sourcePath = this.resolveObjectPath(sourceKey);
    const destinationPath = this.resolveObjectPath(destinationKey);
    await mkdir(dirname(destinationPath), { recursive: true });
    const { data, info } = await sharp(sourcePath, { limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate()
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    await writeFile(destinationPath, data, { mode: 0o600 });
    return { mimeType: 'image/webp', fileSize: info.size, width: info.width, height: info.height };
  }

  private createToken(capability: Capability) {
    const payload = Buffer.from(JSON.stringify(capability)).toString('base64url');
    const signature = createHmac('sha256', this.signingKey).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  private readToken(token: string | undefined, purpose: Capability['purpose']): Capability {
    if (!token || token.length > 4096) throw new ForbiddenError('Photo capability is invalid or expired.');
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined) throw new ForbiddenError('Photo capability is invalid or expired.');
    const expectedSignature = createHmac('sha256', this.signingKey).update(payload).digest();
    let suppliedSignature: Buffer;
    try {
      suppliedSignature = Buffer.from(signature, 'base64url');
    } catch {
      throw new ForbiddenError('Photo capability is invalid or expired.');
    }
    if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) {
      throw new ForbiddenError('Photo capability is invalid or expired.');
    }
    let capability: Capability;
    try {
      capability = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Capability;
    } catch {
      throw new ForbiddenError('Photo capability is invalid or expired.');
    }
    if (capability.purpose !== purpose || !Number.isInteger(capability.expiresAt) || capability.expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new ForbiddenError('Photo capability is invalid or expired.');
    }
    this.resolveObjectPath(capability.key);
    return capability;
  }

  private resolveObjectPath(storageKey: string) {
    const segments = storageKey.split('/');
    if (segments.length < 3 || segments.some((segment) => !/^[a-zA-Z0-9_-]+$/.test(segment))) {
      throw new ValidationError('INVALID_STORAGE_KEY', 'Photo storage key is invalid.');
    }
    const root = resolve(this.rootDirectory);
    const filePath = resolve(root, ...segments);
    if (!filePath.startsWith(`${root}${sep}`)) throw new ValidationError('INVALID_STORAGE_KEY', 'Photo storage key is invalid.');
    return filePath;
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
