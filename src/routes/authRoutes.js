import {Router}  from 'express'
import { checkAuthMiddleware, checkOwnerMiddleware } from '../middlewares/authMiddleware.js';
import { getmydetails, logout } from '../controllers/authControllers.js';

const router = Router();

router.get('/me',checkAuthMiddleware , getmydetails);

router.post('/logout', checkAuthMiddleware, logout);



export default router;