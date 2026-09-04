import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/goal.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', c.listGoals);
router.post('/', validate(c.createGoalSchema), c.createGoal);
router.post('/sync', c.syncGoals);
router.get('/:id', c.getGoal);
router.patch('/:id', validate(c.updateGoalSchema), c.updateGoal);
router.delete('/:id', c.deleteGoal);
router.post('/:id/checkpoints', validate(c.checkpointSchema), c.addCheckpoint);
router.delete('/:id/checkpoints/:checkpointId', c.deleteCheckpoint);

export default router;
