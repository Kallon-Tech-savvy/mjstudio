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

if (env.NODE_ENV === 'development') {
  providers.accessDelivery = developmentAccessDelivery();
}

const services = createApplicationServices(providers);
const app = createApp(services);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'MJ Creative Art backend started');
});
