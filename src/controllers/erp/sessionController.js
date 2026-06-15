import { prisma } from "../../../lib/prisma.ts";

const addSession = async (req, res) => {
  try {
    const {year} = req.body;
    
    if (!year) {
      return res.status(400).json({ success: false, message: "Session year is required" });
    }
    const existingSession = await prisma.session.findUnique({
      where: { year }
    });
    
    if (existingSession) {
      return res.status(400).json({ success: false, message: "Session with this year already exists" });
    } 
    const newSession = await prisma.session.create({
      data: { year }
    });
    
    return res.status(201).json({ success: true, message: "Session created successfully", session: newSession });
    
  } catch (error) {
    console.error("Error in addsession:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const getSessions = async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { year: 'desc' }
    });
    return res.status(200).json({ success: true, sessions });
  } catch (error) {
    console.error("Error in getSessions:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export { addSession, getSessions };
