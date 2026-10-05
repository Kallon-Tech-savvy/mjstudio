export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'INVALID_GALLERY_ACCESS'
  | 'GALLERY_NOT_PUBLISHABLE'
  | 'UPLOAD_NOT_VERIFIED'
  | 'ASSET_NOT_READY'
  | 'DOWNLOAD_NOT_PERMITTED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ErrorEnvelope {
  code: ErrorCode;
  message: string;
  fields?: Record<string, string>;
  requestId?: string;
}

export interface AuditEvent {
  event: string;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  requestId?: string;
  jobId?: string;
  outcome: 'success' | 'denied' | 'error';
  occurredAt: string;
  details?: Record<string, unknown>;
}
