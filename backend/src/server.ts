import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './logging/logger.js';
import { db, testDatabaseConnection } from './db/client.js';
import { serializeError } from './logging/serialize-error.js';
import {
  createApplicationServices,
  developmentAccessDelivery,
  unavailableProviders,
} from './services/container.js';
import { LocalDevelopmentPhotoStorage } from './infrastructure/local-photo-storage.js';
import { CleanupPhotoAssetsHandler, ProcessPhotoAssetsHandler, ReconcilePhotoAssetHandler } from './services/job-handlers.js';
import { JobWorker } from './services/job-service.js';

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
const localPhotoStorage = env.NODE_ENV === 'development'
  ? new LocalDevelopmentPhotoStorage(
    resolve(dirname(fileURLToPath(import.meta.url)), '..', '.local-photo-storage'),
    (env.APP_BASE_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, ''),
  )
  : null;

if (env.NODE_ENV === 'development') {
  providers.accessDelivery = developmentAccessDelivery();
  if (localPhotoStorage) providers.photoStorage = localPhotoStorage;
}

const services = createApplicationServices(providers);
const app = createApp(services, {
  localPhotoStorage: localPhotoStorage ?? undefined,
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'MJ Creative Art backend started');
});

if (localPhotoStorage) {
  const workers = [
    new JobWorker(services.jobs, new ProcessPhotoAssetsHandler(localPhotoStorage, localPhotoStorage)),
    new JobWorker(services.jobs, new CleanupPhotoAssetsHandler(localPhotoStorage)),
    new JobWorker(services.jobs, new ReconcilePhotoAssetHandler(localPhotoStorage)),
  ];
  const pollLocalPhotoJobs = async () => {
    try {
      await Promise.all(workers.map((worker) => worker.runOne()));
    } catch (error) {
      logger.error({ err: serializeError(error) }, 'Local photo processing worker failed');
    } finally {
      const timer = setTimeout(pollLocalPhotoJobs, 1000);
      timer.unref();
    }
  };
  void pollLocalPhotoJobs();
}
