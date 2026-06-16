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
let isLoggingOut = false;
let reconnectAttempts = 0;

// Custom Auth State to store session data in PostgreSQL via Prisma with In-Memory Caching for Render
const usePrismaAuthState = async (sessionId) => {
    const cache = new Map();

    // Pre-load ALL session keys from DB into cache to avoid any latency during runtime
    try {
        const sessions = await prisma.whatsAppSession.findMany({
            where: { sessionId }
        });
        sessions.forEach(s => cache.set(s.id, s.value));
        console.log(`Loaded ${sessions.length} WhatsApp session keys from database for ${sessionId}.`);
    } catch(e) {
        console.error("Failed to preload session from DB:", e);
    }

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

    const removeData = async (id) => {
        try {
            await prisma.whatsAppSession.delete({
                where: { id: `${sessionId}-${id}` }
            });
        } catch (e) {} // ignore if not found
    };

    let credsStr = cache.get(`${sessionId}-creds`);
    let creds = credsStr ? JSON.parse(credsStr, BufferJSON.reviver) : initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        let value = cache.get(`${sessionId}-${type}-${id}`);
                        if (value) {
                            value = JSON.parse(value, BufferJSON.reviver);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        }
                    }
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) {
                                // Save to cache immediately
                                const strVal = JSON.stringify(value, BufferJSON.replacer);
                                cache.set(`${sessionId}-${key}`, strVal);
                                // Queue DB update
                                tasks.push(writeData(value, key));
                            } else {
                                cache.delete(`${sessionId}-${key}`);
                                tasks.push(removeData(key));
                            }
                        }
                    }
                    // Run DB updates asynchronously without blocking Baileys
                    Promise.all(tasks).catch(e => console.error("Batch DB save error:", e));
                }
            }
        },
        saveCreds: () => {
            const strVal = JSON.stringify(creds, BufferJSON.replacer);
            cache.set(`${sessionId}-creds`, strVal);
            return writeData(creds, 'creds');
        }
    };
};

// Reusable function to initialize connection
export const initWhatsApp = async () => {
    try {
        // Automatically isolate sessions so Localhost and Render don't conflict
        const isRender = process.env.RENDER === 'true' || process.env.NODE_ENV === 'production';
        const defaultSessionName = isRender ? 'render_production_session' : 'local_dev_session';
        const sessionId = process.env.WHATSAPP_SESSION_ID || defaultSessionName;
        
        const { state, saveCreds } = await usePrismaAuthState(sessionId);
        
        const makeSocket = makeWASocket.default || makeWASocket;
        sock = makeSocket({
            auth: state,
            printQRInTerminal: false,
            logger: logger,
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            syncFullHistory: false,
            generateHighQualityLinkPreview: false
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
                console.log('🔄 WhatsApp Connection closed. Reconnecting in future:', shouldReconnect);
                isConnected = false;
                connectionInfo = null;
                
                // Cleanup old listeners
                sock.ev.removeAllListeners('connection.update');
                sock.ev.removeAllListeners('creds.update');

                if (shouldReconnect) {
                    reconnectAttempts++;
                    const delay = Math.min(5000 * Math.pow(2, reconnectAttempts - 1), 60000); // Max 60s
                    console.log(`⏳ Reconnecting in ${delay/1000}s (Attempt ${reconnectAttempts})`);
                    setTimeout(initWhatsApp, delay);
                } else {
                    console.log('📱 User logged out from phone. Cleaning up database session...');
                    logoutWhatsApp().catch(e => console.error(e));
                }
            } else if (connection === 'open') {
                console.log('\n✅ WhatsApp Client is fully authenticated and ready!');
                isConnected = true;
                qrCodeData = null;
                connectionInfo = sock.user;
                reconnectAttempts = 0; // Reset counter on success
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
    if (isLoggingOut) return { success: false, error: "Logout already in progress" };
    isLoggingOut = true;
    
    try {
        if (sock) {
            sock.ev.removeAllListeners('connection.update');
            sock.ev.removeAllListeners('creds.update');
            try {
                await sock.logout();
            } catch (e) { console.error("Socket logout error:", e); }
            try {
                sock.end();
            } catch (e) { console.error("Socket end error:", e); }
            sock = null;
        }
        isConnected = false;
        qrCodeData = null;
        connectionInfo = null;

        if (fs.existsSync('./whatsapp_session')) {
            fs.rmSync('./whatsapp_session', { recursive: true, force: true });
        }
        try {
            const isRender = process.env.RENDER === 'true' || process.env.NODE_ENV === 'production';
            const defaultSessionName = isRender ? 'render_production_session' : 'local_dev_session';
            const activeSessionId = process.env.WHATSAPP_SESSION_ID || defaultSessionName;

            await prisma.whatsAppSession.deleteMany({
                where: { sessionId: activeSessionId }
            });
        } catch(e) {
            console.error("Failed to delete session from database", e);
        }

        // Restart socket to generate new QR Code
        await initWhatsApp();
        isLoggingOut = false;
        return { success: true };
    } catch (error) {
        console.error("Error logging out WhatsApp:", error);
        isLoggingOut = false;
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

        if (!number || typeof number !== 'string') {
            return { success: false, error: "Invalid phone number provided." };
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

