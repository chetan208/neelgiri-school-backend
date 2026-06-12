import { Router } from 'express';
import { getEvents, addEvent, deleteEvent } from '../controllers/calendarControllers.js';
import { checkAdminMiddleware } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/', getEvents);
router.post('/add', checkAdminMiddleware, addEvent);
router.delete('/:id', checkAdminMiddleware, deleteEvent);

export default router;
