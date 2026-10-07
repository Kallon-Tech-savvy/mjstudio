import { Router } from 'express';
import { z } from 'zod';
import { CLIENT_COOKIE, requireClientAuth, type AuthenticatedRequest } from '../middleware/authentication.js';
import type { ApplicationServices } from '../services/container.js';
import { collectionEnvelope, successEnvelope } from '../utils/response.js';
import { galleryParamSchema, paginationSchema, parseInput, photoParamSchema, requireJsonBody } from '../http/validation.js';
import { NotFoundError } from '../errors.js';

const accessSchema = z.object({ secret: z.string().min(32).max(256), pin: z.string().regex(/^\d{6}$/) }).strict();
const selectionSchema = z.object({ selected: z.boolean() }).strict();
const feedbackSchema = z.object({ message: z.string().trim().min(1).max(5000) }).strict();

export function clientRouter(services: ApplicationServices) {
  const router = Router();
  const auth = requireClientAuth(services);

  router.post('/access/verify', async (req, res, next) => {
    try {
      requireJsonBody(req.body);
      const input = parseInput(accessSchema, req.body, 'INVALID_GALLERY_ACCESS');
      const abuseKey = req.ip || 'unknown';
      const session = await services.clientSessions.create(input.secret, input.pin, `${abuseKey}:${input.secret}`);
      res.cookie(CLIENT_COOKIE, session.sessionToken, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/client', expires: session.expiresAt });
      res.status(201).json(successEnvelope({ authenticated: true, galleryId: session.galleryId, expiresAt: session.expiresAt }));
    } catch (error) {
      if (error instanceof Error && 'code' in error && ['FORBIDDEN', 'INVALID_GALLERY_ACCESS'].includes((error as { code: string }).code)) {
        next(new NotFoundError('INVALID_GALLERY_ACCESS', 'Gallery access could not be verified.'));
        return;
      }
      next(error);
    }
  });

  router.post('/logout', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const token = req.cookies?.[CLIENT_COOKIE]; if (token) await services.clientSessions.revoke(req.client!.clientSessionId, token); res.clearCookie(CLIENT_COOKIE, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/client' }); res.status(204).send(); }
    catch (error) { next(error); }
  });

  router.get('/galleries/:galleryId', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); await services.clientSessions.assertGallery(req.client!, galleryId); res.json(successEnvelope(await services.catalog.getClientGallery(req.client!, galleryId))); }
    catch (error) { next(error); }
  });
  router.get('/galleries/:galleryId/photos/:photoId', auth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { galleryId } = parseInput(galleryParamSchema, req.params);
      const { photoId } = parseInput(photoParamSchema, req.params);
      await services.clientSessions.assertGallery(req.client!, galleryId);
      const photo = await services.catalog.getClientPhoto(req.client!, galleryId, photoId);
      res.json(successEnvelope(photo));
    } catch (error) { next(error); }
  });
  router.get('/galleries/:galleryId/selection', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); await services.clientSessions.assertGallery(req.client!, galleryId); res.json(successEnvelope(await services.selections.getSelection(req.client!))); }
    catch (error) { next(error); }
  });
  router.get('/galleries/:galleryId/photos', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); const page = parseInput(paginationSchema, req.query); const currentPage = page.page ?? 1; const limit = page.limit ?? 20; await services.clientSessions.assertGallery(req.client!, galleryId); const result = await services.catalog.listClientPhotos(req.client!, galleryId, currentPage, limit); res.json({ ...collectionEnvelope(result.items), meta: { count: result.items.length, total: result.total, page: currentPage, limit } }); }
    catch (error) { next(error); }
  });
  router.put('/galleries/:galleryId/photos/:photoId/selection', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); const { photoId } = parseInput(photoParamSchema, req.params); requireJsonBody(req.body); const { selected } = parseInput(selectionSchema, req.body, 'INVALID_SELECTION'); await services.clientSessions.assertGallery(req.client!, galleryId); res.json(successEnvelope(await services.selections.setSelection(req.client!, photoId, selected))); }
    catch (error) { next(error); }
  });
  router.post('/galleries/:galleryId/selection/submit', auth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { galleryId } = parseInput(galleryParamSchema, req.params);
      await services.clientSessions.assertGallery(req.client!, galleryId);
      res.json(successEnvelope(await services.selections.submitSelection(req.client!)));
    } catch (error) { next(error); }
  });

  router.post('/galleries/:galleryId/photos/:photoId/download', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); const { photoId } = parseInput(photoParamSchema, req.params); await services.rateLimits.assertAllowed(`download:${req.client!.clientSessionId}:${req.ip}`, 'download'); await services.clientSessions.assertGallery(req.client!, galleryId); const capability = await services.downloads.create(req.client!, photoId); res.json(successEnvelope({ download_url: capability.url, expires_at: capability.expiresAt })); }
    catch (error) { next(error); }
  });
  router.post('/galleries/:galleryId/feedback', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); requireJsonBody(req.body); const { message } = parseInput(feedbackSchema, req.body, 'INVALID_FEEDBACK'); await services.rateLimits.assertAllowed(`feedback:${req.client!.clientSessionId}:${req.ip}`, 'feedback'); await services.clientSessions.assertGallery(req.client!, galleryId); res.status(201).json(successEnvelope(await services.feedback.createGalleryFeedback(req.client!, message))); }
    catch (error) { next(error); }
  });
  router.post('/galleries/:galleryId/photos/:photoId/feedback', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); const { photoId } = parseInput(photoParamSchema, req.params); requireJsonBody(req.body); const { message } = parseInput(feedbackSchema, req.body, 'INVALID_FEEDBACK'); await services.rateLimits.assertAllowed(`feedback:${req.client!.clientSessionId}:${req.ip}`, 'feedback'); await services.clientSessions.assertGallery(req.client!, galleryId); res.status(201).json(successEnvelope(await services.feedback.createPhotoFeedback(req.client!, photoId, message))); }
    catch (error) { next(error); }
  });
  return router;
}