import {Router} from 'express';
import { addTeacher, completeProfile, getmyProfile, getTeachers, TeacherSingup, varifyOtp } from '../controllers/teachersControllers.js';
import { checkAuthMiddleware } from '../middlewares/authMiddleware.js';
import upload from '../../config/upload.js';
import { forgotPassword, resetPassword, TeacherLogin } from '../controllers/authControllers.js';



const router = Router();


router.post('/', TeacherSingup);

router.post('/add-teacher', addTeacher);

router.post('/verify-otp', varifyOtp);

router.post('/complete-profile',checkAuthMiddleware, upload.single('image'),  completeProfile);

router.get('/my-profile', checkAuthMiddleware, getmyProfile);

router.get('/', getTeachers);

router.post('/login', TeacherLogin);

router.post('/forgot-password', forgotPassword);

router.post('/reset-password', resetPassword);

export default router;