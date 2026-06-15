import express from "express";
import { 
  getAllStationFees, 
  setStationFee, 
  getStudentsByStation 
} from "../../controllers/transportController.js";
import { checkOwnerMiddleware } from "../../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/fees", checkOwnerMiddleware, getAllStationFees);
router.put("/fees/:station", checkOwnerMiddleware, setStationFee);
router.get("/students", checkOwnerMiddleware, getStudentsByStation);

export default router;
