import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/session.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', validate(c.listQuerySchema, 'query'), c.listSessions);
router.get('/active', c.getActiveSession);
router.post('/start', validate(c.startSessionSchema), c.startSession);
router.get('/last-performance/:exerciseId', c.getLastPerformance);

router.get('/:id', c.getSession);
router.delete('/:id', c.deleteSession);
router.post('/:id/finish', validate(c.finishSessionSchema), c.finishSession);

// The warm-up is one block, not a tap per drill.
router.post('/:id/warmup/start', c.startWarmup);
router.post('/:id/warmup/complete', validate(c.completeWarmupSchema), c.completeWarmup);
router.post('/:id/warmup/cancel', c.cancelWarmup);

router.post('/:id/entries', validate(c.addEntrySchema), c.addEntry);
router.patch('/:id/entries/:entryId', c.updateEntry);
router.delete('/:id/entries/:entryId', c.removeEntry);

router.post('/:id/entries/:entryId/sets', validate(c.setInputSchema), c.addSet);
router.patch('/:id/entries/:entryId/sets/:setId', c.updateSet);
router.delete('/:id/entries/:entryId/sets/:setId', c.deleteSet);
router.post('/:id/entries/:entryId/sets/:setId/rest', c.recordRest);

export default router;
