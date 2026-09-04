import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/exercise.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', validate(c.searchQuerySchema, 'query'), c.searchExercises);
router.get('/filters', c.getFilters);
router.post('/', validate(c.createExerciseSchema), c.createExercise);
router.get('/:id', c.getExercise);
router.patch('/:id', validate(c.updateExerciseSchema), c.updateExercise);
router.delete('/:id', c.deleteExercise);

export default router;
