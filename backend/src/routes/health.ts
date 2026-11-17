import { Router } from 'express';
import { successEnvelope } from '../utils/response.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json(successEnvelope({ status: 'ok', service: 'riven-backend' }));
});

export { router as healthRouter };
