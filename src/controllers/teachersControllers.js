import {prisma} from '../../lib/prisma.ts'
import bcrypt from 'bcryptjs';
import { sendOtpEmail } from '../services/emailService.js';
import jwt from "jsonwebtoken";
import cloudinary from '../../config/cloudinaryImage.js'
import generateToken from '../services/generateToken.js';



const TeacherSingup = async (req, res) => {
    
    try {
        const {name, email, password} = req.body;

        if(!name || !email || !password){
            return res.status(400).json({message: "All fields are required"});
        }

        // check if the teacher is in the database only then authorize the teacher to login
        const existingTeacher = await prisma.teacher.findUnique({
            where: {
                email: email
            }
        });

    
        if(!existingTeacher){
            return res.status(400).json({
                message: "you are not authorized to login as a teacher please contact the administrator"
            })
        }

        if(existingTeacher.password){
            return res.status(400).json({
                message: "you are already registered and verified as a teacher please login"
            })
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        existingTeacher.password = hashedPassword;
        existingTeacher.name = name;
        existingTeacher.isVerified = false; // Set to false until OTP verification

        

        const otp = Math.floor(100000 + Math.random() * 900000).toString(); // Generate a 6-digit OTP
        existingTeacher.otp = otp; 
        existingTeacher.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // OTP valid for 10 minutes

        await prisma.teacher.update({
            where: {
                email: email
            },
            data: existingTeacher
        });

        await sendOtpEmail(email, otp);
        res.status(200).json({message: "OTP sent to your email, please verify to complete signup"});

    } catch (error) {
        console.log("error in teacher signup",error);
        res.status(500).json({message: "Internal Server Error"});
    }
}

const addTeacher = async (req, res) => {
    const {name, email, subject, phoneNumber} = req.body;

    try {
        if(!name || !email){
            return res.status(400).json({message: "All fields are required"});
        }
        const existingTeacher = await prisma.teacher.findUnique({
            where: {
                email: email
            }});

        if(existingTeacher){
            return res.status(400).json({message: "Teacher with this email already exists"});
        }

        const newTeacher = await prisma.teacher.create({
            data: {
                name,
                email,
                subject,
                phoneNumber,
                isVerified: true
            }
        });

        res.status(201).json({message: "Teacher added successfully", teacher: newTeacher});
        
    } catch (error) {
        console.log("error in adding teacher",error);
        res.status(500).json({message: "Internal Server Error"});
    }


}

const varifyOtp = async (req, res) => {
    const {email, otp} = req.body;
   
    try {

        const teacher = await prisma.teacher.findUnique({
            where: {
                email: email
            }
        });

        if(!teacher){
            return res.status(400).json({message: "Teacher not found"});
        }
        if(teacher.isVerified){
            return res.status(400).json({message: "Teacher is already verified"});
        }
        if(teacher.otp !== otp){
            return res.status(400).json({message: "Invalid OTP"});
        }
        if(teacher.otpExpiry < new Date()){
            return res.status(400).json({message: "OTP has expired"});
        }
        teacher.isVerified = true;
        teacher.otp = null;
        teacher.otpExpiry = null;

        const token = await generateToken(teacher);
        await prisma.teacher.update({
            where: {
                email: email
            },
            data: teacher
        });

        
        
        res
            .cookie('token', token, {
                 httpOnly: true,
                 secure: true,
                sameSite: "none", 
            })

            .status(200)
            .json({message: "OTP verified successfully"});          
    } catch (error) {
        console.log("error in verifying otp",error);
        res.status(500).json({message: "Internal Server Error"});
        
    }
}

const completeProfile = async (req, res) => {
    const {subject,qualification,bio} = req.body;
    const {email} = req.user; 

    try {
        const teacher = await prisma.teacher.findUnique({
            where: {
                email: email
            }
        });

        if(!teacher){
            return res.status(400).json({message: "Teacher not found"});
        }

        if(req.file){

            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: 'teacher_profiles',
                public_id: `${teacher.id}_profile`,
                overwrite: true,
            });
            
            teacher.imageUrl = result.secure_url;
            teacher.imagePublicId = result.public_id;
        }

        teacher.subject = subject;
        teacher.qualification = qualification;
        teacher.bio = bio;

        await prisma.teacher.update({
            where: {
                email: email
            },
            data: teacher
        });

        res.status(200).json({message: "Profile completed successfully"});

        
    } catch (error) {
        console.log("error in completing profile",error);
        res.status(500).json({message: "Internal Server Error"});
    }
}

const getmyProfile = async(req,res)=>{
    const {email} = req.user;

    try {
        
        const teacher = await prisma.teacher.findUnique({
            where:{
                email:email
            },
            select: {
               
                name: true,
                email: true,
                subject: true,
                qualification: true,
                bio: true,
                imageUrl: true,
                
            }
        })

        if(!teacher){
            return res.status(400).json({message: "Teacher not found"});
        }

        res.status(200).json({teacher});

        
    } catch (error) {
        console.log("error in getting profile",error);
        res.status(500).json({message: "Internal Server Error"});
    }

}

const getTeachers = async (req, res) => {
    try {
        const teachers = await prisma.teacher.findMany({
            where: {
                isVerified: true
            },
            select: {
                name: true,
                email: true,
                subject: true,
                qualification: true,
                bio: true,
                imageUrl: true,
                role:true,
                isPrincipal:true,
                phoneNumber: true
            }
        });
        res.status(200).json({teachers});
        
    } catch (error) {
        console.log("error in getting teachers",error);
        res.status(500).json({message: "Internal Server Error"});
        
    }
}

const deleteTeacher = async (req, res) => {
    const { email } = req.params;
    try {
        const teacher = await prisma.teacher.findUnique({
            where: { email }
        });
        if (!teacher) {
            return res.status(404).json({ message: "Teacher not found" });
        }
        await prisma.teacher.delete({
            where: { email }
        });
        res.status(200).json({ message: "Teacher deleted successfully" });
    } catch (error) {
        console.log("error in deleting teacher", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

const updateTeacherRole = async (req, res) => {
    const { email, role } = req.body;
    try {
        if (!email || !role) {
            return res.status(400).json({ message: "Email and Role are required" });
        }
        if (role !== "Teacher" && role !== "Admin" && role !== "Owner") {
            return res.status(400).json({ message: "Invalid role value" });
        }
        const teacher = await prisma.teacher.findUnique({
            where: { email }
        });
        if (!teacher) {
            return res.status(404).json({ message: "Teacher not found" });
        }
        const updatedTeacher = await prisma.teacher.update({
            where: { email },
            data: { role }
        });
        res.status(200).json({ message: "Teacher role updated successfully", teacher: updatedTeacher });
    } catch (error) {
        console.log("error in updating teacher role", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

export {
    TeacherSingup, 
    addTeacher, 
    varifyOtp, 
    completeProfile,
    getmyProfile,
    getTeachers,
    deleteTeacher,
    updateTeacherRole
};

