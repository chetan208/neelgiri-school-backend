import express from "express";
import studentRoutes from "./erp/studentRoutes.js";
import classRoutes from "./erp/classRoutes.js";
import sessionRoutes from "./erp/sessionRoutes.js";
import stationRoutes from "./erp/stationRoutes.js";
import paymentRoutes from "./erp/paymentRoutes.js";
import transportRoutes from "./erp/transportRoutes.js";
import feeAutomationRoutes from "./erp/feeAutomationRoutes.js";

const router = express.Router();

router.use("/", studentRoutes);
router.use("/", classRoutes);
router.use("/", sessionRoutes);
router.use("/", stationRoutes);
router.use("/", paymentRoutes);
router.use("/transport", transportRoutes);
router.use("/fee-automation", feeAutomationRoutes);

export default router;
