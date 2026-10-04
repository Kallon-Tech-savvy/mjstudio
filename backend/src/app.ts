import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { logger } from './logging/logger.js';
import { requireTrustedOrigin } from './middleware/authentication.js';
import { UnsupportedMediaTypeError } from './errors.js';
import { NotFoundError } from './errors.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { studioRouter } from './routes/studio.js';
import { clientsRouter } from './routes/clients.js';
import { galleriesRouter } from './routes/galleries.js';
import { photosRouter } from './routes/photos.js';
import { recommendationsRouter } from './routes/recommendations.js';
import { clientRouter } from './routes/client.js';
import { unavailableServices, type ApplicationServices } from './services/container.js';

export function createApp(
  services: ApplicationServices = unavailableServices(),
  options: { allowedOrigins?: string[] } = {},
): Express {
  const app = express();
  const allowedOrigins = options.allowedOrigins ?? env.FRONTEND_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);

  app.use(requestIdMiddleware);
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      logger.info({
        requestId: String(req.id ?? 'unknown'),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      }, 'request completed');
    });
    next();
  });
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'self'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) callback(null, origin || false);
      else callback(new Error('CORS origin is not allowed.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  }));
  app.use(express.json({ limit: '1mb', type: 'application/json' }));
  app.use(cookieParser());
  app.use((req, _res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.headers['content-type'] && !req.is('application/json')) {
      next(new UnsupportedMediaTypeError());
      return;
    }
    next();
  });
  app.use(requireTrustedOrigin(allowedOrigins));

  app.get('/api', (_req, res) => {
    res.json({ data: { name: 'MJ Creative Art API', status: 'ready' } });
  });

  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter(services));
  app.use('/api/studio', studioRouter(services));
  app.use('/api/clients', clientsRouter(services));
  app.use('/api/galleries', galleriesRouter(services));
  app.use('/api', photosRouter(services));
  app.use('/api', recommendationsRouter(services));
  app.use('/api/client', clientRouter(services));

  app.use('/api', (req, _res, next) => next(new NotFoundError('ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} not found.`)));
  app.use(errorHandler);

  return app;
}
