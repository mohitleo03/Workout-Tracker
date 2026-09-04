import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/plan.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', c.listPlans);
router.get('/active', c.getActivePlan);
router.get('/today', c.getPlanForDay);
router.post('/', validate(c.createPlanSchema), c.createPlan);
router.get('/:id', c.getPlan);
router.patch('/:id', validate(c.updatePlanSchema), c.updatePlan);
router.post('/:id/activate', c.activatePlan);
router.put('/:id/days', validate(c.upsertDaySchema), c.upsertDay);
router.delete('/:id', c.deletePlan);

export default router;
