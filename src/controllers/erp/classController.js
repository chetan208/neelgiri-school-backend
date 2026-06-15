import { prisma } from "../../../lib/prisma.ts";

const createOrUpdateClassWithFees = async (req, res) => {
    try {
        const { 
            className, 
            admissionFee, 
            tuitionFee, 
            examFee, 
            computerFee,
            ptmFine,
            buildingFund,
            annualCharges,
            tieBeltBooks
        } = req.body;

        if (!className) {
            return res.status(400).json({ 
                success: false, 
                message: "Class name is required" 
            });
        }

        const resultClass = await prisma.class.upsert({
            where: { 
                className: className 
            },
            update: {
                admissionFee: admissionFee,
                tuitionFee: tuitionFee,
                examFee: examFee,
                computerFee: computerFee,
                ptmFine: ptmFine,
                buildingFund: buildingFund,
                annualCharges: annualCharges,
                tieBeltBooks: tieBeltBooks
            },
            create: {
                className: className,
                admissionFee: admissionFee,
                tuitionFee: tuitionFee,
                examFee: examFee,
                computerFee: computerFee,
                ptmFine: ptmFine,
                buildingFund: buildingFund,
                annualCharges: annualCharges,
                tieBeltBooks: tieBeltBooks
            }
        });

        return res.status(200).json({
            success: true,
            message: "Class and fees processed successfully (Created/Updated)",
            data: resultClass
        });

    } catch (error) {
        console.error("Error in createOrUpdateClassWithFees:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Internal server error", 
            error: error.message 
        });
    }
};

const getClasses = async (req, res) => {
  try {
    const classes = await prisma.class.findMany({
      orderBy: { className: 'asc' }
    });
    return res.status(200).json({ success: true, classes });
    
  } catch (error) {
    console.error("Error in getClasses:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const getClassFees = async (req, res) => {
    try {
        const { className } = req.query;
        if (!className) {
            return res.status(400).json({ success: false, message: "Class name is required" });
        }
        const cls = await prisma.class.findUnique({
            where: { className }
        });
        return res.status(200).json({ success: true, data: cls || {} });
    } catch (error) {
        console.error("Error in getClassFees:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const saveClassMonthlyFee = async (req, res) => {
    try {
        const { 
            className, 
            monthName,
            admissionFee, 
            tuitionFee, 
            examFee, 
            computerFee,
            tieBeltBooks,
            ptmFine,
            buildingFund,
            annualCharges
        } = req.body;

        if (!className || !monthName) {
            return res.status(400).json({ 
                success: false, 
                message: "Class name and month name are required" 
            });
        }

        const result = await prisma.classMonthlyFee.upsert({
            where: { 
                className_monthName: {
                    className: className,
                    monthName: monthName
                }
            },
            update: {
                admissionFee: parseFloat(admissionFee ?? 0),
                tuitionFee: parseFloat(tuitionFee ?? 0),
                examFee: parseFloat(examFee ?? 0),
                computerFee: parseFloat(computerFee ?? 0),
                tieBeltBooks: parseFloat(tieBeltBooks ?? 0),
                ptmFine: parseFloat(ptmFine ?? 0),
                buildingFund: parseFloat(buildingFund ?? 0),
                annualCharges: parseFloat(annualCharges ?? 0)
            },
            create: {
                className: className,
                monthName: monthName,
                admissionFee: parseFloat(admissionFee ?? 0),
                tuitionFee: parseFloat(tuitionFee ?? 0),
                examFee: parseFloat(examFee ?? 0),
                computerFee: parseFloat(computerFee ?? 0),
                tieBeltBooks: parseFloat(tieBeltBooks ?? 0),
                ptmFine: parseFloat(ptmFine ?? 0),
                buildingFund: parseFloat(buildingFund ?? 0),
                annualCharges: parseFloat(annualCharges ?? 0)
            }
        });

        return res.status(200).json({
            success: true,
            message: "Monthly class fee saved successfully",
            data: result
        });

    } catch (error) {
        console.error("Error in saveClassMonthlyFee:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Internal server error", 
            error: error.message 
        });
    }
};

const getClassMonthlyFees = async (req, res) => {
  try {
    const { className, monthName } = req.query;
    const where = {};
    if (className) {
      where.className = className;
    }
    if (monthName) {
      where.monthName = monthName;
    }
    
    const fees = await prisma.classMonthlyFee.findMany({
      where,
      orderBy: { monthName: 'asc' }
    });
    return res.status(200).json({ success: true, fees });
    
  } catch (error) {
    console.error("Error in getClassMonthlyFees:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export { createOrUpdateClassWithFees, getClasses, saveClassMonthlyFee, getClassMonthlyFees, getClassFees };
