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

const CLASS_PROGRESSION = {
  "Nursery": "LKG",
  "LKG": "UKG",
  "UKG": "1st",
  "1st": "2nd",
  "2nd": "3rd",
  "3rd": "4th",
  "4th": "5th",
  "5th": "6th",
  "6th": "7th",
  "7th": "8th",
  "8th": "9th",
  "9th": "10th",
  "10th": "11th",
  "11th": "12th"
};

const getNextSessionYear = (currentYear) => {
  const parts = currentYear.split("-");
  if (parts.length === 2) {
    const startYear = parseInt(parts[0]);
    const endYearShort = parseInt(parts[1]);
    const nextStartYear = startYear + 1;
    const nextEndYearShort = endYearShort + 1;
    const nextEndYearShortStr = String(nextEndYearShort).padStart(2, '0').slice(-2);
    return `${nextStartYear}-${nextEndYearShortStr}`;
  }
  const yearNum = parseInt(currentYear);
  if (!isNaN(yearNum)) {
    return `${yearNum + 1}`;
  }
  return currentYear;
};

const getClassRollNoPrefix = (className) => {
  if (className === "Nursery") return "NUR-";
  if (className === "LKG") return "LKG-";
  if (className === "UKG") return "UKG-";
  return null;
};

const getClassRollNoBase = (className) => {
  if (className === "Nursery") return 1;
  if (className === "LKG") return 1;
  if (className === "UKG") return 1;
  
  const match =  className.match(/(\d+)/);
  if (match) {
    const classNum = parseInt(match[1]);
    return classNum * 100 + 1; // Class 1 -> 101, Class 2 -> 201, Class 12 -> 1201
  }
  
  return 10001; // fallback
};

const generateNextRollNo = async (className, sessionId, tx) => {
  const prefix = getClassRollNoPrefix(className);
  const prismaClient = tx || prisma;
  
  const targetClass = await prismaClient.class.findUnique({
    where: { className }
  });
  
  if (!targetClass) {
    if (prefix) return `${prefix}01`;
    return String(getClassRollNoBase(className));
  }
  
  const students = await prismaClient.student.findMany({
    where: {
      classId: targetClass.id,
      sessionId
    },
    select: { cardNo: true }
  });

  if (prefix) {
    const suffixes = students
      .map(s => {
        if (s.cardNo && s.cardNo.startsWith(prefix)) {
          const suffixStr = s.cardNo.substring(prefix.length);
          const num = parseInt(suffixStr);
          return isNaN(num) ? null : num;
        }
        return null;
      })
      .filter(num => num !== null);

    const maxSuffix = suffixes.length > 0 ? Math.max(...suffixes) : 0;
    const nextSuffix = maxSuffix + 1;
    return `${prefix}${String(nextSuffix).padStart(2, '0')}`;
  } else {
    const base = getClassRollNoBase(className);
    const rollNumbers = students
      .map(s => parseInt(s.cardNo))
      .filter(num => !isNaN(num));
      
    const maxRoll = rollNumbers.length > 0 ? Math.max(...rollNumbers) : 0;
    const nextRoll = maxRoll >= base ? maxRoll + 1 : base;
    return String(nextRoll);
  }
};

const addStudent = async (req, res) => {
  try {
    const { 
      name, 
      className, 
      admissionDate, 
      fatherName, 
      motherName, 
      dob,
      cardNo, 
      contactNo, 
      station,
      sessionYear,
      initialAmountPaid, // Frontend se aaya shuruati deposit (e.g., 5000)
      paymentMode,       // CASH ya UPI
      previousSessionDues,
      discountTuition,
      discountBus,
      discountAdmission,
      discountAnnual,
      discountExam,
      discountComputer
    } = req.body;

    // 1. Validation Check
    if (!name || !className || !admissionDate || !contactNo || !sessionYear) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields (Name, className, admissionDate, contactNo, sessionYear)" 
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

    // Parse student-specific discounts (defaulting to 0)
    const tuitionDiscount = parseFloat(discountTuition || 0) || 0;
    const busDiscount = parseFloat(discountBus || 0) || 0;
    const admissionDiscount = parseFloat(discountAdmission || 0) || 0;
    const annualDiscount = parseFloat(discountAnnual || 0) || 0;
    const examDiscount = parseFloat(discountExam || 0) || 0;
    const computerDiscount = parseFloat(discountComputer || 0) || 0;

    while (currentLoopDate <= endLoopDate) {
      const monthStr = formatMonthYear(currentLoopDate);
      const monthName = monthNames[currentLoopDate.getMonth()];
      const monthlyFeeConfig = monthlyFees.find(f => f.monthName === monthName);

      const tuitionFee = Math.max(0, ((monthlyFeeConfig ? parseFloat(monthlyFeeConfig.tuitionFee) : 0) || parseFloat(targetClass.tuitionFee) || 0) - tuitionDiscount);
      const examFee = Math.max(0, ((monthlyFeeConfig ? parseFloat(monthlyFeeConfig.examFee) : 0) || parseFloat(targetClass.examFee) || 0) - examDiscount);
      const computerFee = Math.max(0, ((monthlyFeeConfig ? parseFloat(monthlyFeeConfig.computerFee) : 0) || parseFloat(targetClass.computerFee) || 0) - computerDiscount);
      const admissionFee = Math.max(0, ((monthlyFeeConfig ? parseFloat(monthlyFeeConfig.admissionFee) : 0) || parseFloat(targetClass.admissionFee) || 0) - admissionDiscount);
      const tieBeltBooks = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.tieBeltBooks) : 0) || parseFloat(targetClass.tieBeltBooks) || 0;
      const ptmFine = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.ptmFine) : 0) || parseFloat(targetClass.ptmFine) || 0;
      const buildingFund = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.buildingFund) : 0) || parseFloat(targetClass.buildingFund) || 0;
      const annualCharges = Math.max(0, ((monthlyFeeConfig ? parseFloat(monthlyFeeConfig.annualCharges) : 0) || parseFloat(targetClass.annualCharges) || 0) - annualDiscount);
      const schoolBusCharges = Math.max(0, busCharges - busDiscount);

      const currentAdmissionFee = (feeStructuresToCreate.length === 0) ? admissionFee : 0;
      const currentPreviousSessionDues = (feeStructuresToCreate.length === 0) ? (parseFloat(previousSessionDues || "0") || 0) : 0;
      const totalDemand = currentAdmissionFee + tuitionFee + examFee + computerFee + tieBeltBooks + ptmFine + buildingFund + annualCharges + schoolBusCharges + currentPreviousSessionDues;

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
        schoolBusCharges,
        previousSessionDues: currentPreviousSessionDues,
        total: totalDemand,
        status: "PENDING"
      });

      currentLoopDate.setMonth(currentLoopDate.getMonth() + 1);
    }

    // 5. WATERFALL ALLOCATION LOGIC (In-Memory Processing before DB insert)
    let dynamicPool = parseFloat(initialAmountPaid) || 0;
    
    // 6. Database Transaction
    const result = await prisma.$transaction(async (tx) => {
      
      // Auto-generate cardNo (roll number) if not provided
      const finalCardNo = (cardNo && cardNo.trim() !== "") 
        ? cardNo.trim() 
        : await generateNextRollNo(className, targetSession.id, tx);

      // A. Create Student
      const newStudent = await tx.student.create({
        data: {
          name,
          fatherName: fatherName || "",
          motherName: motherName || "",
          dateOfAdmission: startDate,
          dob: dob ? new Date(dob) : null,
          cardNo: finalCardNo,
          contactNo,
          station: station || null,
          classId: targetClass.id,
          sessionId: targetSession.id,
          discountTuition: tuitionDiscount,
          discountBus: busDiscount,
          discountAdmission: admissionDiscount,
          discountAnnual: annualDiscount,
          discountExam: examDiscount,
          discountComputer: computerDiscount
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
            previousSessionDues: feeData.previousSessionDues,
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
        orderBy: { cardNo: "asc" }
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

const getIncomeAnalysis = async (req, res) => {
  try {
    const { session } = req.query;
    let targetSession = null;
    if (session) {
      let formattedSession = session;
      if (session && session.includes("-")) {
        const parts = session.split("-");
        if (parts.length === 2 && parts[0].length === 4 && parts[1].length === 4) {
          formattedSession = `${parts[0]}-${parts[1].substring(2)}`;
        }
      }
      targetSession = await prisma.session.findUnique({ where: { year: formattedSession } });
    } else {
      targetSession = await prisma.session.findFirst({ orderBy: { year: 'desc' } });
    }

    if (!targetSession) {
      return res.status(404).json({ success: false, message: "No active session found" });
    }

    const students = await prisma.student.findMany({
      where: { sessionId: targetSession.id },
      include: {
        feeStructures: {
          include: { payments: true }
        },
        studentclass: true
      }
    });

    const monthsMap = {};
    const monthOrder = ["April","May","June","July","August","September","October","November","December","January","February","March"];

    const getMonthIndex = (monthStr) => {
      const [mName] = monthStr.split("-");
      return monthOrder.indexOf(mName);
    };

    const getYearNum = (monthStr) => {
      const [, year] = monthStr.split("-");
      return parseInt(year) || 0;
    };

    for (const student of students) {
      const className = student.studentclass.className;

      for (const fee of student.feeStructures) {
        const monthStr = fee.month;
        if (!monthsMap[monthStr]) {
          monthsMap[monthStr] = {
            month: monthStr,
            totalDemand: 0,
            totalPaid: 0,
            totalPending: 0,
            classes: {},
            unpaidStudents: []
          };
        }

        const mData = monthsMap[monthStr];
        const demand = parseFloat(fee.total || 0);
        const paid = fee.payments.reduce((sum, p) => sum + (parseFloat(p.amountPaid) || 0), 0);
        const pending = Math.max(0, Math.round((demand - paid) * 100) / 100);

        mData.totalDemand = Math.round((mData.totalDemand + demand) * 100) / 100;
        mData.totalPaid = Math.round((mData.totalPaid + paid) * 100) / 100;
        mData.totalPending = Math.round((mData.totalPending + pending) * 100) / 100;

        if (fee.status !== "PAID") {
          mData.unpaidStudents.push({
            id: student.id,
            name: student.name,
            cardNo: student.cardNo,
            className,
            contactNo: student.contactNo,
            demand,
            paid,
            pending,
            status: fee.status
          });
        }

        if (!mData.classes[className]) {
          mData.classes[className] = {
            className,
            demand: 0,
            paid: 0,
            pending: 0,
            studentCount: 0,
            paidCount: 0,
            partialCount: 0,
            pendingCount: 0
          };
        }

        const cData = mData.classes[className];
        cData.demand = Math.round((cData.demand + demand) * 100) / 100;
        cData.paid = Math.round((cData.paid + paid) * 100) / 100;
        cData.pending = Math.round((cData.pending + pending) * 100) / 100;
        cData.studentCount += 1;

        if (fee.status === "PAID") {
          cData.paidCount += 1;
        } else if (fee.status === "PARTIALLY_PAID") {
          cData.partialCount += 1;
        } else {
          cData.pendingCount += 1;
        }
      }
    }

    const classOrder = ["Nursery", "LKG", "UKG", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];
    
    const formattedData = Object.values(monthsMap).map(mData => {
      const classesArr = Object.values(mData.classes).sort((a, b) => {
        return classOrder.indexOf(a.className) - classOrder.indexOf(b.className);
      });
      
      const sortedUnpaid = [...mData.unpaidStudents].sort((a, b) => {
        const aNum = parseInt(a.cardNo);
        const bNum = parseInt(b.cardNo);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return aNum - bNum;
        }
        return (a.cardNo || "").localeCompare(b.cardNo || "");
      });

      return {
        ...mData,
        classes: classesArr,
        unpaidStudents: sortedUnpaid
      };
    });

    formattedData.sort((a, b) => {
      const yearA = getYearNum(a.month);
      const yearB = getYearNum(b.month);
      if (yearA !== yearB) {
        return yearA - yearB;
      }
      return getMonthIndex(a.month) - getMonthIndex(b.month);
    });

    return res.status(200).json({
      success: true,
      data: formattedData
    });

  } catch (error) {
    console.error("Error in getIncomeAnalysis:", error);
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
      annualCharges,
      previousSessionDues
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
    const nPrevDues = parseSafe(previousSessionDues, existing.previousSessionDues);

    const newTotal = Math.round((nAdmission + nTuition + nBus + nExam + nComputer + nPtm + nTieBelt + nBuilding + nAnnual + nPrevDues) * 100) / 100;
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
        previousSessionDues: nPrevDues,
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

const syncPendingFeeStructures = async (studentId, tx = prisma) => {
  // 1. Fetch student along with their class configurations and station info
  const student = await tx.student.findUnique({
    where: { id: studentId },
    include: {
      studentclass: true
    }
  });
  if (!student) return;

  const targetClass = student.studentclass;

  // 2. Fetch monthly fee configurations for this class
  const monthlyFees = await tx.classMonthlyFee.findMany({
    where: { className: targetClass.className }
  });

  // 3. Transport charges
  let busCharges = 0;
  if (student.station) {
    const transport = await tx.transportFee.findUnique({ where: { station: student.station } });
    if (transport) busCharges = parseFloat(transport.amount);
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];

  // 4. Fetch all PENDING fee structures for this student
  const pendingStructures = await tx.feeStructure.findMany({
    where: {
      studentId,
      status: "PENDING"
    },
    include: { payments: true }
  });

  // Parse discounts
  const tuitionDiscount = parseFloat(student.discountTuition) || 0;
  const busDiscount = parseFloat(student.discountBus) || 0;
  const admissionDiscount = parseFloat(student.discountAdmission) || 0;
  const annualDiscount = parseFloat(student.discountAnnual) || 0;
  const examDiscount = parseFloat(student.discountExam) || 0;
  const computerDiscount = parseFloat(student.discountComputer) || 0;

  for (const fs of pendingStructures) {
    const monthParts = fs.month.split("-");
    const monthName = monthParts[0];
    const monthlyFeeConfig = monthlyFees.find(f => f.monthName === monthName);

    // standard tuition, exam, computer, etc. for this month
    const stdTuition = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.tuitionFee) : 0) || parseFloat(targetClass.tuitionFee) || 0;
    const stdExam = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.examFee) : 0) || parseFloat(targetClass.examFee) || 0;
    const stdComputer = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.computerFee) : 0) || parseFloat(targetClass.computerFee) || 0;
    const stdAdmission = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.admissionFee) : 0) || parseFloat(targetClass.admissionFee) || 0;
    const stdAnnual = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.annualCharges) : 0) || parseFloat(targetClass.annualCharges) || 0;
    const stdTieBelt = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.tieBeltBooks) : 0) || parseFloat(targetClass.tieBeltBooks) || 0;
    const stdPtm = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.ptmFine) : 0) || parseFloat(targetClass.ptmFine) || 0;
    const stdBuilding = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.buildingFund) : 0) || parseFloat(targetClass.buildingFund) || 0;

    // Apply discounts
    const tuitionFee = Math.max(0, stdTuition - tuitionDiscount);
    const examFee = Math.max(0, stdExam - examDiscount);
    const computerFee = Math.max(0, stdComputer - computerDiscount);
    const admissionFee = Math.max(0, stdAdmission - admissionDiscount);
    const annualCharges = Math.max(0, stdAnnual - annualDiscount);
    const schoolBusCharges = Math.max(0, busCharges - busDiscount);
    const prevSessionDues = parseFloat(fs.previousSessionDues) || 0;

    const total = admissionFee + tuitionFee + examFee + computerFee + stdTieBelt + stdPtm + stdBuilding + annualCharges + schoolBusCharges + prevSessionDues;

    await tx.feeStructure.update({
      where: { id: fs.id },
      data: {
        admissionFee,
        tuitionFee,
        examFee,
        computerFee,
        annualCharges,
        schoolBusCharges,
        total
      }
    });
  }
};

const updateStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const {
      name,
      className,
      admissionDate,
      fatherName,
      motherName,
      dob,
      cardNo,
      contactNo,
      station,
      sessionYear,
      discountTuition,
      discountBus,
      discountAdmission,
      discountAnnual,
      discountExam,
      discountComputer
    } = req.body;

    const existing = await prisma.student.findUnique({
      where: { id: studentId }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (fatherName !== undefined) updateData.fatherName = fatherName;
    if (motherName !== undefined) updateData.motherName = motherName;
    if (contactNo !== undefined) updateData.contactNo = contactNo;
    if (station !== undefined) updateData.station = station || null;
    
    if (admissionDate !== undefined) {
      updateData.dateOfAdmission = new Date(admissionDate);
    }
    if (dob !== undefined) {
      updateData.dob = dob ? new Date(dob) : null;
    }

    if (className !== undefined) {
      const targetClass = await prisma.class.findUnique({
        where: { className }
      });
      if (!targetClass) {
        return res.status(404).json({ success: false, message: `Class '${className}' not found.` });
      }
      updateData.classId = targetClass.id;
    }

    if (sessionYear !== undefined) {
      let formattedSessionYear = sessionYear;
      if (sessionYear && sessionYear.includes("-")) {
        const parts = sessionYear.split("-");
        if (parts.length === 2 && parts[0].length === 4 && parts[1].length === 4) {
          formattedSessionYear = `${parts[0]}-${parts[1].substring(2)}`;
        }
      }
      const targetSession = await prisma.session.findUnique({
        where: { year: formattedSessionYear }
      });
      if (!targetSession) {
        return res.status(404).json({ success: false, message: `Session '${sessionYear}' not found.` });
      }
      updateData.sessionId = targetSession.id;
    }

    if (cardNo !== undefined && cardNo !== existing.cardNo) {
      updateData.cardNo = cardNo;
    }

    if (discountTuition !== undefined) updateData.discountTuition = parseFloat(discountTuition || 0) || 0;
    if (discountBus !== undefined) updateData.discountBus = parseFloat(discountBus || 0) || 0;
    if (discountAdmission !== undefined) updateData.discountAdmission = parseFloat(discountAdmission || 0) || 0;
    if (discountAnnual !== undefined) updateData.discountAnnual = parseFloat(discountAnnual || 0) || 0;
    if (discountExam !== undefined) updateData.discountExam = parseFloat(discountExam || 0) || 0;
    if (discountComputer !== undefined) updateData.discountComputer = parseFloat(discountComputer || 0) || 0;

    const updatedStudent = await prisma.$transaction(async (tx) => {
      const student = await tx.student.update({
        where: { id: studentId },
        data: updateData,
        include: {
          studentclass: true,
          session: true
        }
      });

      // Synchronize all PENDING monthly structures if any discount/class/station has been updated
      if (
        discountTuition !== undefined ||
        discountBus !== undefined ||
        discountAdmission !== undefined ||
        discountAnnual !== undefined ||
        discountExam !== undefined ||
        discountComputer !== undefined ||
        station !== undefined ||
        className !== undefined
      ) {
        await syncPendingFeeStructures(studentId, tx);
      }

      return student;
    });

    return res.status(200).json({
      success: true,
      message: "Student information updated successfully",
      student: updatedStudent
    });
  } catch (error) {
    console.error("Error in updateStudent:", error);
    if (error.code === 'P2002') {
      return res.status(400).json({ 
        success: false, 
        message: "This Card Number is already assigned to another student in this specific session." 
      });
    }
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const promoteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    // 1. Fetch current student details
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { studentclass: true, session: true }
    });

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const currentClassName = student.studentclass.className;
    const nextClassName = CLASS_PROGRESSION[currentClassName];

    if (!nextClassName) {
      return res.status(400).json({
        success: false,
        message: `Promotion is not applicable for class '${currentClassName}' (highest class level).`
      });
    }

    // 2. Find target class
    const targetClass = await prisma.class.findUnique({
      where: { className: nextClassName }
    });

    if (!targetClass) {
      return res.status(404).json({
        success: false,
        message: `Target class '${nextClassName}' does not exist in the database.`
      });
    }

    // 3. Calculate next session
    const currentSessionYear = student.session.year;
    const nextSessionYear = getNextSessionYear(currentSessionYear);

    // 4. Find or create next session (outside transaction to avoid lock contention)
    let targetSession = await prisma.session.findUnique({
      where: { year: nextSessionYear }
    });

    if (!targetSession) {
      targetSession = await prisma.session.create({
        data: { year: nextSessionYear }
      });
    }

    // 5. Check if student is already promoted (outside transaction)
    const alreadyPromoted = await prisma.student.findFirst({
      where: {
        name: student.name,
        fatherName: student.fatherName,
        dob: student.dob,
        sessionId: targetSession.id
      }
    });

    if (alreadyPromoted) {
      return res.status(400).json({
        success: false,
        message: `Student '${student.name}' is already promoted/registered in session ${nextSessionYear}.`
      });
    }

    // 6. Calculate total remaining balance of the student in the current session
    const currentFeeStructures = await prisma.feeStructure.findMany({
      where: { studentId },
      include: { payments: true }
    });

    let totalDues = 0;
    for (const fs of currentFeeStructures) {
      const total = parseFloat(fs.total || 0);
      const paid = fs.payments?.reduce((sum, p) => sum + parseFloat(p.amountPaid || 0), 0) || 0;
      const rem = Math.round((total - paid) * 100) / 100;
      if (rem > 0) {
        totalDues = Math.round((totalDues + rem) * 100) / 100;
      }
    }

    console.log(`Calculated previous session remaining balance: Rs. ${totalDues}`);

    // 7. Pre-fetch details needed for fee generation (outside transaction)
    const monthlyFees = await prisma.classMonthlyFee.findMany({
      where: { className: targetClass.className }
    });

    let busCharges = 0;
    if (student.station) {
      const transport = await prisma.transportFee.findUnique({ where: { station: student.station } });
      if (transport) busCharges = parseFloat(transport.amount);
    }

    // Generate roll number (outside transaction)
    const cardNo = await generateNextRollNo(nextClassName, targetSession.id);

    // 8. Run database transaction with custom options (generous timeout options)
    const result = await prisma.$transaction(async (tx) => {
      // Set target session's start date
      const startYear = parseInt(nextSessionYear.split("-")[0]);
      const nextSessionStartDate = new Date(startYear, 3, 1); // April

      // Create new Student record
      // Create new Student record
      const promotedStudent = await tx.student.create({
        data: {
          name: student.name,
          fatherName: student.fatherName,
          motherName: student.motherName || "",
          dateOfAdmission: nextSessionStartDate,
          dob: student.dob,
          cardNo,
          contactNo: student.contactNo,
          station: student.station || null,
          classId: targetClass.id,
          sessionId: targetSession.id,
          discountTuition: student.discountTuition,
          discountBus: student.discountBus,
          discountAdmission: student.discountAdmission,
          discountAnnual: student.discountAnnual,
          discountExam: student.discountExam,
          discountComputer: student.discountComputer
        }
      });

      // Generate monthly fee structures
      const startDate = nextSessionStartDate;
      const endDate = new Date();
      
      let currentLoopDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const endLoopDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
      
      const loopLimit = currentLoopDate > endLoopDate ? currentLoopDate : endLoopDate;

      const monthNames = [
        "January", "February", "March", "April", "May", "June", 
        "July", "August", "September", "October", "November", "December"
      ];

      let isFirstMonth = true;

      // Parse student-specific discounts (from current student details)
      const tuitionDiscount = parseFloat(student.discountTuition || 0) || 0;
      const busDiscount = parseFloat(student.discountBus || 0) || 0;
      const admissionDiscount = parseFloat(student.discountAdmission || 0) || 0;
      const annualDiscount = parseFloat(student.discountAnnual || 0) || 0;
      const examDiscount = parseFloat(student.discountExam || 0) || 0;
      const computerDiscount = parseFloat(student.discountComputer || 0) || 0;

      for (let d = new Date(currentLoopDate); d <= loopLimit; d.setMonth(d.getMonth() + 1)) {
        const monthStr = formatMonthYear(d);
        const monthName = monthNames[d.getMonth()];
        const monthlyFeeConfig = monthlyFees.find(f => f.monthName === monthName);

        const tuitionFee = Math.max(0, ((monthlyFeeConfig ? parseFloat(monthlyFeeConfig.tuitionFee) : 0) || parseFloat(targetClass.tuitionFee) || 0) - tuitionDiscount);
        const examFee = Math.max(0, ((monthlyFeeConfig ? parseFloat(monthlyFeeConfig.examFee) : 0) || parseFloat(targetClass.examFee) || 0) - examDiscount);
        const computerFee = Math.max(0, ((monthlyFeeConfig ? parseFloat(monthlyFeeConfig.computerFee) : 0) || parseFloat(targetClass.computerFee) || 0) - computerDiscount);
        const tieBeltBooks = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.tieBeltBooks) : 0) || parseFloat(targetClass.tieBeltBooks) || 0;
        const ptmFine = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.ptmFine) : 0) || parseFloat(targetClass.ptmFine) || 0;
        const buildingFund = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.buildingFund) : 0) || parseFloat(targetClass.buildingFund) || 0;
        const annualCharges = Math.max(0, ((monthlyFeeConfig ? parseFloat(monthlyFeeConfig.annualCharges) : 0) || parseFloat(targetClass.annualCharges) || 0) - annualDiscount);
        const schoolBusCharges = Math.max(0, busCharges - busDiscount);

        const currentAdmissionFee = 0;
        const currentPreviousSessionDues = isFirstMonth ? totalDues : 0;
        isFirstMonth = false;

        const totalDemand = currentAdmissionFee + tuitionFee + examFee + computerFee + tieBeltBooks + ptmFine + buildingFund + annualCharges + schoolBusCharges + currentPreviousSessionDues;

        await tx.feeStructure.create({
          data: {
            studentId: promotedStudent.id,
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
            schoolBusCharges,
            previousSessionDues: currentPreviousSessionDues,
            total: totalDemand,
            status: "PENDING"
          }
        });
      }

      return promotedStudent;
    }, {
      maxWait: 15000,
      timeout: 30000
    });

    return res.status(200).json({
      success: true,
      message: `Student promoted successfully to class ${nextClassName} for session ${nextSessionYear}. Remaining balance of Rs. ${totalDues} has been added.`,
      student: result
    });
  } catch (error) {
    console.error("Error in promoteStudent:", error);
    return res.status(500).json({ success: false, message: error.message || "Internal server error" });
  }
};

const deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    const existing = await prisma.student.findUnique({
      where: { id: studentId }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete associated fee automation logs
      await tx.feeAutomationLog.deleteMany({
        where: { studentId }
      });

      // 2. Delete student record. Database cascades will clean up feeStructures and payments automatically.
      await tx.student.delete({
        where: { id: studentId }
      });
    });

    return res.status(200).json({
      success: true,
      message: "Student and all associated records deleted successfully."
    });
  } catch (error) {
    console.error("Error in deleteStudent:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const getNextRollNo = async (req, res) => {
  try {
    const { className, sessionYear } = req.query;
    if (!className || !sessionYear) {
      return res.status(400).json({ success: false, message: "Missing className or sessionYear parameter" });
    }

    let formattedSessionYear = sessionYear;
    if (sessionYear && sessionYear.includes("-")) {
      const parts = sessionYear.split("-");
      if (parts.length === 2 && parts[0].length === 4 && parts[1].length === 4) {
        formattedSessionYear = `${parts[0]}-${parts[1].substring(2)}`;
      }
    }

    const session = await prisma.session.findUnique({
      where: { year: formattedSessionYear }
    });

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    const nextRollNo = await generateNextRollNo(className, session.id);
    return res.status(200).json({ success: true, nextRollNo });
  } catch (error) {
    console.error("Error in getNextRollNo:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export { 
  addStudent, 
  getStudents, 
  getStudentFees, 
  getFeeStats,
  getIncomeAnalysis,
  getNextRollNo,
  updateStudentFeeStructure, 
  updateStudent, deleteStudent, 
  promoteStudent 
};
