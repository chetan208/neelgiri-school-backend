import cron from 'node-cron';
import { prisma } from '../../lib/prisma.ts';
import { sendWhatsAppMessage } from './whatsappService.js';
import { ensureStudentFeeForMonth } from './feeService.js';

export const runFeeAutomation = async () => {
  try {
    console.log('--- Fee Automation Cron Started ---');
    const settings = await prisma.feeAutomationSetting.findUnique({
      where: { id: "singleton" }
    });

    if (!settings || !settings.isEnabled) {
      console.log('Fee automation is disabled or not configured.');
      return;
    }

    const today = new Date();
    const currentDay = today.getDate();
    
    const dayDiff = currentDay - settings.startDay;
    
    // Check if we are within the processing window
    if (dayDiff < 0 || dayDiff >= settings.windowDays) {
      console.log(`Current day ${currentDay} is outside the active window (Start: ${settings.startDay}, Window: ${settings.windowDays} days).`);
      return;
    }

    const activeSession = await prisma.session.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!activeSession) {
      console.log('No active session found.');
      return;
    }

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentMonthStr = `${monthNames[today.getMonth()]}-${today.getFullYear()}`;
    
    const totalStudents = await prisma.student.count({ where: { sessionId: activeSession.id } });
    if (totalStudents === 0) {
      console.log('No students found for active session.');
      return;
    }

    // Expected proportion for today
    const expectedProcessedCount = Math.ceil(totalStudents * ((dayDiff + 1) / settings.windowDays));

    const alreadyProcessed = await prisma.feeAutomationLog.count({
      where: { monthStr: currentMonthStr }
    });

    const numberToProcessToday = expectedProcessedCount - alreadyProcessed;
    if (numberToProcessToday <= 0) {
      console.log(`Already processed expected quota for today. Total so far: ${alreadyProcessed}/${totalStudents}`);
      return;
    }

    console.log(`Processing up to ${numberToProcessToday} students today.`);

    const logs = await prisma.feeAutomationLog.findMany({
      where: { monthStr: currentMonthStr },
      select: { studentId: true }
    });
    const processedIds = new Set(logs.map(l => l.studentId));

    const allStudents = await prisma.student.findMany({
      where: { sessionId: activeSession.id },
      include: { studentclass: true }
    });

    const pendingStudents = allStudents.filter(s => !processedIds.has(s.id));
    const processCount = Math.min(numberToProcessToday, pendingStudents.length);

    for (let i = 0; i < processCount; i++) {
      const student = pendingStudents[i];
      
      try {
        const startDate = student.dateOfAdmission ? new Date(student.dateOfAdmission) : new Date();
        const startMonthDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const feeMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);

        console.log(`\n👉 Processing student: ${student.name} (ID: ${student.id})`);
        
        if (feeMonthDate >= startMonthDate) {
          console.log(`  - Generating/Checking fee for month: ${currentMonthStr}...`);
          const fee = await ensureStudentFeeForMonth(student, currentMonthStr, startDate);

          console.log(`  - Fetching pending/partially paid fees from database...`);

          const allPendingFees = await prisma.feeStructure.findMany({
            where: {
              studentId: student.id,
              status: { in: ["PENDING", "PARTIALLY_PAID"] }
            },
            include: { payments: true }
          });

          console.log(`  - Found ${allPendingFees.length} pending fees.`);

          if (allPendingFees.length > 0) {
            const parentName = student.fatherName || "Parent";
            let totalDues = 0;
            let breakdownMsg = "";

            const parseMonthStr = (str) => {
              const [mName, year] = str.split("-");
              return new Date(`${mName} 1, ${year}`);
            };
            allPendingFees.sort((a, b) => parseMonthStr(a.month) - parseMonthStr(b.month));

            for (const pendingFee of allPendingFees) {
              const total = parseFloat(pendingFee.total || pendingFee.totalDemand || 0);
              const paid = pendingFee.payments?.reduce((sum, p) => sum + (parseFloat(p.amountPaid) || 0), 0) || 0;
              const rem = Math.round((total - paid) * 100) / 100;
              
              console.log(`    -> Month: ${pendingFee.month} | Total: ${total} | Paid: ${paid} | Remaining: ${rem}`);
              
              if (rem > 0) {
                totalDues = Math.round((totalDues + rem) * 100) / 100;
                breakdownMsg += `• ${pendingFee.month}: Rs. ${rem}\n`;
              }
            }

            console.log(`  - Total calculated dues for WhatsApp message: Rs. ${totalDues}`);

            if (totalDues > 0) {
              let msg = `Dear ${parentName},\n\nThis is a gentle reminder regarding the fee for ${student.name} (${student.studentclass.className}).\n\n`;
              
              if (allPendingFees.length === 1 && allPendingFees[0].month === currentMonthStr) {
                msg += `The fee for the current month (${currentMonthStr}) has been generated. The remaining amount is Rs. ${totalDues}.\n\n`;
              } else {
                msg += `You have outstanding dues of Rs. ${totalDues}. Here is the month-by-month breakdown:\n\n${breakdownMsg}\n`;
              }
              
              msg += `Please clear the dues at your earliest convenience.\n\nRegards,\nNeelgiri Public School`;
              
              console.log(`  - 🚀 Sending WhatsApp message to: ${student.contactNo}`);
              const sendResult = await sendWhatsAppMessage(student.contactNo, msg);
              
              if (!sendResult.success) {
                console.log(`  - ❌ Message sending failed: ${sendResult.error}`);
                throw new Error(`WhatsApp Failed: ${sendResult.error}`);
              }
              
              console.log(`  - ✅ WhatsApp message sent! Waiting 10 seconds for rate limit...`);
              
              // Sleep for 10 seconds to avoid WhatsApp rate limiting
              await new Promise(resolve => setTimeout(resolve, 10000));
            }
          }
        }

        await prisma.feeAutomationLog.create({
          data: {
            studentId: student.id,
            monthStr: currentMonthStr,
            status: "PROCESSED"
          }
        });
        console.log(`  - 📝 Logged in FeeAutomationLog as PROCESSED`);
        
      } catch (err) {
        console.error(`Error processing automation for student ${student.id}:`, err);
      }
    }

    console.log('--- Fee Automation Cron Finished ---');
  } catch (error) {
    console.error("Error in fee automation cron:", error);
  }
};

export const initFeeAutomationCron = () => {
  // Run every day at 10:00 AM
  cron.schedule('0 10 * * *', runFeeAutomation);
};
