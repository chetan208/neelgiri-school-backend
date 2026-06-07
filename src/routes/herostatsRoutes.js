import {Router} from 'express';
import { getSchoolStats, updateSchoolStats } from '../controllers/herostatControllers.js';

const router = Router();

router.get('/', getSchoolStats);
router.post('/', updateSchoolStats);

export default router;