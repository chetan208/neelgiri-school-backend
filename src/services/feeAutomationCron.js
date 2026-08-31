import cron from 'node-cron';
import { prisma } from '../../lib/prisma.ts';
import { ensureStudentFeeForMonth } from './feeService.js';

export const runFeeAutomation = async () => {
  try {
    console.log(`--- Monthly Fee Generation Cron Started ---`);
    
    const today = new Date();
    
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0 = Jan, 3 = Apr

    let startYear, endYear;
    if (currentMonth >= 3) { // April or later
      startYear = currentYear;
      endYear = currentYear + 1;
    } else { // Jan, Feb, March
      startYear = currentYear - 1;
      endYear = currentYear;
    }

    const sessionString = `${startYear}-${endYear.toString().slice(-2)}`; // e.g. "2026-27"
    console.log(`Calculated active session string: ${sessionString}`);

    const activeSession = await prisma.session.findUnique({ 
      where: { year: sessionString } 
    });

    if (!activeSession) {
      console.log('No active session found. Skipping fee generation.');
      return;
    }

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentMonthStr = `${monthNames[today.getMonth()]}-${today.getFullYear()}`;
    
    const allStudents = await prisma.student.findMany({
      where: { sessionId: activeSession.id },
      include: { studentclass: true } 
    });

    if (allStudents.length === 0) {
      console.log('No students found for active session.');
      return;
    }

    console.log(`Generating fee structures for ${allStudents.length} students for month: ${currentMonthStr}`);

    let generatedCount = 0;
    
    for (const student of allStudents) {
      try {
        const startDate = student.dateOfAdmission ? new Date(student.dateOfAdmission) : new Date();
        const startMonthDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const feeMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);

        if (feeMonthDate >= startMonthDate) {
          await ensureStudentFeeForMonth(student, currentMonthStr, startDate);
          generatedCount++;
        }
      } catch (err) {
        console.error(`Error generating fee for student ${student.id}:`, err);
      }
    }

    console.log(`--- Monthly Fee Generation Cron Finished (Generated/Checked for ${generatedCount} students) ---`);
  } catch (error) {
    console.error("Error in fee automation cron:", error);
  }
};

export const initFeeAutomationCron = () => {
  // Run at 00:00 (midnight) on the 1st of every month
  cron.schedule('0 0 1 * *', runFeeAutomation);
  console.log("Registered Monthly Fee Generation Cron Job (Runs on 1st of every month)");
};
