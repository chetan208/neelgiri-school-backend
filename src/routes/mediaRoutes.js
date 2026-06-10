import {Router} from 'express';
import { deleteMedia, getCategories, getMediaByPage, uploadMedia } from '../controllers/mediaControllers.js';
import upload from '../../config/upload.js';

const router = Router();

router.post('/upload', upload.array('images', 25), uploadMedia);

router.post('/delete', deleteMedia);

router.get('/', getMediaByPage);

router.get('/categories', getCategories);

export default router;