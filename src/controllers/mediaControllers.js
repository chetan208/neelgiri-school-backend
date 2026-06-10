import { prisma } from "../../lib/prisma.ts";
import cloudinary from "../../config/cloudinaryImage.js";
import { NullTypes } from "@prisma/client/runtime/client";

const uploadMedia = async (req, res) => {
  const { title, mediaType, category ,url} = req.body;
  console.log("Received media upload request:", { title, mediaType, category, url });
  if ( !mediaType || !category) {
    return res
      .status(400)
      .json({ error: "Media type and category are required." });
  }

  try {
    const categoryRecord = await prisma.category.upsert({
      where: { name: category.trim() },
      update: {},
      create: { name: category.trim() },
    });

    if (mediaType === "video") {
      const newMedia = await prisma.mediaGallery.create({
        data: {
          title,
          mediaType,
          url,
          publicId:null,
          categoryId: categoryRecord.id,
        },

        include: {
          category: true,
        },
      });

      return res.status(201).json(newMedia);
    }

    if (mediaType === "image") {

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: "No images uploaded." });
        } 
        // upload each image to Cloudinary and save the media record in the database
        const uploadedMedia = [];
        for (const file of req.files) {
            const result = await cloudinary.uploader.upload(file.path, {
                folder: "media_gallery",
            });
            uploadedMedia.push(result);
        }

        const mediaRecords = await Promise.all(uploadedMedia.map(async (media) => {
            return await prisma.mediaGallery.create({
                data: {
                    title,
                    mediaType,
                    url: media.secure_url,
                    publicId: media.public_id,
                    categoryId: categoryRecord.id,
                },
                include: {
                    category: true,
                },
            });
        }));

        return res.status(201).json(mediaRecords);

    } else {
        return res.status(400).json({ error: "Invalid media type." });
    }   

  } catch (error) {
    console.error("Error uploading media:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while uploading the media." });
  }
};

const deleteMedia = async (req, res) => {
    const {ids} = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No media IDs provided for deletion." });
    }

    try {
        // agr delete krne k baad media nhi bchti hai to automatically category delete kr dena chahiye
        const mediaToDelete = await prisma.mediaGallery.findMany({
            where: {
                id: {
                    in: ids,
                },
            },
        });

        // check if media is image and delete from cloudinary
        for (const media of mediaToDelete) {
            if (media.mediaType === "image" && media.publicId) {
                await cloudinary.uploader.destroy(media.publicId);
                
                await prisma.mediaGallery.delete({
                    where: {
                        id: media.id,
                    },
                });


            }

            if (media.mediaType === "video") {
                await prisma.mediaGallery.delete({
                    where: {
                        id: media.id,
                    },
                });
            }
        }
        
        // check if category has any media left, if not delete the category
        const categoryIds = [...new Set(mediaToDelete.map(media => media.categoryId))];
        for (const categoryId of categoryIds) {
            const mediaCount = await prisma.mediaGallery.count({
                where: {
                    categoryId,
                },
            });
            if (mediaCount === 0) {
                await prisma.category.delete({
                    where: {
                        id: categoryId,
                    },
                });
            }
        }

        return res.status(200).json({ message: "Media deleted successfully." });

    } catch (error) {
        console.error("Error deleting media:", error);
        return res.status(500).json({ error: "An error occurred while deleting the media." });
    }
    }


const getMediaByPage = async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    try {
        const mediaItems = await prisma.mediaGallery.findMany({
            skip: offset,
            take: parseInt(limit),
            include: {
                category: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        const totalItems = await prisma.mediaGallery.count();
        const totalPages = Math.ceil(totalItems / limit);
        
        return res.status(200).json({ mediaItems, totalItems, totalPages });
    } catch (error) {
        console.error("Error fetching media:", error);
        return res.status(500).json({ error: "An error occurred while fetching the media." });
    }
}

const getCategories = async (req, res) => {
    try {
        const categories = await prisma.category.findMany();
        return res.status(200).json(categories);
    } catch (error) {
        console.error("Error fetching categories:", error);
        return res.status(500).json({ error: "An error occurred while fetching the categories." });
    }
}   

export { uploadMedia, deleteMedia, getMediaByPage, getCategories };