import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/food.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', validate(c.searchFoodQuerySchema, 'query'), c.searchFoods);
router.post('/', validate(c.createFoodSchema), c.createFood);
router.patch('/:id', validate(c.updateFoodSchema), c.updateFood);
router.delete('/:id', c.deleteFood);

export default router;
