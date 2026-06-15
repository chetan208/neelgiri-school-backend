import express from "express";
import { 
  addStudent, 
  getStudents, 
  getStudentFees, 
  getFeeStats,
  updateStudentFeeStructure
} from "../../controllers/erp/studentController.js";
import { checkOwnerMiddleware } from "../../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/student", checkOwnerMiddleware, addStudent);
router.get("/students", checkOwnerMiddleware, getStudents);
router.get("/students/:studentId/fees", checkOwnerMiddleware, getStudentFees);
router.get("/fees/stats", checkOwnerMiddleware, getFeeStats);
router.put("/students/fees/:feeId", checkOwnerMiddleware, updateStudentFeeStructure);

export default router;
