import dotenv from "dotenv";
dotenv.config();
import { v2 as cloudinary } from "cloudinary";

export const cloudPdf1Config = {
  cloud_name: process.env.CLOUDINARY_PDF_CLOUD_NAME_1,
  api_key: process.env.CLOUDINARY_PDF_API_KEY_1,
  api_secret: process.env.CLOUDINARY_PDF_API_SECRET_1,
};

export const cloudPdf2Config = {
  cloud_name: process.env.CLOUDINARY_PDF_CLOUD_NAME_2,
  api_key: process.env.CLOUDINARY_PDF_API_KEY_2,
  api_secret: process.env.CLOUDINARY_PDF_API_SECRET_2,
};

export default cloudinary;
