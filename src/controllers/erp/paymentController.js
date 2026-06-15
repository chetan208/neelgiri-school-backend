import { prisma } from "../../../lib/prisma.ts";
import { sendWhatsAppMessage } from "../../services/whatsappService.js";

const makePayment = async (req, res) => {
  try {
    const { studentId, amountPaid, paymentMode } = req.body;

    // 1. Validation Check
    if (!studentId || amountPaid === undefined || !paymentMode) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields (studentId, amountPaid, paymentMode)" 
      });
    }

    let remainingPayment = parseFloat(amountPaid);
    if (remainingPayment <= 0) {
      return res.status(400).json({ success: false, message: "Payment amount must be greater than 0" });
    }

    // 2. Student ke saare unpaid/partially paid records nikalna (Oldest First)
    let unpaidRecords = await prisma.feeStructure.findMany({
      where: {
        studentId: studentId,
        status: { in: ["PENDING", "PARTIALLY_PAID"] }
      }
    });

    if (unpaidRecords.length === 0) {
      return res.status(400).json({ success: false, message: "No pending or unpaid fees found for this student." });
    }

    // Helper: Month string ko date me convert krke sort krne ke liye
    const parseMonthStr = (str) => {
      const [mName, year] = str.split("-");
      return new Date(`${mName} 1, ${year}`);
    };

    // Purane mahine sabse pehle (FIFO Sorting)
    unpaidRecords.sort((a, b) => parseMonthStr(a.month) - parseMonthStr(b.month));

    const processedPayments = [];

    // 3. Safe Database Transaction
    await prisma.$transaction(async (tx) => {
      
      for (let feeRecord of unpaidRecords) {
        if (remainingPayment <= 0) break; // Agar paisa khatam ho gaya toh loop rok do

        const totalDemand = parseFloat(feeRecord.total);
        
        const previousPayments = await tx.payment.aggregate({
          where: { feeStructureId: feeRecord.id },
          _sum: { amountPaid: true }
        });
        
        const totalAlreadyPaid = parseFloat(previousPayments._sum.amountPaid || 0);
        const actualDueForThisMonth = totalDemand - totalAlreadyPaid;

        let amountToAllocate = 0;
        let newStatus = "PENDING";

        if (remainingPayment >= actualDueForThisMonth) {
          amountToAllocate = actualDueForThisMonth;
          remainingPayment -= actualDueForThisMonth;
          newStatus = "PAID";
        } else {
          amountToAllocate = remainingPayment;
          remainingPayment = 0; // Saara paisa khatam
          newStatus = "PARTIALLY_PAID";
        }

        const balanceLeftForThisMonth = actualDueForThisMonth - amountToAllocate;

        // A. Update Fee Structure Status and Remaining Balance
        await tx.feeStructure.update({
          where: { id: feeRecord.id },
          data: { 
            status: newStatus,
            remaining: balanceLeftForThisMonth
          }
        });

        // B. Create Entry in Payment Table for history tracking
        await tx.payment.create({
          data: {
            feeStructureId: feeRecord.id,
            amountPaid: amountToAllocate,
            balanceLeft: balanceLeftForThisMonth,
            paymentMode: paymentMode
          }
        });

        processedPayments.push({
          month: feeRecord.month,
          allocatedAmount: amountToAllocate,
          monthStatus: newStatus,
          monthBalanceLeft: balanceLeftForThisMonth,
          feeStructureId: feeRecord.id
        });
      }
    
    });

    // send whatsapp message to parent about payment
    try {
      const student = await prisma.student.findUnique({
        where: { id: studentId }
      });

      if (student && student.contactNo) {
        // Fetch ALL fee structures for this student to find the absolute latest month
        const allFeeStructuresForReceipt = await prisma.feeStructure.findMany({
          where: { studentId: studentId }
        });
        
        // Helper to sort months
        const parseMonthStrGlobal = (str) => {
          const [mName, year] = str.split("-");
          return new Date(`${mName} 1, ${year}`);
        };

        let latestFeeStructureId = null;
        if (allFeeStructuresForReceipt.length > 0) {
          allFeeStructuresForReceipt.sort((a, b) => parseMonthStrGlobal(a.month) - parseMonthStrGlobal(b.month));
          latestFeeStructureId = allFeeStructuresForReceipt[allFeeStructuresForReceipt.length - 1].id;
        }

        // Fetch all pending/partially paid fee structures to calculate the remaining balances
        const remainingFeeStructures = await prisma.feeStructure.findMany({
          where: {
            studentId: studentId,
            status: { in: ["PENDING", "PARTIALLY_PAID"] }
          },
          include: {
            payments: true
          }
        });

        // Sort by oldest month first (FIFO)
        remainingFeeStructures.sort((a, b) => parseMonthStr(a.month) - parseMonthStr(b.month));

        let totalRemaining = 0;
        const breakdowns = [];

        for (const fs of remainingFeeStructures) {
          const total = parseFloat(fs.total || 0);
          const totalPaid = fs.payments.reduce((sum, p) => sum + parseFloat(p.amountPaid || 0), 0);
          const monthRemaining = total - totalPaid;
          if (monthRemaining > 0) {
            totalRemaining += monthRemaining;
            breakdowns.push(`- ${fs.month}: ₹${monthRemaining.toFixed(2)} pending`);
          }
        }

        let whatsappMsg = `Dear Parent,\n\n`;
        whatsappMsg += `We have received a fee payment of ₹${parseFloat(amountPaid).toFixed(2)} (via ${paymentMode}) for student ${student.name} (Card No: ${student.cardNo}).\n\n`;
        
        if (latestFeeStructureId) {
          whatsappMsg += `View/Print Digital Invoice: ${process.env.FRONTEND_URL}/receipt/${latestFeeStructureId}\n\n`;
        }

        if (totalRemaining > 0) {
          whatsappMsg += `The overall remaining balance is ₹${totalRemaining.toFixed(2)}.\n\n`;
          whatsappMsg += `Pending Month Breakdown:\n${breakdowns.join("\n")}\n\n`;
        } else {
          whatsappMsg += `All pending fees have been fully paid. Your remaining balance is ₹0.00.\n\n`;
        }
        
        whatsappMsg += `Thank you,\nNeelgiri School Administration`;

        // Send the WhatsApp message asynchronously
        sendWhatsAppMessage(student.contactNo, whatsappMsg)
          .then(result => {
            if (result.success) {
              console.log(`WhatsApp fee payment notification successfully sent to ${student.contactNo}`);
            } else {
              console.error(`WhatsApp fee payment notification failed for ${student.contactNo}:`, result.error);
            }
          })
          .catch(err => {
            console.error("Error sending WhatsApp notification:", err);
          });
      }
    } catch (whatsappError) {
      console.error("Error processing WhatsApp fee notification:", whatsappError);
    }

    return res.status(200).json({
      success: true,
      message: "Payment distributed sequentially across pending months.",
      changeReturned: remainingPayment,
      details: processedPayments
    });

  } catch (error) {
    console.error("Error in makePayment waterfall:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const getPublicReceipt = async (req, res) => {
  try {
    const { feeStructureId } = req.params;

    const fee = await prisma.feeStructure.findUnique({
      where: { id: feeStructureId },
      include: {
        student: true,
        payments: true
      }
    });

    if (!fee) {
      return res.status(404).json({ success: false, message: "Receipt not found" });
    }

    const allFees = await prisma.feeStructure.findMany({
      where: {
        studentId: fee.studentId,
        student: {
          sessionId: fee.student.sessionId
        }
      },
      include: {
        payments: true
      }
    });

    return res.status(200).json({
      success: true,
      student: fee.student,
      fee,
      allFees
    });
  } catch (error) {
    console.error("Error in getPublicReceipt:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export { makePayment, getPublicReceipt };
