import { Router } from 'express';
import authRoutes from './auth.routes.js';
import exerciseRoutes from './exercise.routes.js';
import planRoutes from './plan.routes.js';
import sessionRoutes from './session.routes.js';
import foodRoutes from './food.routes.js';
import dietRoutes from './diet.routes.js';
import goalRoutes from './goal.routes.js';
import metricRoutes from './metric.routes.js';
import statsRoutes from './stats.routes.js';

const router = Router();

router.get('/health', (_req, res) =>
  res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } })
);

router.use('/auth', authRoutes);
router.use('/exercises', exerciseRoutes);
router.use('/plans', planRoutes);
router.use('/sessions', sessionRoutes);
router.use('/foods', foodRoutes);
router.use('/diet', dietRoutes);
router.use('/goals', goalRoutes);
router.use('/metrics', metricRoutes);
router.use('/stats', statsRoutes);

export default router;
