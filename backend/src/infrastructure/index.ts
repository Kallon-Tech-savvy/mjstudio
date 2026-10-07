export interface UploadCapability {
  url: string;
  method?: 'PUT' | 'POST';
  headers?: Record<string, string>;
  expiresAt: string;
}

export interface ObjectVerification {
  ok: boolean;
  objectKey?: string;
  reason?: string;
}

export interface ObjectStorage {
  createUploadCapability(input: {
    objectKey: string;
    contentType?: string;
    ttlSeconds?: number;
  }): Promise<UploadCapability>;
  verifyObject(input: {
    objectKey: string;
    expectedContentType?: string;
  }): Promise<ObjectVerification>;
  createViewCapability(input: {
    objectKey: string;
    ttlSeconds?: number;
  }): Promise<UploadCapability>;
  createDownloadCapability?(input: {
    objectKey: string;
    ttlSeconds?: number;
  }): Promise<UploadCapability>;
  deleteObject?(input: { objectKey: string }): Promise<void>;
}

export interface QueuedJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  retries?: number;
  createdAt?: string;
}

export interface JobQueue {
  enqueue(job: QueuedJob): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface Randomness {
  generateId(): string;
  secureToken(length?: number): Promise<string>;
}
