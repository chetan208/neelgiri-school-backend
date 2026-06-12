import express from "express";
import { 
  getTopResults, 
  createTopResult, 
  updateTopResult, 
  deleteTopResult 
} from "../controllers/topResultsControllers.js";
import upload from "../../config/upload.js";

const router = express.Router();

router.get("/", getTopResults);
router.post("/", upload.single("image"), createTopResult);
router.put("/:id", upload.single("image"), updateTopResult);
router.delete("/:id", deleteTopResult);

export default router;
