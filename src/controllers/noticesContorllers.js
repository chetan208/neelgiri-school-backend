import {prisma } from "../../lib/prisma.ts";
import cloudinary from "../../config/cloudinaryPdf.js";

const createNotice = async (req, res) => {
    const {type,title,description} = req.body;

    try {

        // File upload handling
        let documentUrl = null;
        let documentPublicId = null;
        if (req.file) {
            // File type check kar rahe hain
            const isPdf = req.file.mimetype === 'application/pdf';

            const result = await cloudinary.uploader.upload(req.file.path, {
                // PDF ke liye 'raw', baaki (images) ke liye 'image'
                resource_type: isPdf ? "auto" : "image",
                folder: "notices",
                access_mode: "public",
                // Agar PDF hai toh original extension ke sath save karega
                ...(isPdf && { public_id: req.file.originalname }) 
            });
            
            documentUrl = result.secure_url;
            documentPublicId = result.public_id;
        }

        
        const newNotice = await prisma.notice.create({
            data: {
                type,
                title,
                description,
                documentUrl,
                documentPublicId
            }
        });
        res.status(201).json(newNotice);

    } catch (error) {
        console.error("Error creating notice:", error);
        res.status(500).json({ message: "Internal server error" });
    }
    
}

const getNotices = async (req, res) => {
  // Query se page number lein, default page 1 hoga
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const skip = (page - 1) * limit;

  try {
    const notices = await prisma.notice.findMany({
      take: limit, // Sirf 10 notices
      skip: skip,  // Kitne skip karne hain (Page 1 ke liye 0, Page 2 ke liye 20)
      orderBy: {
        updatedAt: 'desc', // Latest notices pehle aayenge
      },
    });

    res.status(200).json(notices);
  } catch (error) {
    console.error("Error fetching notices:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateNotice = async (req, res) => {
    const { id } = req.params;
    const { type, title, description } = req.body;

    try {

        const existingNotice = await prisma.notice.findUnique({
            where: { id: parseInt(id) }
        });

        
        
        if(req.file) {
            // delete the existing document from Cloudinary
            const existingNotice = await prisma.notice.findUnique({
                where: { id: parseInt(id) }
            });
            if (existingNotice && existingNotice.documentPublicId) {
                await cloudinary.uploader.destroy(existingNotice.documentPublicId, {
                    resource_type: 'raw'
                });
            }

            // upload the new document to Cloudinary
            const isPdf = req.file.mimetype === 'application/pdf';
            const result = await cloudinary.uploader.upload(req.file.path, {
                resource_type: isPdf ? "auto" : "image",
                folder: "notices",
                access_mode: "public",
                ...(isPdf && { public_id: req.file.originalname }) 
            });

            // update the notice with new document details
            await prisma.notice.update({
                where: { id: parseInt(id) },
                data: {
                    documentUrl: result.secure_url,
                    documentPublicId: result.public_id
                }
            });
        }
        const updatedNotice = await prisma.notice.update({
            where: { id: parseInt(id) },
            data: {
                type,
                title,
                description
            }
        });
        res.status(200).json(updatedNotice);
    } catch (error) {
        console.log("Error updating notice:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

const deleteNotice = async (req, res) => {
    const { id } = req.params;

    try {

        const existingNotice = await prisma.notice.findUnique({
            where: { id: parseInt(id) }
        });

        if (existingNotice && existingNotice.documentPublicId) {
            await cloudinary.uploader.destroy(existingNotice.documentPublicId, {
                resource_type: 'raw'
            });
        }
        await prisma.notice.delete({
            where: { id: parseInt(id) }
        });
        res.status(200).json({ message: "Notice deleted successfully" });
        
    } catch (error) {
        console.log("Error deleting notice:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

export {createNotice,getNotices,updateNotice,deleteNotice}