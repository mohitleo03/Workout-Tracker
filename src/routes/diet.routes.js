import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/diet.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/plan', c.getDietPlan);
router.put('/plan', validate(c.upsertDietPlanSchema), c.upsertDietPlan);

router.get('/log', validate(c.dayQuerySchema, 'query'), c.getDayLog);
router.post('/log/items', validate(c.logItemSchema), c.addLogItem);
router.patch('/log/:logId/items/:itemId', c.updateLogItem);
router.post('/log/:logId/items/:itemId/toggle', c.toggleLogItem);
router.delete('/log/:logId/items/:itemId', c.deleteLogItem);
router.post('/log/water', c.setWater);

router.get('/pending', validate(c.dayQuerySchema, 'query'), c.getPendingMeals);
router.get('/summary', c.getDietSummary);

export default router;
