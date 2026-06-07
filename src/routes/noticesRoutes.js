import {Router} from 'express';
import { createNotice, deleteNotice, getNotices, updateNotice } from '../controllers/noticesContorllers.js';
import upload from '../../config/upload.js'
import { checkAdminMiddleware } from '../middlewares/authMiddleware.js';

const router = Router();


router.get('/', getNotices);
router.post('/create-notice', checkAdminMiddleware, upload.single('document'), createNotice);

router.put('/:id', checkAdminMiddleware, upload.single('document'), updateNotice);

router.delete('/:id', checkAdminMiddleware, deleteNotice);


export default router;