import express from "express";
import { createOrUpdateClassWithFees, getClasses, saveClassMonthlyFee, getClassMonthlyFees, getClassFees } from "../../controllers/erp/classController.js";
import { checkOwnerMiddleware } from "../../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/classes/fees", checkOwnerMiddleware, createOrUpdateClassWithFees);
router.get("/classes/fees", checkOwnerMiddleware, getClassFees);
router.get("/classes", checkOwnerMiddleware, getClasses);

router.post("/classes/monthly-fees", checkOwnerMiddleware, saveClassMonthlyFee);
router.get("/classes/monthly-fees", checkOwnerMiddleware, getClassMonthlyFees);

export default router;
