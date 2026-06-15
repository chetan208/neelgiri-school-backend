import express from "express";
import { makePayment, getPublicReceipt } from "../../controllers/erp/paymentController.js";
import { checkOwnerMiddleware } from "../../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/make-payment", checkOwnerMiddleware, makePayment);
router.get("/receipt/public/:feeStructureId", getPublicReceipt);

export default router;
