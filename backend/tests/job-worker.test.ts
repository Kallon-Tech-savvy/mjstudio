import { describe, expect, it, vi } from 'vitest';
import { JobService, JobWorker, type ClaimedJob, type JobHandler, type JobType } from '../src/services/job-service.js';
import type { Transaction } from '../src/services/service-common.js';

const job: ClaimedJob<'PROCESS_PHOTO_ASSETS'> = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'PROCESS_PHOTO_ASSETS',
  payload: {
    photoId: '22222222-2222-4222-8222-222222222222',
    sourceAssetId: '33333333-3333-4333-8333-333333333333',
  },
  attempts: 1,
  lockToken: 'test-lock-token',
};

describe('JobWorker', () => {
  it('heartbeats a claimed job while its handler is still running', async () => {
    let heartbeatCount = 0;
    const jobs = {
      claim: vi.fn(async (_type: JobType) => job),
      heartbeat: vi.fn(async () => { heartbeatCount += 1; }),
      complete: vi.fn(async (_claimed: ClaimedJob, callback: (transaction: Transaction) => Promise<void>) => {
        await callback({} as Transaction);
      }),
      fail: vi.fn(async () => undefined),
    } as unknown as JobService;
    const handler: JobHandler<'PROCESS_PHOTO_ASSETS'> = {
      type: 'PROCESS_PHOTO_ASSETS',
      execute: async () => new Promise((resolve) => setTimeout(resolve, 45)),
    };
    const worker = new JobWorker(jobs, handler, 5);

    expect(await worker.runOne()).toBe(true);
    expect(heartbeatCount).toBeGreaterThan(0);
    expect(jobs.complete).toHaveBeenCalledOnce();
    expect(jobs.fail).not.toHaveBeenCalled();
  });

  it('does not start a heartbeat when no job is available', async () => {
    const heartbeat = vi.fn(async () => undefined);
    const jobs = {
      claim: vi.fn(async () => null),
      heartbeat,
      complete: vi.fn(),
      fail: vi.fn(),
    } as unknown as JobService;
    const handler: JobHandler<'PROCESS_PHOTO_ASSETS'> = {
      type: 'PROCESS_PHOTO_ASSETS',
      execute: async () => undefined,
    };
    const worker = new JobWorker(jobs, handler, 5);

    expect(await worker.runOne()).toBe(false);
    expect(heartbeat).not.toHaveBeenCalled();
  });
});
