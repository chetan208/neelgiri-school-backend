import express from "express";
import { 
  addStudent, 
  getStudents, 
  getStudentFees, 
  getFeeStats, 
  getIncomeAnalysis,
  getNextRollNo,
  updateStudentFeeStructure,
  updateStudent,
  deleteStudent,
  promoteStudent
} from "../../controllers/erp/studentController.js";
import { checkOwnerMiddleware } from "../../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/student", checkOwnerMiddleware, addStudent);
router.get("/students", checkOwnerMiddleware, getStudents);
router.get("/students/next-roll-no", checkOwnerMiddleware, getNextRollNo);
router.get("/students/:studentId/fees", checkOwnerMiddleware, getStudentFees);
router.get("/fees/stats", checkOwnerMiddleware, getFeeStats);
router.get("/fees/income-analysis", checkOwnerMiddleware, getIncomeAnalysis);
router.put("/students/fees/:feeId", checkOwnerMiddleware, updateStudentFeeStructure);
router.put("/students/:studentId", checkOwnerMiddleware, updateStudent);
router.delete("/students/:studentId", checkOwnerMiddleware, deleteStudent);
router.post("/students/:studentId/promote", checkOwnerMiddleware, promoteStudent);

export default router;
