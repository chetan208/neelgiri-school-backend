import {Router} from 'express';
import { addTeacher, completeProfile, getmyProfile, getTeachers, TeacherSingup, varifyOtp, deleteTeacher, updateTeacherRole } from '../controllers/teachersControllers.js';
import { checkAuthMiddleware, checkAdminMiddleware, checkOwnerMiddleware } from '../middlewares/authMiddleware.js';
import upload from '../../config/upload.js';
import { forgotPassword, resetPassword, TeacherLogin } from '../controllers/authControllers.js';



const router = Router();


router.post('/', TeacherSingup);

router.post('/add-teacher', checkOwnerMiddleware, addTeacher);

router.post('/verify-otp', varifyOtp);

router.post('/complete-profile',checkAuthMiddleware, upload.single('image'),  completeProfile);

router.get('/my-profile', checkAuthMiddleware, getmyProfile);

router.get('/', getTeachers);

router.delete('/:email', checkOwnerMiddleware, deleteTeacher);

router.put('/update-role', checkOwnerMiddleware, updateTeacherRole);

router.post('/login', TeacherLogin);

router.post('/forgot-password', forgotPassword);

router.post('/reset-password', resetPassword);

export default router;