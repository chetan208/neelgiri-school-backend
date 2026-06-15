import { prisma } from "../../../lib/prisma.ts";

const getStations = async (req, res) => {
  try {
    const stations = await prisma.transportFee.findMany({
      orderBy: { station: 'asc' },
    });
    return res.status(200).json({ success: true, stations });
    
  } catch (error) {
    console.error("Error in getStations:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const editStation = async (req, res) => {
  try {
    const { id } = req.params;
    const { station, amount } = req.body;

    const updatedStation = await prisma.transportFee.update({
      where: { id },
      data: { station, amount: Number(amount) },
    });

    return res.status(200).json({ success: true, station: updatedStation });
    
  } catch (error) {
    console.error("Error in editStation:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    
  }
}

const addStation = async (req, res) => {
  try {
    const { station, amount } = req.body;
    
    if (!station) {
        return res.status(400).json({ success: false, message: "Station name is required" });
    }

    const newStation = await prisma.transportFee.create({
      data: { station, amount: Number(amount || 0) },
    });
    
    return res.status(201).json({ success: true, station: newStation });
  } catch (error) {
    console.error("Error in addStation:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
}

export { getStations, editStation, addStation };
