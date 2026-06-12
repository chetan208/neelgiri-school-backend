import { prisma } from "../../lib/prisma.ts";
import { sendContectUsEmail } from "../services/emailService.js";


const contactus = async (req,res)=>{
    try {
        const { name, email, message , phoneNumber } = req.body;

        try {
            await sendContectUsEmail(name, phoneNumber, email, message);
            await prisma.contactUs.create({
                data: {
                    name,
                    email,
                    phoneNumber,
                    message,
                },
            })
            res.status(200).json({ message: 'Contact form submitted successfully' });
        } catch (error) {
            console.error('Error sending contact email:', error);
            res.status(500).json({ message: 'Error submitting contact form' });
        }

        
    } catch (error) {
        res.status(500).json({ message: 'Error submitting contact form' });
    }
}

const getContactUsMessages = async (req, res) => {
    try {
        const messages = await prisma.contactUs.findMany();
        res.status(200).json(messages);
    } catch (error) {
        console.error('Error fetching contact messages:', error);
        res.status(500).json({ message: 'Error fetching contact messages' });
    }
}

const deleteContactUsMessage = async (req, res) => {
    const {ids} = req.body;
    try {
        await prisma.contactUs.deleteMany({
            where: {
                id: {
                    in: ids,
                },
            },
        });
        res.status(200).json({ message: 'Contact messages deleted successfully' });
    }catch (error) {
        console.error('Error deleting contact messages:', error);
        res.status(500).json({ message: 'Error deleting contact messages' });
    }
}

export { contactus, getContactUsMessages, deleteContactUsMessage };