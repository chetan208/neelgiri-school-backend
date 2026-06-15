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

  const tuitionFee = monthlyFeeConfig ? parseFloat(monthlyFeeConfig.tuitionFee) : parseFloat(student.studentclass.tuitionFee || 0);
  const examFee = monthlyFeeConfig ? parseFloat(monthlyFeeConfig.examFee) : parseFloat(student.studentclass.examFee || 0);
  const computerFee = monthlyFeeConfig ? parseFloat(monthlyFeeConfig.computerFee) : parseFloat(student.studentclass.computerFee || 0);
  const admissionFeeConfig = monthlyFeeConfig ? parseFloat(monthlyFeeConfig.admissionFee) : parseFloat(student.studentclass.admissionFee || 0);
  const tieBeltBooks = monthlyFeeConfig ? parseFloat(monthlyFeeConfig.tieBeltBooks) : parseFloat(student.studentclass.tieBeltBooks || 0);
  const ptmFine = monthlyFeeConfig ? parseFloat(monthlyFeeConfig.ptmFine) : parseFloat(student.studentclass.ptmFine || 0);
  const buildingFund = monthlyFeeConfig ? parseFloat(monthlyFeeConfig.buildingFund) : parseFloat(student.studentclass.buildingFund || 0);
  const annualCharges = monthlyFeeConfig ? parseFloat(monthlyFeeConfig.annualCharges) : parseFloat(student.studentclass.annualCharges || 0);

  let busCharges = 0;
  if (student.station) {
    const transport = await prisma.transportFee.findUnique({ where: { station: student.station } });
    if (transport) busCharges = parseFloat(transport.amount);
  }

  const feeMonthDate = new Date(`${mName} 1, ${year}`);
  const isAdmissionMonth = feeMonthDate.getMonth() === startDate.getMonth() && 
                           feeMonthDate.getFullYear() === startDate.getFullYear();
  const currentAdmissionFee = isAdmissionMonth ? admissionFeeConfig : 0;

  const totalDemand = currentAdmissionFee + tuitionFee + examFee + computerFee + tieBeltBooks + ptmFine + buildingFund + annualCharges + busCharges;

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
      schoolBusCharges: busCharges,
      total: totalDemand,
      remaining: totalDemand,
      status: "PENDING"
    },
    include: { payments: true }
  });

  return newFee;
};
