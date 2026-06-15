import { prisma } from "../../lib/prisma.ts";
import cloudinary, { cloud1Config, cloud2Config } from "../../config/cloudinaryImage.js";

let useFirstResultCloud = true;

export const getTopResults = async (req, res) => {
  try {
    const results = await prisma.topResult.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
    return res.status(200).json(results);
  } catch (error) {
    console.error("Error fetching top results:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const createTopResult = async (req, res) => {
  const { studentName, className, marks, parentsName } = req.body;

  if (!studentName || !className || !marks || !parentsName) {
    return res.status(400).json({ error: "All text fields are required" });
  }

  try {
    let imageUrl = null;
    let imagePublicId = null;
    let cloudName = null;
    let uploadedConfig = null;

    if (req.file) {
      const currentConfig = useFirstResultCloud ? cloud1Config : cloud2Config;
      useFirstResultCloud = !useFirstResultCloud;
      uploadedConfig = currentConfig;

      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "top_results",
        ...currentConfig
      });
      imageUrl = result.secure_url;
      imagePublicId = result.public_id;
      cloudName = currentConfig.cloud_name;
    }

    try {
      const newResult = await prisma.topResult.create({
        data: {
          studentName,
          className,
          marks,
          parentsName,
          imageUrl,
          imagePublicId,
          cloudName
        }
      });
      return res.status(201).json(newResult);
    } catch (dbError) {
      if (imagePublicId) {
        console.log("DB update failed. Rolling back Cloudinary upload...");
        await cloudinary.uploader.destroy(imagePublicId, { ...uploadedConfig });
      }
      throw dbError;
    }
  } catch (error) {
    console.error("Error creating top result:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const updateTopResult = async (req, res) => {
  const { id } = req.params;
  const { studentName, className, marks, parentsName } = req.body;

  try {
    const existingResult = await prisma.topResult.findUnique({
      where: { id }
    });

    if (!existingResult) {
      return res.status(404).json({ error: "Top result not found" });
    }

    let imageUrl = existingResult.imageUrl;
    let imagePublicId = existingResult.imagePublicId;
    let cloudName = existingResult.cloudName;
    let uploadedConfig = null;
    let newlyUploadedPublicId = null;

    if (req.file) {
      if (existingResult.imagePublicId) {
        let deleteConfig = cloud1Config;
        if (existingResult.cloudName === cloud2Config.cloud_name) {
            deleteConfig = cloud2Config;
        }
        await cloudinary.uploader.destroy(existingResult.imagePublicId, { ...deleteConfig });
      }

      const currentConfig = useFirstResultCloud ? cloud1Config : cloud2Config;
      useFirstResultCloud = !useFirstResultCloud;
      uploadedConfig = currentConfig;

      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "top_results",
        ...currentConfig
      });
      imageUrl = result.secure_url;
      imagePublicId = result.public_id;
      cloudName = currentConfig.cloud_name;
      newlyUploadedPublicId = result.public_id;
    }

    try {
      const updatedResult = await prisma.topResult.update({
        where: { id },
        data: {
          studentName,
          className,
          marks,
          parentsName,
          imageUrl,
          imagePublicId,
          cloudName
        }
      });
      return res.status(200).json(updatedResult);
    } catch (dbError) {
      if (newlyUploadedPublicId) {
        console.log("DB update failed. Rolling back Cloudinary upload...");
        await cloudinary.uploader.destroy(newlyUploadedPublicId, { ...uploadedConfig });
      }
      throw dbError;
    }
  } catch (error) {
    console.error("Error updating top result:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const deleteTopResult = async (req, res) => {
  const { id } = req.params;

  try {
    const existingResult = await prisma.topResult.findUnique({
      where: { id }
    });

    if (!existingResult) {
      return res.status(404).json({ error: "Top result not found" });
    }

    if (existingResult.imagePublicId) {
      let deleteConfig = cloud1Config;
      if (existingResult.cloudName === cloud2Config.cloud_name) {
          deleteConfig = cloud2Config;
      }
      await cloudinary.uploader.destroy(existingResult.imagePublicId, { ...deleteConfig });
    }

    await prisma.topResult.delete({
      where: { id }
    });
    return res.status(200).json({ message: "Top result deleted successfully" });
  } catch (error) {
    console.error("Error deleting top result:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
