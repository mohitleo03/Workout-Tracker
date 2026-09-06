import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as c from '../controllers/stats.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/overview', c.getOverview);
router.get('/volume', c.getVolumeTrend);
router.get('/muscle-split', c.getMuscleSplit);
router.get('/progress', c.getProgress);
router.get('/records', c.getPersonalRecords);
router.get('/exercise/:exerciseId', c.getExerciseProgress);

export default router;
