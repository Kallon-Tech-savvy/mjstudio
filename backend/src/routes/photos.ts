import { Router } from 'express';
import { z } from 'zod';
import { requirePhotographerAuth, type AuthenticatedRequest } from '../middleware/authentication.js';
import type { ApplicationServices } from '../services/container.js';
import { collectionEnvelope, successEnvelope } from '../utils/response.js';
import { galleryParamSchema, paginationSchema, parseInput, photoParamSchema, requireJsonBody } from '../http/validation.js';

const createSchema = z.object({ filename: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(1).max(150) }).strict();
const updateSchema = z.object({ filename: z.string().trim().min(1).max(255) }).strict();
const reorderSchema = z.object({ photoIds: z.array(z.string().uuid()).min(1).max(500) }).strict();

export function photosRouter(services: ApplicationServices) {
  const router = Router();
  const auth = requirePhotographerAuth(services);
  router.post('/galleries/:galleryId/photos', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); requireJsonBody(req.body); const input = parseInput(createSchema, req.body, 'INVALID_PHOTO_DATA'); res.status(201).json(successEnvelope(await services.photos.create(req.user!, galleryId, input))); }
    catch (error) { next(error); }
  });
  router.get('/galleries/:galleryId/photos', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); const page = parseInput(paginationSchema, req.query); const currentPage = page.page ?? 1; const limit = page.limit ?? 20; const result = await services.photos.list(req.user!, galleryId, currentPage, limit); res.json({ ...collectionEnvelope(result.items), meta: { count: result.items.length, total: result.total, page: currentPage, limit } }); }
    catch (error) { next(error); }
  });
  router.put('/galleries/:galleryId/photos/reorder', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); requireJsonBody(req.body); const { photoIds } = parseInput(reorderSchema, req.body, 'INVALID_PHOTO_ORDER'); res.json(successEnvelope({ photoIds: await services.photos.reorder(req.user!, galleryId, photoIds) })); }
    catch (error) { next(error); }
  });
  router.get('/photos/:photoId', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { photoId } = parseInput(photoParamSchema, req.params); const galleryId = await services.photos.resolveGalleryId(req.user!, photoId); res.json(successEnvelope(await services.photos.get(req.user!, galleryId, photoId))); }
    catch (error) { next(error); }
  });
  router.patch('/photos/:photoId', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { photoId } = parseInput(photoParamSchema, req.params); requireJsonBody(req.body); const input = parseInput(updateSchema, req.body, 'INVALID_PHOTO_DATA'); const galleryId = await services.photos.resolveGalleryId(req.user!, photoId); res.json(successEnvelope(await services.photos.update(req.user!, galleryId, photoId, input))); }
    catch (error) { next(error); }
  });
  router.delete('/photos/:photoId', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { photoId } = parseInput(photoParamSchema, req.params); const galleryId = await services.photos.resolveGalleryId(req.user!, photoId); await services.photos.delete(req.user!, galleryId, photoId); res.status(204).send(); }
    catch (error) { next(error); }
  });
  router.post('/photos/:photoId/upload-complete', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { photoId } = parseInput(photoParamSchema, req.params); const galleryId = await services.photos.resolveGalleryId(req.user!, photoId); res.json(successEnvelope(await services.photos.uploadComplete(req.user!, galleryId, photoId))); }
    catch (error) { next(error); }
  });
  return router;
}