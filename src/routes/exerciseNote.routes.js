import { Router } from 'express';
import { requireAuth, requireActiveAccount } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/exerciseNote.controller.js';

const router = Router();
router.use(requireAuth, requireActiveAccount);

router.get('/', c.listNotes);
router.put('/:exerciseId', validate(c.saveNoteSchema), c.saveNote);

export default router;
