import { prisma } from "../../lib/prisma.ts"
import { nanoid } from 'nanoid';

const openAdmissions = async (req, res) => {
    const { year } = req.body;
    if (!year) {
        return res.status(400).json({ message: "Year is required" });
    }
    try {
        const activeAdmission = await prisma.admissionSetting.findFirst({
            where: { isOpen: true }
        });

        if (activeAdmission) {
            return res.status(400).json({ message: `Admission is already open for year ${activeAdmission.activeYear} please close it before opening a new one` });
        }

        const existingAdmission = await prisma.admissionSetting.findFirst({
            where: { activeYear: year }
        });

        if (existingAdmission) {
            await prisma.admissionSetting.update({
                where: { id: existingAdmission.id },
                data: { isOpen: true }
            });

            // Auto-generate notice
            await prisma.notice.create({
                data: {
                    type: "Academic",
                    title: `Admissions Open for Session ${year}`,
                    description: `We are pleased to announce that online admissions for the academic session ${year} at Neelgiri Public Sen. Sec. School are now open! Parents and prospective students can submit their registration applications online.`,
                    documentUrl: "custom:admissions",
                    documentPublicId: "admissions-auto"
                }
            });

            return res.status(200).json({ message: `Admission opened successfully for year ${year}` });
        }

        const newAdmission = await prisma.admissionSetting.create({
            data: {
                activeYear: year,
                isOpen: true
            }
        });

        // Auto-generate notice
        await prisma.notice.create({
            data: {
                type: "Academic",
                title: `Admissions Open for Session ${year}`,
                description: `We are pleased to announce that online admissions for the academic session ${year} at Neelgiri Public Sen. Sec. School are now open! Parents and prospective students can submit their registration applications online.`,
                documentUrl: "custom:admissions",
                documentPublicId: "admissions-auto"
            }
        });

        return res.status(201).json({ message: "Admission opened successfully", admission: newAdmission });
    } catch (error) {
        console.log("error in open admissions", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

const closeAdmissions = async (req, res) => {
    const { year } = req.body;
    if (!year) {
        return res.status(400).json({ message: "Year is required" });
    }

    try {
        const existingAdmission = await prisma.admissionSetting.findFirst({
            where: { activeYear: year }
        });

        if (!existingAdmission) {
            return res.status(404).json({ message: "Admission for this year not found" });
        }

        await prisma.admissionSetting.update({
            where: { id: existingAdmission.id },
            data: { isOpen: false }
        });

        // Auto-generate notice
        await prisma.notice.create({
            data: {
                type: "Academic",
                title: `Admissions Closed for Session ${year}`,
                description: `Please note that online admissions for the academic session ${year} at Neelgiri Public Sen. Sec. School are now officially closed. We thank all applicants for their interest and submissions.`,
                documentUrl: "#",
                documentPublicId: "admissions-auto"
            }
        });

        return res.status(200).json({ message: `Admission closed successfully for year ${year}` });
    } catch (error) {
        console.log("error in close admissions", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

const SubmitAdmissionForm = async (req, res) => {
    const {
        studentName,
        FatherName,
        MotherName,
        dob,
        targetClass,
        address,
        phoneNumber,
        email,
    } = req.body;

    if (!studentName || !FatherName || !MotherName || !dob || !targetClass || !address || !phoneNumber) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        const activeAdmission = await prisma.admissionSetting.findFirst({
            where: { isOpen: true }
        });
        if (!activeAdmission) {
            return res.status(404).json({ message: "Admissions are currently closed" });
        }

       

        const newAdmissionForm = await prisma.admission.create({
            data: {
                id: nanoid(8),
                studentName,
                FatherName,
                MotherName,
                dob: new Date(dob),
                targetClass,
                address,
                phoneNumber,
                email,
                year: activeAdmission.activeYear
            }
        });
        return res.status(201).json({ message: "Admission form submitted successfully", admissionForm: newAdmissionForm });
    } catch (error) {
        console.log("error in submit admission form", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

const viewAdmissionRequests = async (req, res) => {
    const { year } = req.query;
    if (!year) {
        return res.status(400).json({ message: "Year is required" });
    }
    try {
        const page = parseInt(req.query.pageNumber) || 1;
        const limit = parseInt(req.query.pageSize) || 10;
        const skip = (page - 1) * limit;

        const [admissions, totalCount] = await Promise.all([
            prisma.admission.findMany({
                where: {
                    year,
                    status: "PENDING"
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'asc' }
            }),
            prisma.admission.count({
                where: {
                    year,
                    status: "PENDING"
                }
            })
        ]);

        const totalPages = Math.ceil(totalCount / limit);
        return res.status(200).json({ admissions, totalPages, currentPage: page, totalCount });
    } catch (error) {
        console.log("error in view admission requests", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

const getActiveAdmissionYear = async (req, res) => {
    try {
        const activeAdmission = await prisma.admissionSetting.findFirst({
            where: { isOpen: true }
        });
        return res.status(200).json({ year: activeAdmission?.activeYear || null });
    } catch (error) {
        console.log("error in get active admission year", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

const getPandingAdmissionDetails = async (req, res) => {
    const { studentName, id ,year } = req.query;

    if (!studentName && !id) {
        return res.status(400).json({ message: "Either Student name or ID is required" });
    }

    try {
        let admissionDetails;

        if (id) {
            const admission = await prisma.admission.findFirst({
                where: {
                    id,
                    status: "PENDING",
                    year
                }
            });
            admissionDetails = admission ? [admission] : [];
        } else if (studentName) {
            const page = parseInt(req.query.pageNumber) || 1;
            const limit = parseInt(req.query.pageSize) || 10;
            const skip = (page - 1) * limit;

            const [admissions, totalCount] = await Promise.all([
                prisma.admission.findMany({
                    where: {
                        status: "PENDING",
                        studentName: {
                            contains: studentName,
                            mode: 'insensitive'
                        },
                        year
                    },
                    skip,
                    take: limit,
                    orderBy: { createdAt: 'asc' }
                }),
                prisma.admission.count({
                    where: {
                        status: "PENDING",
                        studentName: {
                            contains: studentName,
                            mode: 'insensitive'
                        },
                        year
                    }
                        }
                    
                )
            ]);

            return res.status(200).json({
                admissionDetails: admissions,
                totalPages: Math.ceil(totalCount / limit),
                currentPage: page,
                totalCount
            });
        }

        if (!admissionDetails || admissionDetails.length === 0) {
            return res.status(404).json({ message: "Admission details not found" });
        }

        return res.status(200).json({ admissionDetails });
    } catch (error) {
        console.log("error in get admission details", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

const getCompleteAdmissionDetails = async (req, res) => {
    try {
        const page = parseInt(req.query.pageNumber) || 1;
        const limit = parseInt(req.query.pageSize) || 10;
        const skip = (page - 1) * limit;
        const year = req.query.year;

        const [admissionDetails, totalCount] = await Promise.all([
            prisma.admission.findMany({
                where: { status: "APPROVED", year },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.admission.count({
                where: { status: "APPROVED", year }
            })
        ]);

        const totalPages = Math.ceil(totalCount / limit);
        return res.status(200).json({ admissionDetails, totalPages, currentPage: page, totalCount });
    } catch (error) {
        console.log("error in get complete admission details", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

const updateAdmissionStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!id || !status) {
        return res.status(400).json({ message: "Admission ID and status are required" });
    }

    if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
    }

    try {
        const updatedAdmission = await prisma.admission.update({
            where: { id },
            data: { status }
        });

        return res.status(200).json({ message: "Admission status updated successfully", admission: updatedAdmission });
    } catch (error) {
        console.log("error in update admission status", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

export {
    openAdmissions,
    closeAdmissions,
    SubmitAdmissionForm,
    viewAdmissionRequests,
    getActiveAdmissionYear,
    getPandingAdmissionDetails,
    getCompleteAdmissionDetails,
    updateAdmissionStatus
}