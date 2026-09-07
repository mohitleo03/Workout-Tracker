import { Router } from 'express';
import { requireAuth, requireActiveAccount } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/plan.controller.js';

const router = Router();
router.use(requireAuth, requireActiveAccount);

router.get('/', c.listPlans);
router.get('/active', c.getActivePlan);
router.get('/today', c.getPlanForDay);
router.post('/', validate(c.createPlanSchema), c.createPlan);
router.get('/:id', c.getPlan);
router.patch('/:id', validate(c.updatePlanSchema), c.updatePlan);
router.post('/:id/activate', c.activatePlan);
router.put('/:id/days', validate(c.upsertDaySchema), c.upsertDay);
router.delete('/:id/days/:dayOfWeek/:sequence', c.deleteDay);
router.delete('/:id', c.deletePlan);

export default router;
