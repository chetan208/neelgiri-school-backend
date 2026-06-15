import express from "express";
import { addSession, getSessions } from "../../controllers/erp/sessionController.js";
import { checkOwnerMiddleware } from "../../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/sessions", checkOwnerMiddleware, addSession);
router.get("/sessions", checkOwnerMiddleware, getSessions);

export default router;
