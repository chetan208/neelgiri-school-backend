import {prisma} from '../../lib/prisma.ts'


const updateSchoolStats = async (req, res) => {
  try {
    // Ab 'req.body' ek array hai: [{id, iconName, statValue, statLabel}, ...]
    const statsArray = req.body.stats; 

    if (!Array.isArray(statsArray)) {
      return res.status(400).json({ error: "Expected an array of stats." });
    }

    // Promise.all use karke saare updates ek saath chalayein
    const updatePromises = statsArray.map((stat) => {
      const { id, iconName, statValue, statLabel } = stat;

      return prisma.schoolStat.upsert({
        where: { id: parseInt(id) },
        update: {
          iconName,
          statValue,
          statLabel,
        },
        create: {
          id: parseInt(id),
          iconName,
          statValue,
          statLabel,
        },
      });
    });

    const results = await Promise.all(updatePromises);

    return res.status(200).json({ success: true, data: results });

  } catch (error) {
    console.error("Error updating stats in bulk:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

const getSchoolStats = async (req, res) => {
  try {
    const stats = await prisma.schoolStat.findMany({
      orderBy: { id: 'asc' } // Sahi order mein data lene ke liye
    });

    // Data ko frontend format mein map karna
    const formattedStats = stats.map((stat) => ({
      id: stat.id,
      icon: stat.iconName, // Frontend par isse component map karenge
      statValue: stat.statValue,
      statLabel: stat.statLabel
    }));

    return res.status(200).json(formattedStats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};


export { updateSchoolStats, getSchoolStats }