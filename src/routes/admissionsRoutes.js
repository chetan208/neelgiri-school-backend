import {Router} from 'express';
import { checkOwnerMiddleware } from '../middlewares/authMiddleware.js';
import { 
    openAdmissions,
    SubmitAdmissionForm,
    closeAdmissions,
    viewAdmissionRequests,
    getActiveAdmissionYear, 
    getPandingAdmissionDetails,
    getCompleteAdmissionDetails,
    updateAdmissionStatus
} from '../controllers/admissonsController.js';

const router = Router();

router.post('/open-admissions',checkOwnerMiddleware, openAdmissions);
router.post('/close-admissions',checkOwnerMiddleware, closeAdmissions);
router.post('/submit-admission-form', SubmitAdmissionForm);
router.get('/view-admissions', checkOwnerMiddleware, viewAdmissionRequests);
router.get('/active-admission-year', getActiveAdmissionYear);
router.get('/pending-admission-details', checkOwnerMiddleware, getPandingAdmissionDetails);
router.get('/complete-admission-details', checkOwnerMiddleware, getCompleteAdmissionDetails);
router.put('/update-admission-status/:id', checkOwnerMiddleware, updateAdmissionStatus);

export default router;