import { Router } from 'express';
import { successEnvelope } from '../utils/response.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json(successEnvelope({ status: 'ok', service: 'mj-shoot-it-backend' }));
});

export { router as healthRouter };
