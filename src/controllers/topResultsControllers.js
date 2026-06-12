import { prisma } from "../../lib/prisma.ts";
import cloudinary from "../../config/cloudinaryImage.js";

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

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "top_results",
      });
      imageUrl = result.secure_url;
      imagePublicId = result.public_id;
    }

    const newResult = await prisma.topResult.create({
      data: {
        studentName,
        className,
        marks,
        parentsName,
        imageUrl,
        imagePublicId
      }
    });
    return res.status(201).json(newResult);
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

    if (req.file) {
      if (existingResult.imagePublicId) {
        await cloudinary.uploader.destroy(existingResult.imagePublicId);
      }

      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "top_results",
      });
      imageUrl = result.secure_url;
      imagePublicId = result.public_id;
    }

    const updatedResult = await prisma.topResult.update({
      where: { id },
      data: {
        studentName,
        className,
        marks,
        parentsName,
        imageUrl,
        imagePublicId
      }
    });
    return res.status(200).json(updatedResult);
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
      await cloudinary.uploader.destroy(existingResult.imagePublicId);
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
