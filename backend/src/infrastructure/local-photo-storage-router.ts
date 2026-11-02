import express, { Router, type Request, type Response, type NextFunction } from 'express';
import { ForbiddenError, UnsupportedMediaTypeError } from '../errors.js';
import { LocalDevelopmentPhotoStorage } from './local-photo-storage.js';

export function localPhotoStorageRouter(storage: LocalDevelopmentPhotoStorage, allowedOrigins: string[]) {
  const router = Router();
  const requireConfiguredOrigin = (req: Request, _res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    if (!origin || !allowedOrigins.includes(origin)) {
      next(new ForbiddenError('Request origin is not allowed.'));
      return;
    }
    next();
  };

  router.put('/upload', requireConfiguredOrigin, express.raw({ type: 'image/*', limit: '25mb' }), async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body)) throw new UnsupportedMediaTypeError('Photo uploads must use an image content type.');
      await storage.acceptUpload(req.get('x-upload-capability'), req.get('content-type'), req.body);
      res.status(201).end();
    } catch (error) {
      next(error);
    }
  });

  router.get('/view', async (req, res, next) => {
    try {
      const { filePath, object } = await storage.resolveReadCapability(req.query.capability as string | undefined, 'view');
      res.set({
        'Cache-Control': 'private, max-age=60',
        'Content-Disposition': 'inline',
        'Content-Length': String(object.fileSize),
        'Content-Type': object.mimeType,
        'X-Content-Type-Options': 'nosniff',
      });
      res.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  });

  router.get('/download', async (req, res, next) => {
    try {
      const { filePath, object } = await storage.resolveReadCapability(req.query.capability as string | undefined, 'download');
      res.set({
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="photo.${extensionFor(object.mimeType)}"`,
        'Content-Length': String(object.fileSize),
        'Content-Type': object.mimeType,
        'X-Content-Type-Options': 'nosniff',
      });
      res.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function extensionFor(mimeType: string) {
  switch (mimeType) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/avif': return 'avif';
    case 'image/tiff': return 'tiff';
    case 'image/gif': return 'gif';
    default: return 'img';
  }
}
