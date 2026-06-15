import makeWASocket, { DisconnectReason, BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs';
import { prisma } from '../../lib/prisma.ts';

// Initialize a silent logger to prevent polluting server logs
const logger = pino({ level: 'silent' });

let sock = null;
let isConnected = false;
let qrCodeData = null;
let connectionInfo = null;

// Custom Auth State to store session data in PostgreSQL via Prisma
const usePrismaAuthState = async (sessionId) => {
    const writeData = async (data, id) => {
        try {
            const value = JSON.stringify(data, BufferJSON.replacer);
            const category = id.split('-')[0];
            await prisma.whatsAppSession.upsert({
                where: { id: `${sessionId}-${id}` },
                update: { value, category },
                create: { id: `${sessionId}-${id}`, sessionId, category, value }
            });
        } catch (error) {
            console.error("Prisma Auth State Write Error:", error);
        }
    };

    const readData = async (id) => {
        try {
            const session = await prisma.whatsAppSession.findUnique({
                where: { id: `${sessionId}-${id}` }
            });
            if (!session) return null;
            return JSON.parse(session.value, BufferJSON.reviver);
        } catch (error) {
            console.error("Prisma Auth State Read Error:", error);
            return null;
        }
    };

    const removeData = async (id) => {
        try {
            await prisma.whatsAppSession.delete({
                where: { id: `${sessionId}-${id}` }
            });
        } catch (e) {} // ignore if not found
    };

    let credsStr = await readData('creds');
    let creds = credsStr || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) {
                                tasks.push(writeData(value, key));
                            } else {
                                tasks.push(removeData(key));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => {
            return writeData(creds, 'creds');
        }
    };
};

// Reusable function to initialize connection
export const initWhatsApp = async () => {
    try {
        const { state, saveCreds } = await usePrismaAuthState('default_session');
        
        const makeSocket = makeWASocket.default || makeWASocket;
        sock = makeSocket({
            auth: state,
            printQRInTerminal: false,
            logger: logger
        });

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('\n--- NEELGIRI SCHOOL SYSTEM: SCAN THIS QR CODE ---');
                qrcode.generate(qr, { small: true });
                // Use a free public QR code generator API to convert the raw QR token to an image URL
                qrCodeData = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
                isConnected = false;
                connectionInfo = null;
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('🔄 WhatsApp Connection closed. Reconnecting in 5s:', shouldReconnect);
                isConnected = false;
                connectionInfo = null;
                if (shouldReconnect) {
                    setTimeout(initWhatsApp, 5000);
                }
            } else if (connection === 'open') {
                console.log('\n✅ WhatsApp Client is fully authenticated and ready!');
                isConnected = true;
                qrCodeData = null;
                connectionInfo = sock.user;
            }
        });

        sock.ev.on('creds.update', saveCreds);

    } catch (error) {
        console.error('Failed to initialize WhatsApp socket:', error);
    }
};

// Auto-start connection process
initWhatsApp();

/**
 * Get current WhatsApp status, QR code, and logged-in user details
 */
export const getWhatsAppStatus = () => {
    return {
        connected: isConnected,
        qrCode: qrCodeData,
        user: connectionInfo
    };
};

/**
 * Log out from current WhatsApp session and delete credentials to start fresh
 */
export const logoutWhatsApp = async () => {
    try {
        if (sock) {
            try {
                await sock.logout();
            } catch (e) {}
            try {
                sock.end();
            } catch (e) {}
            sock = null;
        }
        isConnected = false;
        qrCodeData = null;
        connectionInfo = null;

        if (fs.existsSync('./whatsapp_session')) {
            fs.rmSync('./whatsapp_session', { recursive: true, force: true });
        }
        try {
            await prisma.whatsAppSession.deleteMany({
                where: { sessionId: 'default_session' }
            });
        } catch(e) {
            console.error("Failed to delete session from database", e);
        }

        // Restart socket to generate new QR Code
        await initWhatsApp();
        return { success: true };
    } catch (error) {
        console.error("Error logging out WhatsApp:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Reusable function to send WhatsApp messages
 * @param {string} number - Client/Parent mobile number (e.g., "9876543210")
 * @param {string} message - Text message content
 */
export const sendWhatsAppMessage = async (number, message) => {
    try {
        if (!sock || !isConnected) {
            return {
                success: false,
                error: "WhatsApp service is not connected or scanned yet. Please scan the QR code first."
            };
        }

        // Number cleanup: Only digits
        let cleanNumber = number.replace(/\D/g, '');
        
        if (cleanNumber.length === 10) {
            cleanNumber = `91${cleanNumber}`; // Add Indian country code by default
        }

        const jid = `${cleanNumber}@s.whatsapp.net`;

        // Send message
        await sock.sendMessage(jid, { text: message });
        
        return {
            success: true,
            status: "Sent"
        };

    } catch (error) {
        console.error(`Failed to send WhatsApp to ${number}:`, error);
        return {
            success: false,
            error: error.message
        };
    }
};

