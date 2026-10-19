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

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'MJ Creative Art backend started');
});


if (env.NODE_ENV !== 'production' && process.env.PHOTO_WORKER_ENABLED === 'true' && localPhotoStorage) {
  const jobs = new JobService(db);
  const workers = [
    new JobWorker(jobs, new ProcessPhotoAssetsHandler(new SharpImageProcessor(localPhotoStorage), localPhotoStorage)),
    new JobWorker(jobs, new CleanupPhotoAssetsHandler(localPhotoStorage)),
    new JobWorker(jobs, new ReconcilePhotoAssetHandler(localPhotoStorage)),
  ];
  logger.info({ workerTypes: ['PROCESS_PHOTO_ASSETS', 'CLEANUP_PHOTO_ASSETS', 'RECONCILE_PHOTO_ASSET'] }, 'Local photo asset workers enabled');

  const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const poll = async () => {
    while (true) {
      try {
        const worked = await Promise.all(workers.map((worker) => worker.runOne()));
        if (!worked.some(Boolean)) await sleep(1000);
      } catch (error) {
        logger.error({ err: serializeError(error) }, 'Photo worker poll failed');
        await sleep(1000);
      }
    }
  };
  void poll();
}
