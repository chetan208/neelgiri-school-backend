import cloudinary from "../../config/cloudinaryPdf.js";
import { prisma } from "../../lib/prisma.ts";


const uploadPYQ = async (req, res) => {
        const {className} = req.params;
        const file = req.file;
        const {year,subject,term} = req.body;

        if(!file){
            return res.status(400).json({message: "No file uploaded"});
        }

        try {

          

            const result = await cloudinary.uploader.upload(file.path, {
                folder: `PYQs/${className}`,
                public_id: `${className}_${Date.now()}`,
            });

            const pyq = await prisma.pYQ.create({
                data: {
                    className: className,
                    fileUrl: result.secure_url,
                    filePublicId: result.public_id,
                    year: year,
                    subject: subject,
                    term: term
                }
            });


            res.status(200).json({message: "PYQ uploaded successfully", pyq});
        } catch (error) {
            console.log("error in uploading PYQ",error);
            res.status(500).json({message: "Internal Server Error"});
        }
}

const getPYQs = async (req, res) => {
    const {className} = req.params;


    try {
        const pyqs = await prisma.pYQ.findMany({
            where: {
                className: className
            },
            select:{
                id: true,
                fileUrl: true,
                year: true,
                subject: true,
                term: true,
                className: true
            }
        });
        res.status(200).json({pyqs});  
    } catch (error) {
        console.log("error in fetching PYQs",error);
        res.status(500).json({message: "Internal Server Error"});
    }
}

const deletePYQ = async (req, res) => {
    const {id} = req.params;

    const idNum = parseInt(id);

    try {
        const pyq = await prisma.pYQ.findUnique({
            where: {
                id: idNum
            }
        });
        if(!pyq){
            return res.status(404).json({message: "PYQ not found"});
        }

        // delete from cloudinary
        await cloudinary.uploader.destroy(pyq.filePublicId);

        await prisma.pYQ.delete({
            where: {
                id: idNum
            }
        });
        res.status(200).json({message: "PYQ deleted successfully"});

    } catch (error) {
        console.log("error in deleting PYQ",error);
        res.status(500).json({message: "Internal Server Error"});
    }

    
}

export {uploadPYQ, getPYQs, deletePYQ};