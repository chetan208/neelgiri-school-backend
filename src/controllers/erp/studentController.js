import fs from "fs";
import { ensureStudentFeeForMonth } from "../../services/feeService.js";
import { prisma } from "../../../lib/prisma.ts";
import { sendWhatsAppMessage } from "../../services/whatsappService.js";

const formatMonthYear = (date) => {
  const monthNames = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];
  return `${monthNames[date.getMonth()]}-${date.getFullYear()}`;
};

const addStudent = async (req, res) => {
  try {
    const { 
      name, 
      className, 
      admissionDate, 
      fatherName, 
      motherName, 
      cardNo, 
      contactNo, 
      station,
      sessionYear,
      initialAmountPaid, // Frontend se aaya shuruati deposit (e.g., 5000)
      paymentMode        // CASH ya UPI
    } = req.body;

    // 1. Validation Check
    if (!name || !className || !admissionDate || !cardNo || !contactNo || !sessionYear) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields (Name, className, admissionDate, cardNo, contactNo, sessionYear)" 
      });
    }

    // Normalize session year format (e.g., "2026-2027" -> "2026-27")
    let formattedSessionYear = sessionYear;
    if (sessionYear && sessionYear.includes("-")) {
      const parts = sessionYear.split("-");
      if (parts.length === 2 && parts[0].length === 4 && parts[1].length === 4) {
        formattedSessionYear = `${parts[0]}-${parts[1].substring(2)}`;
      }
    }

    // 2. Master Tables Check (Class and Session)
    const targetClass = await prisma.class.findUnique({ where: { className } });
    if (!targetClass) {
      return res.status(404).json({ success: false, message: `Class '${className}' not found.` });
    }

    const targetSession = await prisma.session.findUnique({ where: { year: formattedSessionYear } });
    if (!targetSession) {
      return res.status(404).json({ success: false, message: `Session '${sessionYear}' not found.` });
    }

    // 3. Transport Fee Lookup
    let busCharges = 0;
    if (station) {
      const transport = await prisma.transportFee.findUnique({ where: { station } });
      if (transport) busCharges = parseFloat(transport.amount);
    }

    // Fetch month-wise class fee configurations
    const monthlyFees = await prisma.classMonthlyFee.findMany({
      where: { className: targetClass.className }
    });

    const monthNames = [
      "January", "February", "March", "April", "May", "June", 
      "July", "August", "September", "October", "November", "December"
    ];

    // 4. Generate Months Array (Admission Month se Current Month tak)
    const startDate = new Date(admissionDate);
    const endDate = new Date(); 
    
    let currentLoopDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endLoopDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    const feeStructuresToCreate = [];

    while (currentLoopDate <= endLoopDate) {
      const monthStr = formatMonthYear(currentLoopDate);
      const monthName = monthNames[currentLoopDate.getMonth()];
      const monthlyFeeConfig = monthlyFees.find(f => f.monthName === monthName);

      const tuitionFee = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.tuitionFee) : 0) || parseFloat(targetClass.tuitionFee) || 0;
      const examFee = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.examFee) : 0) || parseFloat(targetClass.examFee) || 0;
      const computerFee = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.computerFee) : 0) || parseFloat(targetClass.computerFee) || 0;
      const admissionFee = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.admissionFee) : 0) || parseFloat(targetClass.admissionFee) || 0;
      const tieBeltBooks = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.tieBeltBooks) : 0) || parseFloat(targetClass.tieBeltBooks) || 0;
      const ptmFine = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.ptmFine) : 0) || parseFloat(targetClass.ptmFine) || 0;
      const buildingFund = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.buildingFund) : 0) || parseFloat(targetClass.buildingFund) || 0;
      const annualCharges = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.annualCharges) : 0) || parseFloat(targetClass.annualCharges) || 0;

      const currentAdmissionFee = (feeStructuresToCreate.length === 0) ? admissionFee : 0;
      const totalDemand = currentAdmissionFee + tuitionFee + examFee + computerFee + tieBeltBooks + ptmFine + buildingFund + annualCharges + busCharges;

      feeStructuresToCreate.push({
        month: monthStr,
        studentClass: targetClass.className,
        admissionFee: currentAdmissionFee,
        tuitionFee,
        examFee,
        computerFee,
        tieBeltBooks,
        ptmFine,
        buildingFund,
        annualCharges,
        schoolBusCharges: busCharges,
        total: totalDemand,
        status: "PENDING"
      });

      currentLoopDate.setMonth(currentLoopDate.getMonth() + 1);
    }

    // 5. WATERFALL ALLOCATION LOGIC (In-Memory Processing before DB insert)
    let dynamicPool = parseFloat(initialAmountPaid) || 0;
    
    // 6. Database Transaction
    const result = await prisma.$transaction(async (tx) => {
      
      // A. Create Student
      const newStudent = await tx.student.create({
        data: {
          name,
          fatherName: fatherName || "",
          motherName: motherName || "",
          dateOfAdmission: startDate,
          cardNo,
          contactNo,
          station: station || null,
          classId: targetClass.id,
          sessionId: targetSession.id
        }
      });

      // B. Monthly Structure ko loop karke save karna aur payment adjust karna
      for (let i = 0; i < feeStructuresToCreate.length; i++) {
        const feeData = feeStructuresToCreate[i];
        let allocated = 0;
        let finalStatus = "PENDING";

        if (dynamicPool > 0) {
          if (dynamicPool >= feeData.total) {
            allocated = feeData.total;
            dynamicPool = Math.round((dynamicPool - feeData.total) * 100) / 100;
            finalStatus = "PAID";
          } else {
            allocated = dynamicPool;
            dynamicPool = 0;
            finalStatus = "PARTIALLY_PAID";
          }
        }

        // Create individual Fee Structure row
        const createdFee = await tx.feeStructure.create({
          data: {
            studentId: newStudent.id,
            month: feeData.month,
            studentClass: feeData.studentClass,
            admissionFee: feeData.admissionFee,
            tuitionFee: feeData.tuitionFee,
            examFee: feeData.examFee,
            computerFee: feeData.computerFee,
            tieBeltBooks: feeData.tieBeltBooks,
            ptmFine: feeData.ptmFine,
            buildingFund: feeData.buildingFund,
            annualCharges: feeData.annualCharges,
            schoolBusCharges: feeData.schoolBusCharges,
            total: feeData.total,
            status: finalStatus
          }
        });

        // If any payment was allocated to this month, make an entry in Payments table
        if (allocated > 0) {
          await tx.payment.create({
            data: {
              feeStructureId: createdFee.id,
              amountPaid: allocated,
              paymentMode: paymentMode || "CASH"
            }
          });
        }
      }

      // Final response object layout
      return tx.student.findUnique({
        where: { id: newStudent.id },
        include: { 
          feeStructures: {
            include: { payments: true }
          } 
        }
      });
    });

    // Calculate totals for WhatsApp message
    let totalBillGenerated = 0;
    let totalPaidFromBill = 0;
    let totalRemaining = 0;

    if (result && result.feeStructures) {
      result.feeStructures.forEach(fs => {
        totalBillGenerated += parseFloat(fs.total || 0);
        let amountPaidForThisMonth = 0;
        if (fs.payments) {
          fs.payments.forEach(p => amountPaidForThisMonth += parseFloat(p.amountPaid || 0));
        }
        totalPaidFromBill += amountPaidForThisMonth;
      });
      totalRemaining = totalBillGenerated - totalPaidFromBill;
    }

    // Send WhatsApp notification
    if (contactNo) {
      const admissionMonthName = monthNames[startDate.getMonth()];
      const admissionYear = startDate.getFullYear();
      
      let invoiceLinkStr = "";
      if (result && result.feeStructures && result.feeStructures.length > 0) {
        // Find the most relevant fee structure id to link to
        const lastFeeWithPayment = result.feeStructures.filter(fs => fs.payments && fs.payments.length > 0).pop();
        const linkFeeId = lastFeeWithPayment ? lastFeeWithPayment.id : result.feeStructures[0].id;
        invoiceLinkStr = `\nView/Print Digital Invoice: ${process.env.FRONTEND_URL}/receipt/${linkFeeId}\n`;
      }

      const message = `Dear Parent, your child ${name} has been successfully admitted to Neelgiri School in Class ${className}.
Admission Month: ${admissionMonthName} ${admissionYear}
${invoiceLinkStr}
Billing Summary (From Admission to Current Date):
- Total Bill Generated: ₹${totalBillGenerated}
- Total Paid: ₹${totalPaidFromBill}
- Total Remaining: ₹${totalRemaining}

Thank you for choosing Neelgiri School!`;

      // Non-blocking background call
      sendWhatsAppMessage(contactNo, message).catch(err => {
        console.error("Failed to send admission WhatsApp message:", err);
      });
    }

    return res.status(201).json({
      success: true,
      message: `Student registered successfully. Collected upfront amount adjusted across generated months.`,
      changeReturned: dynamicPool, // Agar paise extra bach gye ho toh output krdega
      data: result
    });

  } catch (error) {
    console.error("Error in addStudent with upfront payment:", error);
    if (error.code === 'P2002') {
      return res.status(400).json({ 
        success: false, 
        message: "This Card Number is already assigned to another student in this specific session." 
      });
    }
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const getStudents = async (req, res) => {
  try {
    const { search, page = 1, limit = 30, studentClass, session } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { cardNo: { contains: search, mode: "insensitive" } }
      ];
    }
    if (studentClass && studentClass !== "All") {
      where.studentclass = {
        className: studentClass
      };
    }
    if (session) {
      // Normalize session year format (e.g., "2026-2027" -> "2026-27")
      let formattedSession = session;
      if (session && session.includes("-")) {
        const parts = session.split("-");
        if (parts.length === 2 && parts[0].length === 4 && parts[1].length === 4) {
          formattedSession = `${parts[0]}-${parts[1].substring(2)}`;
        }
      }
      where.session = {
        year: formattedSession
      };
    }

    const [students, totalCount] = await Promise.all([
      prisma.student.findMany({
        where,
        skip,
        take: limitNum,
        include: {
          studentclass: true,
          session: true
        },
        orderBy: { name: "asc" }
      }),
      prisma.student.count({ where })
    ]);

    return res.status(200).json({
      success: true,
      students,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        currentPage: pageNum,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error("Error in getStudents:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const getStudentFees = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        feeStructures: {
          include: { payments: true }
        },
        studentclass: true,
        session: true
      }
    });

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // Sort fee structures chronologically by month
    const parseMonthStr = (str) => {
      const [mName, year] = str.split("-");
      return new Date(`${mName} 1, ${year}`);
    };

    // Auto-generate missing months from admission date to current month
    const startDate = student.dateOfAdmission ? new Date(student.dateOfAdmission) : new Date();
    const endDate = new Date();
    let currentLoopDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endLoopDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    const monthNames = [
      "January", "February", "March", "April", "May", "June", 
      "July", "August", "September", "October", "November", "December"
    ];

    let updatedFeeStructures = [...student.feeStructures];
    let hasNewStructures = false;

    // Pre-fetch all monthly fees for this class to avoid N+1 queries
    const monthlyFees = await prisma.classMonthlyFee.findMany({
      where: { className: student.studentclass.className }
    });

    // Lookup transport fee
    let busCharges = 0;
    if (student.station) {
      const transport = await prisma.transportFee.findUnique({ where: { station: student.station } });
      if (transport) busCharges = parseFloat(transport.amount);
    }

    while (currentLoopDate <= endLoopDate) {
      const mName = monthNames[currentLoopDate.getMonth()];
      const year = currentLoopDate.getFullYear();
      const monthStr = `${mName}-${year}`;

      const exists = student.feeStructures.some(f => f.month === monthStr);
      if (!exists) {
        const newFee = await ensureStudentFeeForMonth(student, monthStr, startDate);
        updatedFeeStructures.push(newFee);
        hasNewStructures = true;
      }

      currentLoopDate.setMonth(currentLoopDate.getMonth() + 1);
    }

    updatedFeeStructures.sort((a, b) => parseMonthStr(a.month) - parseMonthStr(b.month));
    student.feeStructures = updatedFeeStructures;

    return res.status(200).json({
      success: true,
      student
    });
  } catch (error) {
    console.error("Error in getStudentFees:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const getFeeStats = async (req, res) => {
  try {
    const { session } = req.query; // e.g. "2026-2027"
    
    // Find active session
    let targetSession = null;
    if (session) {
      // Normalize session year format (e.g., "2026-2027" -> "2026-27")
      let formattedSession = session;
      if (session && session.includes("-")) {
        const parts = session.split("-");
        if (parts.length === 2 && parts[0].length === 4 && parts[1].length === 4) {
          formattedSession = `${parts[0]}-${parts[1].substring(2)}`;
        }
      }
      targetSession = await prisma.session.findUnique({ where: { year: formattedSession } });
    } else {
      // Fallback to latest session
      targetSession = await prisma.session.findFirst({ orderBy: { year: 'desc' } });
    }

    if (!targetSession) {
      return res.status(404).json({ success: false, message: "No active session found" });
    }

    const totalStudents = await prisma.student.count({
      where: { sessionId: targetSession.id }
    });

    const now = new Date();
    const monthNames = [
      "January", "February", "March", "April", "May", "June", 
      "July", "August", "September", "October", "November", "December"
    ];
    const currentMonthStr = `${monthNames[now.getMonth()]}-${now.getFullYear()}`;

    // Get all students with their fee structures in this session
    const students = await prisma.student.findMany({
      where: { sessionId: targetSession.id },
      include: {
        feeStructures: {
          include: { payments: true }
        },
        studentclass: true
      }
    });

    const prevPendingList = [];
    const currentPendingList = [];

    const parseMonthStr = (str) => {
      const [mName, year] = str.split("-");
      return new Date(`${mName} 1, ${year}`);
    };
    const currentMonthDate = parseMonthStr(currentMonthStr);

    for (const student of students) {
      let hasPrevPending = false;
      let hasCurrentPending = false;
      let prevPendingAmount = 0;
      let currentPendingAmount = 0;

      for (const fee of student.feeStructures) {
        if (fee.status !== "PAID") {
          const feeMonthDate = parseMonthStr(fee.month);
          const totalAlreadyPaid = fee.payments.reduce((sum, p) => sum + (parseFloat(p.amountPaid) || 0), 0);
          const due = Math.round(((parseFloat(fee.total) || 0) - totalAlreadyPaid) * 100) / 100;

          if (feeMonthDate < currentMonthDate) {
            hasPrevPending = true;
            prevPendingAmount += due;
          } else if (fee.month === currentMonthStr) {
            hasCurrentPending = true;
            currentPendingAmount += due;
          }
        }
      }

      if (hasPrevPending) {
        prevPendingList.push({
          id: student.id,
          name: student.name,
          cardNo: student.cardNo,
          studentClass: student.studentclass.className,
          contactNo: student.contactNo,
          pendingAmount: prevPendingAmount
        });
      }

      if (hasCurrentPending) {
        currentPendingList.push({
          id: student.id,
          name: student.name,
          cardNo: student.cardNo,
          studentClass: student.studentclass.className,
          contactNo: student.contactNo,
          pendingAmount: currentPendingAmount
        });
      }
    }

    return res.status(200).json({
      success: true,
      totalStudents,
      currentMonth: currentMonthStr,
      prevPendingCount: prevPendingList.length,
      currentPendingCount: currentPendingList.length,
      prevPendingList,
      currentPendingList
    });
  } catch (error) {
    console.error("Error in getFeeStats:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const updateStudentFeeStructure = async (req, res) => {
  try {
    const { feeId } = req.params;
    const {
      admissionFee,
      tuitionFee,
      schoolBusCharges,
      examFee,
      computerFee,
      ptmFine,
      tieBeltBooks,
      buildingFund,
      annualCharges
    } = req.body;

    const existing = await prisma.feeStructure.findUnique({
      where: { id: feeId },
      include: { payments: true }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: "Fee structure not found" });
    }

    const parseSafe = (val, fallback) => {
      const parsed = parseFloat(val);
      if (!isNaN(parsed)) return parsed;
      return parseFloat(fallback) || 0;
    };

    const nAdmission = parseSafe(admissionFee, existing.admissionFee);
    const nTuition = parseSafe(tuitionFee, existing.tuitionFee);
    const nBus = parseSafe(schoolBusCharges, existing.schoolBusCharges);
    const nExam = parseSafe(examFee, existing.examFee);
    const nComputer = parseSafe(computerFee, existing.computerFee);
    const nPtm = parseSafe(ptmFine, existing.ptmFine);
    const nTieBelt = parseSafe(tieBeltBooks, existing.tieBeltBooks);
    const nBuilding = parseSafe(buildingFund, existing.buildingFund);
    const nAnnual = parseSafe(annualCharges, existing.annualCharges);

    const newTotal = Math.round((nAdmission + nTuition + nBus + nExam + nComputer + nPtm + nTieBelt + nBuilding + nAnnual) * 100) / 100;
    const totalPaid = existing.payments.reduce((sum, p) => sum + (parseFloat(p.amountPaid) || 0), 0);

    let newStatus = "PENDING";
    if (Math.round((newTotal - totalPaid) * 100) / 100 <= 0) {
      newStatus = "PAID";
    } else if (totalPaid > 0) {
      newStatus = "PARTIALLY_PAID";
    }

    const updated = await prisma.feeStructure.update({
      where: { id: feeId },
      data: {
        admissionFee: nAdmission,
        tuitionFee: nTuition,
        schoolBusCharges: nBus,
        examFee: nExam,
        computerFee: nComputer,
        ptmFine: nPtm,
        tieBeltBooks: nTieBelt,
        buildingFund: nBuilding,
        annualCharges: nAnnual,
        total: newTotal,
        status: newStatus
      }
    });

    return res.status(200).json({
      success: true,
      message: "Fee structure updated successfully",
      feeStructure: updated
    });
  } catch (error) {
    console.error("Error in updateStudentFeeStructure:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export { addStudent, getStudents, getStudentFees, getFeeStats, updateStudentFeeStructure };
