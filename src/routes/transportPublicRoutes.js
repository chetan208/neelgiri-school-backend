import express from "express";
import { prisma } from "../../lib/prisma.ts";

const router = express.Router();

router.get("/stations", async (req, res) => {
  try {
    const stations = await prisma.transportFee.findMany({
      orderBy: { station: 'asc' },
    });
    return res.status(200).json({ success: true, stations });
  } catch (error) {
    console.error("Error in public getStations:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
