import { Router } from 'express';
import { requirePhotographerAuth, type AuthenticatedRequest } from '../middleware/authentication.js';
import type { ApplicationServices } from '../services/container.js';
import { collectionEnvelope, successEnvelope } from '../utils/response.js';
import { galleryParamSchema, parseInput, photoParamSchema } from '../http/validation.js';

export function recommendationsRouter(services: ApplicationServices) {
  const router = Router();
  const auth = requirePhotographerAuth(services);
  router.put('/galleries/:galleryId/recommendations/:photoId', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); const { photoId } = parseInput(photoParamSchema, req.params); res.json(successEnvelope(await services.recommendations.recommend(req.user!, galleryId, photoId))); }
    catch (error) { next(error); }
  });
  router.delete('/galleries/:galleryId/recommendations/:photoId', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); const { photoId } = parseInput(photoParamSchema, req.params); res.status(200).json(successEnvelope(await services.recommendations.unrecommend(req.user!, galleryId, photoId))); }
    catch (error) { next(error); }
  });
  router.get('/galleries/:galleryId/recommendations', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); res.json(collectionEnvelope(await services.recommendations.list(req.user!, galleryId))); }
    catch (error) { next(error); }
  });
  return router;
}