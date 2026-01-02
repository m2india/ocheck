import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setOptionChainRoutes } from './routes/optionChain';
import config from './config';
import { DhanWebSocketService } from './services/dhanWebSocketService';
import { dhanService } from './routes/optionChain';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3001;

// Token Expiry Check
if (config.apiKey) {
    try {
        const parts = config.apiKey.split('.');
        if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            const exp = payload.exp * 1000;
            const now = Date.now();
            const timeLeft = (exp - now) / 1000 / 60; // in minutes

            console.log('--- Token Diagnostics ---');
            console.log(`Token Expires At: ${new Date(exp).toLocaleString()}`);
            if (timeLeft < 0) {
                console.error('CRITICAL: ACCESS_TOKEN is EXPIRED!');
            } else if (timeLeft < 60) {
                console.warn(`WARNING: ACCESS_TOKEN will expire in ${Math.round(timeLeft)} minutes.`);
            } else {
                console.log(`Token is valid for ${Math.round(timeLeft / 60)} hours.`);
            }
            console.log('-------------------------');
        }
    } catch (e) {
        console.warn('[DIAG] Could not parse ACCESS_TOKEN for expiry check.');
    }
}

// Initialize Dhan WebSocket Service
console.log('[DEBUG] Initializing DhanWebSocketService...');
const dhanWs = new DhanWebSocketService();
console.log('[DEBUG] DhanWebSocketService initialized.');

dhanWs.on('data', (data) => {
    // console.log('Emitting market-data:', data);
    // console.log(`[DEBUG] Emitting data for ${data.securityId}`);
    io.emit('market-data', data);
});

const pollingIntervals = new Map<string, NodeJS.Timeout>();

const startChainPolling = (params: any, roomName: string) => {
    if (pollingIntervals.has(roomName)) return;

    console.log('[POLL] Starting background poll for room:', roomName);

    const poll = async () => {
        // Check if anyone is still in the room
        const room = io.sockets.adapter.rooms.get(roomName);
        if (!room || room.size === 0) {
            console.log('[POLL] No subscribers in room, stopping:', roomName);
            const interval = pollingIntervals.get(roomName);
            if (interval) clearTimeout(interval);
            pollingIntervals.delete(roomName);
            return;
        }

        let nextDelay = 4500; // Increased from 2s to 4.5s to avoid 429s

        try {
            const tableData = await dhanService.getOptionChainTable(params);
            io.to(roomName).emit('chain-update', tableData);
        } catch (error: any) {
            console.error(`[POLL][${roomName}] Error:`, error.message);
            if (error.message.includes('429')) nextDelay = 10000;
        }

        const interval = setTimeout(poll, nextDelay);
        pollingIntervals.set(roomName, interval);
    };

    poll();
};

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    let currentRoom: string | null = null;

    socket.on('subscribe', (data) => {
        const { instruments, pollParams } = data;

        if (instruments) {
            console.log(`[${socket.id}] Subscribing to ${instruments.length} instruments`);
            dhanWs.subscribe(instruments);
        }

        if (pollParams) {
            const roomName = `${pollParams.UnderlyingScrip}_${pollParams.Expiry}`;

            // Leave previous room if any
            if (currentRoom && currentRoom !== roomName) {
                socket.leave(currentRoom);
                console.log(`[${socket.id}] Left room: ${currentRoom}`);
            }

            socket.join(roomName);
            currentRoom = roomName;
            console.log(`[${socket.id}] Joined room: ${roomName}`);

            startChainPolling(pollParams, roomName);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        // Polling loop will naturally stop on next tick when it sees room is empty
    });
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up routes
setOptionChainRoutes(app);

// Serve static UI from /public
// Serve static UI from client/dist (Vite Build)
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// Fallback to index.html for client-side routing
app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
});

// Save Selection Endpoint
app.post('/save-selection', (req, res) => {
    const { scrip, strike, side, price, expiry, status, strategy, confidence, interpretation, entry, targets, stopLoss, maxLoss, maxProfit, profit, ltp } = req.body;
    const date = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString();
    const selectionsDir = path.join(__dirname, '..', 'selections');

    try {
        if (!fs.existsSync(selectionsDir)) {
            fs.mkdirSync(selectionsDir);
        }

        const fileName = `selections_${date}.txt`;
        const filePath = path.join(selectionsDir, fileName);

        const logData = {
            time, scrip, strike, side, price, expiry, status, strategy, confidence, interpretation, entry, targets, stopLoss, maxLoss, maxProfit, profit, ltp
        };

        const logEntry = `${JSON.stringify(logData)}\n`;

        fs.appendFileSync(filePath, logEntry);
        console.log(`[LOG] Saved selection details for ${scrip} ${strike} ${side}`);
        res.status(200).json({ success: true, message: 'Selection saved' });
    } catch (error) {
        console.error('[LOG] Error saving selection:', error);
        res.status(500).json({ success: false, message: 'Failed to save selection' });
    }
});

app.get('/get-selections', (req, res) => {
    const date = new Date().toISOString().split('T')[0];
    const selectionsDir = path.join(__dirname, '..', 'selections');
    const fileName = `selections_${date}.txt`;
    const filePath = path.join(selectionsDir, fileName);

    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.trim().split('\n');
            const data = lines.map(line => {
                try {
                    return JSON.parse(line);
                } catch (e) {
                    return null;
                }
            }).filter(d => d !== null);
            res.status(200).json({ success: true, data });
        } else {
            res.status(200).json({ success: true, data: [] });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error reading logs' });
    }
});

httpServer.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});