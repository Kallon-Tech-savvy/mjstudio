import { createHash } from 'node:crypto';
import type { Database } from './service-common.js';
import { RateLimitError } from '../errors.js';
import type { RateLimitProvider } from './container.js';

const policies = {
  login: { limit: 10, windowSeconds: 900 },
  'client-access': { limit: 8, windowSeconds: 900 },
  'access-reset': { limit: 5, windowSeconds: 3600 },
  download: { limit: 60, windowSeconds: 60 },
  feedback: { limit: 10, windowSeconds: 3600 },
} as const;

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
// Retain two hours so cleanup never removes a bucket that can still affect
// any currently configured rate-limit window (the longest is one hour).

export class PostgresRateLimitService implements RateLimitProvider {
  private lastCleanupAt = Number.NEGATIVE_INFINITY;
  private cleanupInFlight: Promise<void> | undefined;

  constructor(private readonly database: Database, private readonly now: () => number = Date.now) {}

  async assertAllowed(key: string, scope: keyof typeof policies) {
    await this.cleanupExpiredBucketsIfDue();
    const policy = policies[scope];
    const digest = createHash('sha256').update(key).digest('hex');
    const result = await this.database.query<{ request_count: number }>(
      `INSERT INTO api_rate_limit_buckets (scope, subject_hash, bucket_start, request_count)
       VALUES ($1, $2, date_trunc('second', NOW()) - make_interval(secs => MOD(EXTRACT(EPOCH FROM NOW())::int, $3)), 1)
       ON CONFLICT (scope, subject_hash, bucket_start)
       DO UPDATE SET request_count = api_rate_limit_buckets.request_count + 1
       RETURNING request_count`,
      [scope, digest, policy.windowSeconds],
    );
    if ((result.rows[0]?.request_count ?? 0) > policy.limit) throw new RateLimitError();
  }

  private async cleanupExpiredBucketsIfDue(): Promise<void> {
    if (this.cleanupInFlight) {
      await this.cleanupInFlight;
      return;
    }
    const now = this.now();
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;

    this.cleanupInFlight = this.database.query(
      `DELETE FROM api_rate_limit_buckets
        WHERE bucket_start < NOW() - INTERVAL '2 hours'`,
    ).then(() => {
      this.lastCleanupAt = this.now();
    }).finally(() => {
      this.cleanupInFlight = undefined;
    });
    await this.cleanupInFlight;
  }
}
