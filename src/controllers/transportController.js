import { prisma } from "../../lib/prisma.ts";

// STATIONS are now fetched dynamically from the database.

// GET /api/transport/fees
const getAllStationFees = async (req, res) => {
  try {
    const existing = await prisma.transportFee.findMany({
      orderBy: { station: 'asc' }
    });
    
    const result = existing.map(f => ({
      station: f.station,
      amount: Number(f.amount)
    }));

    return res.status(200).json({ stationFees: result });
  } catch (error) {
    console.error("Error fetching station fees:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// PUT /api/transport/fees/:station
const setStationFee = async (req, res) => {
  try {
    const { station } = req.params;
    const { amount } = req.body;

    if (!station || typeof station !== 'string') {
      return res.status(400).json({ message: "Invalid station name" });
    }
    if (amount === undefined || isNaN(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const fee = await prisma.transportFee.upsert({
      where: { station },
      update: { amount: Number(amount) },
      create: { station, amount: Number(amount) }
    });

    return res.status(200).json({ message: "Station fee updated", fee });
  } catch (error) {
    console.error("Error setting station fee:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/transport/students
const getStudentsByStation = async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      select: { id: true, name: true,  cardNo: true, station: true },
      
    });

    const stationsDB = await prisma.transportFee.findMany({ select: { station: true } });
    
    const grouped = {};
    for (const st of stationsDB) {
        grouped[st.station] = [];
    }
    grouped["No Station"] = [];

    for (const s of students) {
      if (s.station && grouped[s.station]) {
        grouped[s.station].push(s);
      } else if (s.station && !grouped[s.station]) {
        // Fallback for students with a station not in transportFee
        grouped[s.station] = [s];
      } else {
        grouped["No Station"].push(s);
      }
    }

    return res.status(200).json({ grouped });
  } catch (error) {
    console.error("Error fetching students by station:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export { getAllStationFees, setStationFee, getStudentsByStation };
