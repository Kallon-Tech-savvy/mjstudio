import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database, Transaction } from './service-common.js';
import { inTransaction } from './service-common.js';
import { NotFoundError } from '../errors.js';

export const jobPayloadSchemas = {
  PROCESS_PHOTO_ASSETS: z.object({ photoId: z.string().uuid(), sourceAssetId: z.string().uuid() }).strict(),
  CLEANUP_PHOTO_ASSETS: z.object({ photoId: z.string().uuid() }).strict(),
  RECONCILE_PHOTO_ASSET: z.object({ assetId: z.string().uuid() }).strict(),
} as const;

export type ProcessPhotoAssetsPayload = z.infer<typeof jobPayloadSchemas.PROCESS_PHOTO_ASSETS>;
export type CleanupPhotoAssetsPayload = z.infer<typeof jobPayloadSchemas.CLEANUP_PHOTO_ASSETS>;
export type ReconcilePhotoAssetPayload = z.infer<typeof jobPayloadSchemas.RECONCILE_PHOTO_ASSET>;
export type JobType = keyof typeof jobPayloadSchemas;
export type JobPayload<T extends JobType = JobType> = T extends 'PROCESS_PHOTO_ASSETS' ? ProcessPhotoAssetsPayload
  : T extends 'CLEANUP_PHOTO_ASSETS' ? CleanupPhotoAssetsPayload : ReconcilePhotoAssetPayload;
export type ClaimedJob<T extends JobType = JobType> = { id: string; type: T; payload: JobPayload<T>; attempts: number; lockToken: string };

export interface JobQueue {
  enqueue<T extends JobType>(job: { id: string; type: T; payload: JobPayload<T> }): Promise<void>;
}

export class PermanentJobError extends Error {}
export class TransientJobError extends Error {}

export class JobService implements JobQueue {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async enqueue<T extends JobType>(job: { id?: string; type: T; payload: JobPayload<T>; dedupeKey?: string; availableAt?: Date }) {
    await this.enqueueInTransaction(this.database, job);
  }

  async enqueueInTransaction<T extends JobType>(
    queryable: { query: Database['query'] },
    job: { id?: string; type: T; payload: JobPayload<T>; dedupeKey?: string; availableAt?: Date },
  ) {
    const parsed = jobPayloadSchemas[job.type].safeParse(job.payload);
    if (!parsed.success) throw new TypeError('Invalid job payload.');
    const identity = job.dedupeKey ?? this.dedupeKey(job.type, parsed.data);
    const result = await queryable.query<{ id: string; payload: unknown }>(
      `INSERT INTO application_jobs (id, job_type, dedupe_key, payload, available_at)
       VALUES ($1, $2, $3, $4::jsonb, COALESCE($5, NOW()))
       ON CONFLICT (job_type, dedupe_key) DO UPDATE
         SET status = CASE WHEN application_jobs.status = 'failed' THEN 'pending' ELSE application_jobs.status END,
             attempts = CASE WHEN application_jobs.status = 'failed' THEN 0 ELSE application_jobs.attempts END,
             available_at = CASE WHEN application_jobs.status = 'failed' THEN COALESCE($5, NOW()) ELSE application_jobs.available_at END,
             updated_at = NOW()
       RETURNING id, payload`,
      [job.id ?? this.createId(), job.type, identity, JSON.stringify(parsed.data), job.availableAt ?? null]);
    return { id: result.rows[0]!.id, type: job.type, payload: parsed.data };
  }

  private dedupeKey(type: JobType, payload: unknown) {
    const value = payload as Record<string, string>;
    switch (type) {
      case 'PROCESS_PHOTO_ASSETS': return value.sourceAssetId;
      case 'CLEANUP_PHOTO_ASSETS': return value.photoId;
      case 'RECONCILE_PHOTO_ASSET': return value.assetId;
    }
  }

  async claim<T extends JobType>(type: T, leaseSeconds = 60): Promise<ClaimedJob<T> | null> {
    return inTransaction(this.database, async (transaction) => {
      const row = await transaction.query<{
        id: string; job_type: T; payload: unknown; attempts: number; lock_token: string;
      }>(
        `WITH candidate AS (
           SELECT id FROM application_jobs
            WHERE job_type = $1 AND available_at <= NOW() AND attempts < max_attempts
              AND (status = 'pending' OR (status = 'processing' AND locked_until < NOW()))
            ORDER BY available_at, created_at
            FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE application_jobs j
            SET status = 'processing', attempts = attempts + 1, started_at = NOW(),
                locked_until = NOW() + make_interval(secs => $2), lock_token = $3, updated_at = NOW()
           FROM candidate c WHERE j.id = c.id
         RETURNING j.id, j.job_type, j.payload, j.attempts, j.lock_token`,
        [type, leaseSeconds, this.createId()]);
      const job = row.rows[0];
      if (!job) return null;
      const payload = jobPayloadSchemas[type].parse(job.payload) as JobPayload<T>;
      return { id: job.id, type, payload, attempts: job.attempts, lockToken: job.lock_token };
    });
  }

  async heartbeat(job: ClaimedJob, leaseSeconds = 60) {
    const result = await this.database.query(
      `UPDATE application_jobs SET locked_until = NOW() + make_interval(secs => $3), updated_at = NOW()
        WHERE id = $1 AND lock_token = $2 AND status = 'processing'`, [job.id, job.lockToken, leaseSeconds]);
    if (result.rowCount !== 1) throw new NotFoundError('JOB_LEASE_LOST', 'Job lease is no longer owned.');
  }

  async complete(job: ClaimedJob, transactionCallback?: (transaction: Transaction) => Promise<void>) {
    return inTransaction(this.database, async (transaction) => {
      await transactionCallback?.(transaction);
      const result = await transaction.query(
        `UPDATE application_jobs SET status = 'completed', completed_at = NOW(), locked_until = NULL,
                lock_token = NULL, last_error = NULL, updated_at = NOW()
          WHERE id = $1 AND lock_token = $2 AND status = 'processing'`, [job.id, job.lockToken]);
      if (result.rowCount !== 1) throw new NotFoundError('JOB_LEASE_LOST', 'Job lease is no longer owned.');
    });
  }

  async fail(job: ClaimedJob, error: unknown, maxAttempts = 5) {
    const permanent = error instanceof PermanentJobError;
    const terminal = permanent || job.attempts >= maxAttempts;
    const backoffSeconds = Math.min(3600, 2 ** Math.max(0, job.attempts - 1) * 15);
    const details = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 2000) : 'Unknown job failure';
    const result = await this.database.query(
      `UPDATE application_jobs
          SET status = CASE WHEN $3 THEN 'failed' ELSE 'pending' END,
              failed_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
              available_at = CASE WHEN $3 THEN available_at ELSE NOW() + make_interval(secs => $4) END,
              locked_until = NULL, lock_token = NULL, last_error = $5, updated_at = NOW()
        WHERE id = $1 AND lock_token = $2 AND status = 'processing'`,
      [job.id, job.lockToken, terminal, backoffSeconds, details]);
    if (result.rowCount !== 1) throw new NotFoundError('JOB_LEASE_LOST', 'Job lease is no longer owned.');
  }
}

export interface JobHandler<T extends JobType = JobType> {
  type: T;
  execute(job: ClaimedJob<T>, transaction: Transaction): Promise<void>;
}

export class JobWorker<T extends JobType> {
  constructor(private readonly jobs: JobService, private readonly handler: JobHandler<T>) {}

  async runOne() {
    const job = await this.jobs.claim(this.handler.type);
    if (!job) return false;
    try {
      await this.jobs.complete(job, (transaction) => this.handler.execute(job, transaction));
    } catch (error) {
      await this.jobs.fail(job, error);
    }
    return true;
  }
}