import express from "express";
import { 
    getStations,
    addStation,
    editStation

 } from "../../controllers/erp/stationController.js";
import { checkOwnerMiddleware } from "../../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/stations", checkOwnerMiddleware, getStations);

router.post("/stations", checkOwnerMiddleware, addStation);

router.put("/stations/:id", checkOwnerMiddleware, editStation);

export default router;
