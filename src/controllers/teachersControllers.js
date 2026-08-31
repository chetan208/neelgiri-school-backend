import {prisma} from '../../lib/prisma.ts'
import bcrypt from 'bcryptjs';
import { sendOtpEmail, sendWelcomeEmail } from '../services/emailService.js';
import cloudinary, { cloud1Config, cloud2Config } from '../../config/cloudinaryImage.js'
import generateToken from '../services/generateToken.js';

let useFirstTeacherCloud = true;



const TeacherSingup = async (req, res) => {
    
    try {
        const {name, email} = req.body;

        if(!name || !email){
            return res.status(400).json({message: "Name and email are required"});
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

        

        existingTeacher.name = name;
        existingTeacher.isVerified = false; // Set to false until OTP verification

        

        const otp = Math.floor(100000 + Math.random() * 900000).toString(); // Generate a 6-digit OTP
        existingTeacher.otp = otp; 
        existingTeacher.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // OTP valid for 10 minutes

        const { id, ...updateData } = existingTeacher;
        await prisma.teacher.update({
            where: {
                email: email
            },
            data: updateData
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

        await sendWelcomeEmail(email, name);

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
        const { id: teacherId, ...updateDataOtp } = teacher;
        await prisma.teacher.update({
            where: {
                email: email
            },
            data: updateDataOtp
        });

        
        
        res
            .cookie('token', token, {
                 httpOnly: true,
                 secure: true,
                sameSite: "none", 
                maxAge: 30 * 24 * 60 * 60 * 1000
            })

            .status(200)
            .json({message: "OTP verified successfully"});          
    } catch (error) {
        console.log("error in verifying otp",error);
        res.status(500).json({message: "Internal Server Error"});
        
    }
}

const completeProfile = async (req, res) => {
    const {subject,qualification,bio,password} = req.body;
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

        let uploadedResult = null;
        let uploadedConfig = null;

        if(req.file){
            if (teacher.imagePublicId) {
                let deleteConfig = cloud1Config;
                if (teacher.cloudName === cloud2Config.cloud_name) {
                    deleteConfig = cloud2Config;
                }
                await cloudinary.uploader.destroy(teacher.imagePublicId, {
                    ...deleteConfig
                });
            }

            const currentConfig = useFirstTeacherCloud ? cloud1Config : cloud2Config;
            useFirstTeacherCloud = !useFirstTeacherCloud;

            uploadedConfig = currentConfig;
            uploadedResult = await cloudinary.uploader.upload(req.file.path, {
                folder: 'teacher_profiles',
                public_id: `${teacher.id}_profile_${Date.now()}`,
                overwrite: true,
                ...currentConfig
            });
            
            teacher.imageUrl = uploadedResult.secure_url;
            teacher.imagePublicId = uploadedResult.public_id;
            teacher.cloudName = currentConfig.cloud_name;
        }

        teacher.subject = subject;
        teacher.qualification = qualification;
        teacher.bio = bio;
        
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            teacher.password = hashedPassword;
        }

        const { id: tId, createdAt, ...updateDataProfile } = teacher;

        try {
            await prisma.teacher.update({
                where: {
                    email: email
                },
                data: updateDataProfile
            });
        } catch (dbError) {
            // Database update failed. Rollback Cloudinary upload if one was just performed.
            if (uploadedResult) {
                console.log("Database update failed. Rolling back Cloudinary upload...");
                await cloudinary.uploader.destroy(uploadedResult.public_id, {
                    ...uploadedConfig
                });
            }
            throw dbError; // throw it so the outer catch can handle it
        }

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
                isVerified: true,
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

        if (teacher.imagePublicId) {
            let deleteConfig = cloud1Config;
            if (teacher.cloudName === cloud2Config.cloud_name) {
                deleteConfig = cloud2Config;
            }
            await cloudinary.uploader.destroy(teacher.imagePublicId, {
                ...deleteConfig
            });
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

