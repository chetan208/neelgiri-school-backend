import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { 
  authRoutes,
  herostatsRoutes,
  noticesRoutes,
  PYQsRoute,
  teacherRoutes 
  
  } from './routes/index.js';


import cookieParser from 'cookie-parser';



const app = express();


app.use(express.json());
app.use(cookieParser());

app.use(express.urlencoded({ extended: true }));

app.use(cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
}));


app.get('/', (req, res) => {
  res.send('Hello, World!');
});



app.use('/api/teachers', teacherRoutes);
app.use('/api/school-stats', herostatsRoutes);
app.use('/api/notices', noticesRoutes);
app.use('/api/auth',authRoutes);
app.use('/api/pyqs', PYQsRoute);

const PORT = process.env.PORT;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});