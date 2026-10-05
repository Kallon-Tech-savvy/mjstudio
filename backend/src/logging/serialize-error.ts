import { env } from '../config/env.js';

const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"]+/gi;
const SAFE_FIELDS = ['code', 'errno', 'syscall', 'address', 'port', 'severity', 'table', 'constraint'] as const;

// Connection strings can carry credentials, so they never reach the logs.
const scrub = (value: string) => value.replace(URL_PATTERN, '[REDACTED_URL]');

/**
 * Error properties such as `message` and `stack` are not enumerable, so a generic
 * key-copy drops them. This keeps the diagnostic fields and omits row data (`detail`).
 */
export function serializeError(err: unknown, depth = 0): Record<string, unknown> {
  if (!(err instanceof Error)) {
    return { value: typeof err === 'string' ? scrub(err) : typeof err };
  }

  const source = err as Error & Record<string, unknown>;
  const out: Record<string, unknown> = { name: source.name, message: scrub(source.message) };

  for (const field of SAFE_FIELDS) {
    if (source[field] !== undefined) out[field] = source[field];
  }

  const nested = source.errors;
  if (depth === 0 && Array.isArray(nested)) {
    out.causes = nested.slice(0, 3).map((cause: unknown) => serializeError(cause, 1));
  }

  if (env.NODE_ENV !== 'production' && typeof source.stack === 'string') {
    out.stack = scrub(source.stack);
  }

  return out;
}
