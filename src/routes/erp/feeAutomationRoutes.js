import express from "express";
import { prisma } from "../../../lib/prisma.ts";
import { checkOwnerMiddleware } from "../../middlewares/authMiddleware.js";
import { runFeeAutomation } from "../../services/feeAutomationCron.js";

const router = express.Router();

let isManualAutomationRunning = false;

router.get("/settings", async (req, res) => {
  try {
    let settings = await prisma.feeAutomationSetting.findUnique({
      where: { id: "singleton" }
    });

    if (!settings) {
      settings = await prisma.feeAutomationSetting.create({
        data: {
          id: "singleton",
          isEnabled: false,
          startDay: 1,
          windowDays: 3
        }
      });
    }

    res.status(200).json({ success: true, settings });
  } catch (error) {
    console.error("Error fetching automation settings:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.put("/settings", checkOwnerMiddleware, async (req, res) => {
  try {
    const { isEnabled, startDay, windowDays } = req.body;

    const settings = await prisma.feeAutomationSetting.upsert({
      where: { id: "singleton" },
      update: {
        isEnabled,
        startDay: parseInt(startDay) || 1,
        windowDays: parseInt(windowDays) || 3
      },
      create: {
        id: "singleton",
        isEnabled,
        startDay: parseInt(startDay) || 1,
        windowDays: parseInt(windowDays) || 3
      }
    });

    res.status(200).json({ success: true, settings });
  } catch (error) {
    console.error("Error updating automation settings:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/logs", checkOwnerMiddleware, async (req, res) => {
  try {
    const rawLogs = await prisma.feeAutomationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200
    });

    const studentIds = rawLogs.map(l => l.studentId);
    
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: { studentclass: true }
    });

    const studentMap = {};
    for (const st of students) {
      studentMap[st.id] = st;
    }

    const logs = rawLogs.map(log => ({
      ...log,
      student: studentMap[log.studentId] || null
    }));

    res.status(200).json({ success: true, logs });
  } catch (error) {
    console.error("Error fetching automation logs:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/trigger", checkOwnerMiddleware, async (req, res) => {
  try {
    if (isManualAutomationRunning) {
      return res.status(400).json({ 
        success: false, 
        message: "Manual fee automation is already running in the background." 
      });
    }

    isManualAutomationRunning = true;

    // Execute the automation asynchronously in the background
    (async () => {
      try {
        console.log("=== Manually Triggered Fee Automation Starting ===");
        await runFeeAutomation(true); // ignoreWindow = true
      } catch (err) {
        console.error("Error running manual fee automation:", err);
      } finally {
        isManualAutomationRunning = false;
        console.log("=== Manually Triggered Fee Automation Finished ===");
      }
    })();

    res.status(200).json({ 
      success: true, 
      message: "Fee automation triggered successfully. It will run in the background." 
    });
  } catch (error) {
    console.error("Error triggering manual fee automation:", error);
    isManualAutomationRunning = false;
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/status", checkOwnerMiddleware, (req, res) => {
  res.status(200).json({ success: true, isRunning: isManualAutomationRunning });
});

export default router;
