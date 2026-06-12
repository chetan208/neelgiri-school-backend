import {Router} from 'express';
import { deleteMedia, getCategories, getMediaByPage, uploadMedia } from '../controllers/mediaControllers.js';
import upload from '../../config/upload.js';
import { checkAdminMiddleware } from '../middlewares/authMiddleware.js';

const router = Router();

router.post('/upload', checkAdminMiddleware, upload.array('images', 25), uploadMedia);

router.post('/delete', checkAdminMiddleware, deleteMedia);

router.get('/', getMediaByPage);

router.get('/categories', getCategories);

export default router;