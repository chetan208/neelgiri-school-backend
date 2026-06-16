import { prisma } from "../../lib/prisma.ts";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendOtpEmail } from "../services/emailService.js";
import generateToken from "../services/generateToken.js";

import { sendWhatsAppMessage, getWhatsAppStatus, logoutWhatsApp } from "../services/whatsappService.js";



const TeacherLogin = async (req, res) => {
    const { email, password } = req.body;
    try {
        const teacher = await prisma.teacher.findUnique({
            where: {
                email: email
            }
        });

        if(!teacher){
            return res.status(400).json({
                message: "you are not authorized to login as a teacher please contact the administrator"
            });
        }

        if(!teacher.isVerified){
            return res.status(400).json({
                message: "your account is not verified yet please wait for the administrator to verify your account"
            });
        }

        const isPasswordValid = await bcrypt.compare(password, teacher.password);

        if(!isPasswordValid){
            return res.status(400).json({
                message: "Invalid credentials"
            });
        }
         const token = await generateToken(teacher);
        res
            .cookie("token", token, {
                httpOnly: true,
                secure:true,
                sameSite: "none",
                maxAge: 30 * 24 * 60 * 60 * 1000
            })
            .status(200).json({message: "Login successful"});
        
    } catch (error) {
        console.log("error in teacher login",error);
        res.status(500).json({message: "Internal Server Error"});
    }
}

const forgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        const teacher = await prisma.teacher.findUnique({
            where: {
                email: email
            }
        });

        if(!teacher){
            return res.status(400).json({message: "Teacher not found with this email"});
        }   

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // OTP valid for 10 minutes
        await prisma.teacher.update({
            where: {
                email: email
            },
            data: {
                otp: otp,
                otpExpiry: otpExpiry,
               
            }
        });

        await sendOtpEmail(email, otp);
        res.status(200).json({message: "OTP sent to your email"});
        
    } catch (error) {
        console.log("error in forgot password",error);
        res.status(500).json({message: "Internal Server Error"});
    }
}

const resetPassword = async (req, res) => {
    const { email, otp, newPassword } = req.body;

    try {
        const teacher = await prisma.teacher.findUnique({
            where: {
                email: email
            }
        });

        if(!teacher){
            return res.status(400).json({message: "Teacher not found with this email"});
        }

        if(teacher.otp !== otp){
            return res.status(400).json({message: "Invalid  OTP"});
        }
        
        if(teacher.otpExpiry < new Date()){
            return res.status(400).json({message: "OTP has expired"});
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

         const token = await generateToken(teacher);
        await prisma.teacher.update({
            where: {
                email: email
            },
            data: {
                password: hashedPassword,
                otp: null,
                otpExpiry: null
            }
        });

        res
            .cookie("token", token, {
                httpOnly: true,
                secure:true,
                samesite: "none"
            })
            .status(200).json({message: "Password reset successful"});
    } catch (error) {
        console.log("error in reset password",error);
        res.status(500).json({message: "Internal Server Error"});
    }
}

const getmydetails = async(req,res) =>{
    const {email} = req.user;

    try {

        const teacher = await prisma.teacher.findUnique({
            where:{
                email:email
            },
            select: {
                name: true,
                email: true,
                role:true,
                imageUrl:true,
                qualification:true,
                bio:true,
                subject:true,


            }
        })

        if(!teacher){
            // in future we will search for the student also hare in this api
            return res.status(400).json({message:"teacher not found"})
        }

        return res.status(200).json({me:teacher});
        
    } catch (error) {
        console.log("error in fetching my detail" , error)
        res.status(500).json({message:"internal server error"});
    }
}

const logout = async(req,res)=>{
    try {

    res.clearCookie("token", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/" // Pure domain par se cookie clear karne ke liye
    });

    return res.status(200).json({ 
      success: true,
      message: "Logged out successfully!" 
    });
        
    } catch (error) {
        console.log("error in sign out" , error)
        return res.status(500).json({message:"internal server error"})  
    }
}




// Example Usage inside your route/controller
const notifyParent = async (req, res) => {
    const msg = `Dear Parent, Anuj has been successfully registered at Neelgiri School.`;
    
    const number ='+91 98051 69647'; // Parent's mobile number with country code    

    try {
        const result = await sendWhatsAppMessage(number, msg);
        
        if (result.success) {
            console.log("Notification sent!");
            return res.status(200).json({ success: true, message: "Notification sent successfully." });
        } else {
            console.log("Notification failed:", result.error);
            return res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error("Error in notifyParent test route:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

const getWhatsappStatusEndpoint = async (req, res) => {
    try {
        const status = getWhatsAppStatus();
        return res.status(200).json({
            success: true,
            status
        });
    } catch (error) {
        console.error("Error in getWhatsappStatusEndpoint:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

const logoutWhatsappEndpoint = async (req, res) => {
    try {
        const result = await logoutWhatsApp();
        if (result.success) {
            return res.status(200).json({
                success: true,
                message: "WhatsApp session logged out successfully."
            });
        } else {
            return res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error("Error in logoutWhatsappEndpoint:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

export { TeacherLogin, 
    forgotPassword, 
    resetPassword , 
    getmydetails,
    logout,
    notifyParent,
    getWhatsappStatusEndpoint,
    logoutWhatsappEndpoint
};