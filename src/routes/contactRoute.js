import {Router} from 'express';
import {contactus,deleteContactUsMessage,getContactUsMessages} from  '../controllers/contactusControllers.js'
import { checkAdminMiddleware } from '../middlewares/authMiddleware.js';
const router = Router();

router.post('/', contactus);
router.get('/', checkAdminMiddleware, getContactUsMessages);
router.delete('/', checkAdminMiddleware, deleteContactUsMessage);

export default router;