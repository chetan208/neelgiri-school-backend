import {Router} from 'express';
import { uploadPYQ,deletePYQ,getPYQs } from '../controllers/PYQsControllers.js';
import upload from '../../config/upload.js';
import { checkAdminMiddleware } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/:className', getPYQs);
router.delete('/delete/:id',checkAdminMiddleware, deletePYQ);

router.post('/add/:className',checkAdminMiddleware, upload.single('file'), uploadPYQ);


export default router;