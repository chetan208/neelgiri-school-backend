import { prisma } from "../../lib/prisma.ts";
// Trigger server restart to reload regenerated Prisma Client definition

const getEvents = async (req, res) => {
    try {
        const events = await prisma.calendarEvent.findMany({
            orderBy: { date: 'asc' }
        });
        return res.status(200).json(events);
    } catch (error) {
        console.error("Error fetching calendar events:", error);
        return res.status(500).json({ error: "An error occurred while fetching the calendar events." });
    }
};

const addEvent = async (req, res) => {
    const { title, description, date, endDate, type } = req.body;

    if (!title || !date || !type) {
        return res.status(400).json({ error: "Title, date, and type are required." });
    }

    try {
        const newEvent = await prisma.calendarEvent.create({
            data: {
                title,
                description,
                date: new Date(date),
                endDate: endDate ? new Date(endDate) : null,
                type
            }
        });

        // Auto-generate notice
        const noticeType = "Academic";
        const dateString = new Date(date).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric"
        });
        
        let desc = description ? `${description}\n\n` : "";
        if (endDate) {
            const endDateString = new Date(endDate).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric"
            });
            desc += `Scheduled from ${dateString} to ${endDateString}.`;
        } else {
            desc += `Scheduled for ${dateString}.`;
        }

        await prisma.notice.create({
            data: {
                type: noticeType,
                title: `${type.charAt(0).toUpperCase() + type.slice(1)}: ${title}`,
                description: desc,
                documentUrl: "custom:calendar",
                documentPublicId: "calendar-auto"
            }
        });

        return res.status(201).json(newEvent);
    } catch (error) {
        console.error("Error adding calendar event:", error);
        return res.status(500).json({ error: "An error occurred while adding the calendar event." });
    }
};

const deleteEvent = async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({ error: "Event ID is required." });
    }

    try {
        await prisma.calendarEvent.delete({
            where: { id }
        });
        return res.status(200).json({ message: "Calendar event deleted successfully." });
    } catch (error) {
        console.error("Error deleting calendar event:", error);
        return res.status(500).json({ error: "An error occurred while deleting the calendar event." });
    }
};

export { getEvents, addEvent, deleteEvent };
