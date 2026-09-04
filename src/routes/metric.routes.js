import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/metric.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', c.listMetrics);
router.get('/latest', c.getLatestMetric);
router.put('/', validate(c.upsertMetricSchema), c.upsertMetric);
router.delete('/:id', c.deleteMetric);

export default router;
