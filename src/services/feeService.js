import { prisma } from '../../lib/prisma.ts';

/**
 * Ensures fee structure exists for the given month. If it doesn't exist, it creates it.
 * @param {Object} student - The student object (must include studentclass and station)
 * @param {string} monthStr - The month string "Month-YYYY" e.g., "June-2026"
 * @param {Date} startDate - The admission date of the student
 * @returns {Object} The generated or existing FeeStructure
 */
export const ensureStudentFeeForMonth = async (student, monthStr, startDate) => {
  const exists = await prisma.feeStructure.findUnique({
    where: {
      studentId_month: {
        studentId: student.id,
        month: monthStr
      }
    },
    include: { payments: true }
  });

  if (exists) return exists;

  const [mName, year] = monthStr.split("-");
  
  // Fetch monthly config
  const monthlyFeeConfig = await prisma.classMonthlyFee.findUnique({
    where: {
      className_monthName: {
        className: student.studentclass.className,
        monthName: mName
      }
    }
  });

  const tuitionDiscount = parseFloat(student.discountTuition || 0) || 0;
  const busDiscount = parseFloat(student.discountBus || 0) || 0;
  const admissionDiscount = parseFloat(student.discountAdmission || 0) || 0;
  const annualDiscount = parseFloat(student.discountAnnual || 0) || 0;
  const examDiscount = parseFloat(student.discountExam || 0) || 0;
  const computerDiscount = parseFloat(student.discountComputer || 0) || 0;

  const tuitionFee = Math.max(0, ((monthlyFeeConfig ? parseFloat(monthlyFeeConfig.tuitionFee) : 0) || parseFloat(student.studentclass.tuitionFee) || 0) - tuitionDiscount);
  const examFee = Math.max(0, ((monthlyFeeConfig ? parseFloat(monthlyFeeConfig.examFee) : 0) || parseFloat(student.studentclass.examFee) || 0) - examDiscount);
  const computerFee = Math.max(0, ((monthlyFeeConfig ? parseFloat(monthlyFeeConfig.computerFee) : 0) || parseFloat(student.studentclass.computerFee) || 0) - computerDiscount);
  const admissionFeeConfig = Math.max(0, ((monthlyFeeConfig ? parseFloat(monthlyFeeConfig.admissionFee) : 0) || parseFloat(student.studentclass.admissionFee) || 0) - admissionDiscount);
  const tieBeltBooks = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.tieBeltBooks) : 0) || parseFloat(student.studentclass.tieBeltBooks) || 0;
  const ptmFine = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.ptmFine) : 0) || parseFloat(student.studentclass.ptmFine) || 0;
  const buildingFund = (monthlyFeeConfig ? parseFloat(monthlyFeeConfig.buildingFund) : 0) || parseFloat(student.studentclass.buildingFund) || 0;
  const annualCharges = Math.max(0, ((monthlyFeeConfig ? parseFloat(monthlyFeeConfig.annualCharges) : 0) || parseFloat(student.studentclass.annualCharges) || 0) - annualDiscount);

  let busCharges = 0;
  if (student.station) {
    const transport = await prisma.transportFee.findUnique({ where: { station: student.station } });
    if (transport) busCharges = parseFloat(transport.amount);
  }
  const schoolBusCharges = Math.max(0, busCharges - busDiscount);

  const feeMonthDate = new Date(`${mName} 1, ${year}`);
  const isAdmissionMonth = feeMonthDate.getMonth() === startDate.getMonth() && 
                           feeMonthDate.getFullYear() === startDate.getFullYear();
  const currentAdmissionFee = isAdmissionMonth ? admissionFeeConfig : 0;

  const totalDemand = currentAdmissionFee + tuitionFee + examFee + computerFee + tieBeltBooks + ptmFine + buildingFund + annualCharges + schoolBusCharges;

  const newFee = await prisma.feeStructure.create({
    data: {
      studentId: student.id,
      month: monthStr,
      studentClass: student.studentclass.className,
      admissionFee: currentAdmissionFee,
      tuitionFee,
      examFee,
      computerFee,
      tieBeltBooks,
      ptmFine,
      buildingFund,
      annualCharges,
      schoolBusCharges,
      total: totalDemand,
      status: "PENDING"
    },
    include: { payments: true }
  });

  return newFee;
};

/**
 * Revises all existing fee structures for a class for a specific month name.
 * e.g., if class "10th" fee changes for "September", recalculate all "September-YYYY" fees for students currently in "10th".
 */
export const reviseClassFeeStructures = async (className, monthName) => {
  // Find all students currently in this class
  const students = await prisma.student.findMany({
    where: { studentclass: { className } },
    include: { studentclass: true }
  });

  // Fetch the new monthly config
  const monthlyFeeConfig = await prisma.classMonthlyFee.findUnique({
    where: {
      className_monthName: { className, monthName }
    }
  });

  if (!monthlyFeeConfig) return;

  for (const student of students) {
    // Find fee structures for this student that match the month prefix (e.g. "September-")
    const feeStructures = await prisma.feeStructure.findMany({
      where: {
        studentId: student.id,
        month: { startsWith: `${monthName}-` }
      },
      include: { payments: true }
    });

    for (const fee of feeStructures) {
      const tuitionDiscount = parseFloat(student.discountTuition || 0) || 0;
      const busDiscount = parseFloat(student.discountBus || 0) || 0;
      const admissionDiscount = parseFloat(student.discountAdmission || 0) || 0;
      const annualDiscount = parseFloat(student.discountAnnual || 0) || 0;
      const examDiscount = parseFloat(student.discountExam || 0) || 0;
      const computerDiscount = parseFloat(student.discountComputer || 0) || 0;

      const tuitionFee = Math.max(0, (parseFloat(monthlyFeeConfig.tuitionFee) || parseFloat(student.studentclass.tuitionFee) || 0) - tuitionDiscount);
      const examFee = Math.max(0, (parseFloat(monthlyFeeConfig.examFee) || parseFloat(student.studentclass.examFee) || 0) - examDiscount);
      const computerFee = Math.max(0, (parseFloat(monthlyFeeConfig.computerFee) || parseFloat(student.studentclass.computerFee) || 0) - computerDiscount);
      const admissionFeeConfig = Math.max(0, (parseFloat(monthlyFeeConfig.admissionFee) || parseFloat(student.studentclass.admissionFee) || 0) - admissionDiscount);
      const tieBeltBooks = parseFloat(monthlyFeeConfig.tieBeltBooks) || parseFloat(student.studentclass.tieBeltBooks) || 0;
      const ptmFine = parseFloat(monthlyFeeConfig.ptmFine) || parseFloat(student.studentclass.ptmFine) || 0;
      const buildingFund = parseFloat(monthlyFeeConfig.buildingFund) || parseFloat(student.studentclass.buildingFund) || 0;
      const annualCharges = Math.max(0, (parseFloat(monthlyFeeConfig.annualCharges) || parseFloat(student.studentclass.annualCharges) || 0) - annualDiscount);

      let busCharges = 0;
      if (student.station) {
        const transport = await prisma.transportFee.findUnique({ where: { station: student.station } });
        if (transport) busCharges = parseFloat(transport.amount);
      }
      const schoolBusCharges = Math.max(0, busCharges - busDiscount);

      const startDate = student.dateOfAdmission ? new Date(student.dateOfAdmission) : new Date();
      const [mName, year] = fee.month.split("-");
      const feeMonthDate = new Date(`${mName} 1, ${year}`);
      const isAdmissionMonth = feeMonthDate.getMonth() === startDate.getMonth() && 
                               feeMonthDate.getFullYear() === startDate.getFullYear();
      const currentAdmissionFee = isAdmissionMonth ? admissionFeeConfig : 0;

      const totalDemand = currentAdmissionFee + tuitionFee + examFee + computerFee + tieBeltBooks + ptmFine + buildingFund + annualCharges + schoolBusCharges;

      // Recalculate status based on payments
      const totalPaid = fee.payments.reduce((sum, p) => sum + (parseFloat(p.amountPaid) || 0), 0);
      let newStatus = "PENDING";
      if (totalPaid >= totalDemand && totalDemand > 0) {
        newStatus = "PAID";
      } else if (totalPaid > 0) {
        newStatus = "PARTIALLY_PAID";
      }

      await prisma.feeStructure.update({
        where: { id: fee.id },
        data: {
          admissionFee: currentAdmissionFee,
          tuitionFee,
          examFee,
          computerFee,
          tieBeltBooks,
          ptmFine,
          buildingFund,
          annualCharges,
          schoolBusCharges,
          total: totalDemand,
          status: newStatus
        }
      });
    }
  }
};
