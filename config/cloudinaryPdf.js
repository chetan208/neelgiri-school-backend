import dotenv from "dotenv";
dotenv.config();
import { v2 as cloudinary } from "cloudinary";


cloudinary.config({
  cloud_name: process.env.CLOUDINARY_PDF_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_PDF_API_KEY,
  api_secret: process.env.CLOUDINARY_PDF_API_SECRET,
});



export default cloudinary;
