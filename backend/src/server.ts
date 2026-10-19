import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './logging/logger.js';
import { db, testDatabaseConnection } from './db/client.js';
import { serializeError } from './logging/serialize-error.js';
import { randomBytes } from 'node:crypto';
import { createApplicationServices, unavailableProviders } from './services/container.js';
import { LocalPhotoStorage } from './services/local-photo-storage.js';
import { JobService, JobWorker } from './services/job-service.js';
import { CleanupPhotoAssetsHandler, ProcessPhotoAssetsHandler, ReconcilePhotoAssetHandler } from './services/job-handlers.js';
import { SharpImageProcessor } from './services/sharp-image-processor.js';

if (!env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to start the API server.');
}

try {
  await testDatabaseConnection();
} catch (error) {
  logger.error(
    { err: serializeError(error) },
    'Cannot connect to the database. Check DATABASE_URL in backend/.env (host, port, user, password, network reachability), then restart.',
  );
  process.exit(1);
}

const providers = unavailableProviders(db);
let localPhotoStorage: LocalPhotoStorage | undefined;
if (env.NODE_ENV !== 'production') {
  localPhotoStorage = new LocalPhotoStorage(
    process.env.PHOTO_STORAGE_DIR ?? '.local-photo-storage',
    env.APP_BASE_URL ?? `http://localhost:${env.PORT}`,
    env.SESSION_SECRET ?? randomBytes(32).toString('hex'),
  );
  providers.photoStorage = localPhotoStorage;
}
const services = createApplicationServices(providers);
const app = createApp(services, { localPhotoStorage });
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'MJ Creative Art backend started');
});

let stopping = false;
let workerLoop: Promise<void> | undefined;

if (env.NODE_ENV !== 'production' && process.env.PHOTO_WORKER_ENABLED === 'true' && localPhotoStorage) {
  const jobs = new JobService(db);
  const workers = [
    new JobWorker(jobs, new ProcessPhotoAssetsHandler(new SharpImageProcessor(localPhotoStorage), localPhotoStorage)),
    new JobWorker(jobs, new CleanupPhotoAssetsHandler(localPhotoStorage)),
    new JobWorker(jobs, new ReconcilePhotoAssetHandler(localPhotoStorage, jobs)),
  ];
  logger.info({ workerTypes: ['PROCESS_PHOTO_ASSETS', 'CLEANUP_PHOTO_ASSETS', 'RECONCILE_PHOTO_ASSET'] }, 'Local photo asset workers enabled');

  const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  workerLoop = (async () => {
    while (!stopping) {
      try {
        const worked = await Promise.all(workers.map((worker) => worker.runOne()));
        if (!worked.some(Boolean) && !stopping) await sleep(1000);
      } catch (error) {
        logger.error({ err: serializeError(error) }, 'Photo worker poll failed');
        if (!stopping) await sleep(1000);
      }
    }
  })();
}

let shutdownStarted = false;
const shutdown = (signal: NodeJS.Signals) => {
  if (shutdownStarted) return;
  shutdownStarted = true;
  stopping = true;
  logger.info({ signal }, 'Graceful shutdown requested');

  server.close((error) => {
    void (async () => {
      if (workerLoop) await workerLoop;
      await db.end();
      if (error) {
        logger.error({ err: serializeError(error) }, 'HTTP server failed to close cleanly');
        process.exitCode = 1;
        return;
      }
      logger.info({ signal }, 'MJ Creative Art backend stopped cleanly');
    })().catch((shutdownError: unknown) => {
      logger.error({ err: serializeError(shutdownError) }, 'Graceful shutdown failed');
      process.exitCode = 1;
    });
  });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
