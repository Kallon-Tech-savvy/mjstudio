import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './logging/logger.js';
import { db } from './db/client.js';
import { createApplicationServices, unavailableProviders } from './services/container.js';

if (!env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to start the API server.');
}

const services = createApplicationServices(unavailableProviders(db));
const app = createApp(services);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'MJ Creative Art backend started');
});
