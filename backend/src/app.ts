import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { sanitizeForLogging } from './logging/audit.js';
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
import type { LocalPhotoStorage } from './services/local-photo-storage.js';

export function createApp(
  services: ApplicationServices = unavailableServices(),
  options: { allowedOrigins?: string[]; localPhotoStorage?: LocalPhotoStorage } = {},
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
        path: sanitizeForLogging(req.path),
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
  if (options.localPhotoStorage) {
    app.use('/api/local-photo-uploads', express.raw({ type: 'image/*', limit: '25mb' }));
  }
  app.use(express.json({ limit: '1mb', type: 'application/json' }));
  app.use(cookieParser());
  app.use((req, _res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.path.startsWith('/api/local-photo-uploads/') === false && req.headers['content-type'] && !req.is('application/json')) {
      next(new UnsupportedMediaTypeError());
      return;
    }
    next();
  });
  app.use(requireTrustedOrigin(allowedOrigins));

  if (options.localPhotoStorage) {
    app.put('/api/local-photo-uploads/:token', express.raw({ type: 'image/*', limit: '25mb' }), async (req, res, next) => {
      try {
        if (!Buffer.isBuffer(req.body)) {
          res.status(415).json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Upload must use an image content type.' } });
          return;
        }
        await options.localPhotoStorage!.acceptUpload(req.params.token, String(req.headers['content-type'] ?? ''), req.body);
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    });
    app.get('/api/local-photo-objects/:token', async (req, res, next) => {
      try {
        const object = await options.localPhotoStorage!.readCapability(req.params.token);
        if (!object) {
          res.status(404).json({ error: { code: 'PHOTO_OBJECT_NOT_FOUND', message: 'Photo object not found or capability expired.' } });
          return;
        }
        res.type(object.mimeType).set('Cache-Control', 'private, no-store');
        if (object.download) res.set('Content-Disposition', 'attachment');
        res.send(object.bytes);
      } catch (error) {
        next(error);
      }
    });
  }


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
