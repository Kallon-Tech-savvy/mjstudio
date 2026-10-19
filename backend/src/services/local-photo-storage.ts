import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { ForbiddenError, ValidationError } from '../errors.js';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { PhotoStorage, VerifiedStoredObject } from './photo-service.js';

type Capability = { key: string; expiresAt: number; operation: 'upload' | 'view' | 'download' };

export class UnverifiedStorageObjectError extends Error {}

export class LocalPhotoStorage implements PhotoStorage {
  private readonly root: string;

  constructor(
    rootDirectory: string,
    private readonly baseUrl: string,
    private readonly secret: string,
    private readonly maxUploadBytes = 25 * 1024 * 1024,
  ) {
    if (secret.length < 32) throw new Error('Local photo storage requires a secret of at least 32 characters.');
    this.root = resolve(rootDirectory);
  }

  async createUploadCapability(storageKey: string, expiresInSeconds: number) {
    return this.createCapability(storageKey, expiresInSeconds, 'upload', 'local-photo-uploads');
  }

  async createViewCapability(storageKey: string, expiresInSeconds: number) {
    return this.createCapability(storageKey, expiresInSeconds, 'view', 'local-photo-objects');
  }

  async createDownloadCapability(storageKey: string, expiresInSeconds: number) {
    return this.createCapability(storageKey, expiresInSeconds, 'download', 'local-photo-objects');
  }

  async verifyObject(storageKey: string): Promise<VerifiedStoredObject | null> {
    const objectPath = this.resolveObjectPath(storageKey);
    try {
      const [file, fileStat, metadataText] = await Promise.all([
        readFile(objectPath),
        stat(objectPath),
        readFile(this.metadataPath(objectPath), 'utf8'),
      ]);
      const metadata = JSON.parse(metadataText) as { mimeType?: string; width?: number; height?: number };
      const mimeType = this.detectImageMimeType(file);
      if (!mimeType || metadata.mimeType !== mimeType || fileStat.size < 1) return null;
      return { storageKey, mimeType, fileSize: fileStat.size, ...(Number.isSafeInteger(metadata.width) && Number.isSafeInteger(metadata.height) ? { width: metadata.width, height: metadata.height } : {}) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async readObjectBytes(storageKey: string): Promise<Buffer> {
    const verified = await this.verifyObject(storageKey);
    if (!verified) throw new Error('Source image object is missing or failed verification.');
    return readFile(this.resolveObjectPath(storageKey));
  }

  async writeDerivative(
    storageKey: string,
    bytes: Buffer,
    metadata: { mimeType: string; fileSize: number; width: number; height: number },
  ): Promise<void> {
    if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length !== metadata.fileSize
      || !Number.isSafeInteger(metadata.width) || metadata.width < 1
      || !Number.isSafeInteger(metadata.height) || metadata.height < 1
      || metadata.mimeType !== 'image/webp') {
      throw new Error('Derivative bytes or metadata are invalid.');
    }
    if (this.detectImageMimeType(bytes) !== metadata.mimeType) {
      throw new Error('Derivative content does not match its declared MIME type.');
    }
    const objectPath = this.resolveObjectPath(storageKey);
    const sidecarPath = this.metadataPath(objectPath);
    await mkdir(dirname(objectPath), { recursive: true });
    const suffix = `.tmp-${randomUUID()}`;
    const temporaryObject = `${objectPath}${suffix}`;
    const temporaryMetadata = `${sidecarPath}${suffix}`;
    try {
      await writeFile(temporaryObject, bytes, { flag: 'wx', mode: 0o600 });
      await writeFile(temporaryMetadata, JSON.stringify({
        mimeType: metadata.mimeType,
        width: metadata.width,
        height: metadata.height,
      }), { flag: 'wx', mode: 0o600 });
      await rename(temporaryObject, objectPath);
      await rename(temporaryMetadata, sidecarPath);
    } finally {
      await Promise.all([
        rm(temporaryObject, { force: true }),
        rm(temporaryMetadata, { force: true }),
      ]);
    }
  }

  async deleteObject(storageKey: string): Promise<void> {
    const objectPath = this.resolveObjectPath(storageKey);
    await Promise.all([
      rm(objectPath, { force: true }),
      rm(this.metadataPath(objectPath), { force: true }),
    ]);
  }

  async acceptUpload(token: string, contentType: string, bytes: Buffer): Promise<void> {
    const capability = this.verifyCapability(token, 'upload');
    if (!capability) throw new ForbiddenError('Upload capability is invalid or expired.');
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > this.maxUploadBytes) {
      throw new ValidationError('INVALID_UPLOAD_SIZE', 'Upload must contain an image within the configured size limit.');
    }
    const detectedType = this.detectImageMimeType(bytes);
    if (!detectedType || detectedType !== contentType.split(';')[0]?.trim().toLowerCase()) {
      throw new ValidationError('INVALID_UPLOAD_TYPE', 'Upload content type does not match a supported image format.');
    }
    const objectPath = this.resolveObjectPath(capability.key);
    await mkdir(dirname(objectPath), { recursive: true });
    await writeFile(objectPath, bytes, { flag: 'wx', mode: 0o600 });
    try {
      await writeFile(this.metadataPath(objectPath), JSON.stringify({ mimeType: detectedType }), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      // Do not leave an object that cannot be verified or retried after a sidecar-write failure.
      await rm(objectPath, { force: true });
      throw error;
    }
  }

  async readCapability(token: string): Promise<{ bytes: Buffer; mimeType: string; download: boolean } | null> {
    const capability = this.verifyCapability(token);
    if (!capability || (capability.operation !== 'view' && capability.operation !== 'download')) return null;
    const verified = await this.verifyObject(capability.key);
    if (!verified) return null;
    return {
      bytes: await readFile(this.resolveObjectPath(capability.key)),
      mimeType: verified.mimeType,
      download: capability.operation === 'download',
    };
  }

  private async createCapability(key: string, expiresInSeconds: number, operation: Capability['operation'], route: string) {
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 3600) {
      throw new Error('Capability expiry must be between 1 and 3600 seconds.');
    }
    this.resolveObjectPath(key);
    const payload: Capability = { key, expiresAt: Date.now() + expiresInSeconds * 1000, operation };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = Buffer.from(encoded + '.' + this.sign(encoded)).toString('base64url');
    return { url: `${this.baseUrl.replace(/\/$/, '')}/api/${route}/${token}`, expiresAt: new Date(payload.expiresAt) };
  }

  private verifyCapability(token: string, expectedOperation?: Capability['operation']): Capability | null {
    let signedToken: string;
    try {
      signedToken = Buffer.from(token, 'base64url').toString('utf8');
    } catch {
      return null;
    }
    const [encoded, signature, extra] = signedToken.split('.');
    if (!encoded || !signature || extra !== undefined) return null;
    const expected = this.sign(encoded);
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Capability;
      if (typeof payload.key !== 'string' || !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt <= Date.now()) return null;
      if (!['upload', 'view', 'download'].includes(payload.operation)) return null;
      if (expectedOperation && payload.operation !== expectedOperation) return null;
      this.resolveObjectPath(payload.key);
      return payload;
    } catch {
      return null;
    }
  }

  private sign(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }

  private resolveObjectPath(key: string): string {
    if (!key || key.includes('\\') || key.startsWith('/') || key.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new Error('Unsafe storage key.');
    }
    const path = resolve(this.root, key);
    const pathFromRoot = relative(this.root, path);
    if (!pathFromRoot || pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
      throw new Error('Storage key resolves outside the configured storage root.');
    }
    return path;
  }

  private metadataPath(objectPath: string): string {
    return `${objectPath}.metadata.json`;
  }

  private detectImageMimeType(bytes: Buffer): string | null {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
    if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return null;
  }
}
