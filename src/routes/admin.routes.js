import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/admin.controller.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/users', c.listUsers);
router.post('/users/:id/activate', validate(c.daysSchema), c.activateUser);
router.post('/users/:id/extend', validate(c.daysSchema), c.extendUser);
router.post('/users/:id/deactivate', c.deactivateUser);

export default router;
