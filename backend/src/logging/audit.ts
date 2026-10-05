import { logger } from './logger.js';

const REDACTED = '[REDACTED]';

export type AuditResult = 'success' | 'denied' | 'error';

export type AuditEntry = {
  event: string;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  requestId?: string;
  jobId?: string;
  outcome: AuditResult;
  occurredAt: string;
  details?: Record<string, unknown>;
};

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  const sensitivePatterns = [
    'password',
    'pin',
    'secret',
    'token',
    'session',
    'credential',
    'privatekey',
    'storagekey',
    'signedurl',
  ];
  return sensitivePatterns.some((pattern) => normalized.includes(pattern));
}

export function sanitizeForLogging(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogging(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        result[key] = REDACTED;
        continue;
      }
      result[key] = sanitizeForLogging(entry);
    }
    return result;
  }

  return value;
}

export function recordAuditEvent(entry: AuditEntry): AuditEntry {
  const safe = sanitizeForLogging(entry) as AuditEntry;
  logger.info({
    event: safe.event,
    actorId: safe.actorId,
    resourceType: safe.resourceType,
    resourceId: safe.resourceId,
    requestId: safe.requestId,
    jobId: safe.jobId,
    outcome: safe.outcome,
    occurredAt: safe.occurredAt,
    details: safe.details,
  }, 'audit event');
  return safe;
}
