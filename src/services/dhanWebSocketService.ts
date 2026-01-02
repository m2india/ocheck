import WebSocket from 'ws';
import { EventEmitter } from 'events';
import config from '../config';

const SEGMENT_MAP: Record<string, number> = {
    'NSE_EQ': 1,
    'NSE_IDX': 2,
    'NSE_FNO': 4,
    'MCX_COMM': 5,
    'NSE_CURR': 7,
    'BSE_EQ': 11,
    'BSE_IDX': 12,
    'BSE_FNO': 14,
    'BSE_CURR': 17,
    'IDX_I': 2 // NSE_IDX by default for IDX_I
};

export class DhanWebSocketService extends EventEmitter {
    private ws: WebSocket | null = null;
    private isConnected = false;
    private subscriptions: Set<string> = new Set();
    private reconnectAttempts = 0;
    private readonly maxReconnectDelay = 60000; // 1 minute

    constructor() {
        super();
        this.connect();
    }

    private connect() {
        if (this.ws) return;

        const url = `wss://api-feed.dhan.co?version=2&token=${config.apiKey}&clientId=${config.clientId}&authType=2`;
        console.log('[WS] Connecting to Dhan Feed...');
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            console.log('[WS] Connected to Dhan Feed');
            this.isConnected = true;
            this.reconnectAttempts = 0; // Reset attempts on success
            this.authenticate();
        });

        this.ws.on('message', (data: Buffer) => {
            this.handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
            console.log(`[WS] Connection closed (Code: ${code}, Reason: ${reason || 'None'})`);
            this.isConnected = false;
            this.ws = null;

            // Exponential backoff with max 1 minute delay
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
            console.log(`[WS] Reconnecting in ${delay / 1000}s... (Attempt ${this.reconnectAttempts + 1})`);
            this.reconnectAttempts++;
            setTimeout(() => this.connect(), delay);
        });

        this.ws.on('error', (err) => {
            console.error('[WS] Connection error:', err.message);
        });

        this.ws.on('unexpected-response', (req, res) => {
            console.error(`[WS] Unexpected handshake response: ${res.statusCode} ${res.statusMessage}`);
            if (res.statusCode === 502) {
                console.warn('[WS] Received 502 Bad Gateway. This usually means the server is down or it is a market holiday.');
            }
        });
    }

    private authenticate() {
        if (!this.ws) return;
        const payload = {
            RequestCode: 11, // Auth
            InstrumentCount: 0,
            InstrumentList: [],
            ClientId: config.clientId,
            AccessToken: config.apiKey
        };
        this.ws.send(JSON.stringify(payload));
        console.log('[WS] Authentication sent');
        // Resume subscriptions after a small delay to ensure auth processed
        setTimeout(() => this.resubscribe(), 1000);
    }

    public subscribe(instruments: { ExchangeSegment: string; SecurityId: string }[]) {
        if (!this.ws || !this.isConnected || instruments.length === 0) return;

        // Map string segments to integers for Dhan API
        const mappedInstruments = instruments.map(inst => {
            let segment = SEGMENT_MAP[inst.ExchangeSegment] || parseInt(inst.ExchangeSegment, 10) || 1;

            // Special handling for IDX_I shorthand to detect NSE (2) vs BSE (12)
            if (inst.ExchangeSegment === 'IDX_I') {
                const id = parseInt(inst.SecurityId, 10);
                if (id === 13) segment = 12; // SENSEX Security ID 13 is on BSE_IDX (12)
                else segment = 2; // Default to NSE_IDX
            }

            return {
                ExchangeSegment: segment,
                SecurityId: inst.SecurityId
            };
        });

        // Split into chunks of 100 as per Dhan docs
        for (let i = 0; i < mappedInstruments.length; i += 100) {
            const chunk = mappedInstruments.slice(i, i + 100);

            // 15: Ticker, 17: Quote, 21: OI
            [15, 17, 21].forEach(requestCode => {
                const payload = {
                    RequestCode: requestCode,
                    InstrumentCount: chunk.length,
                    InstrumentList: chunk
                };
                this.ws?.send(JSON.stringify(payload));
            });
        }

        instruments.forEach(inst => {
            this.subscriptions.add(`${inst.ExchangeSegment}:${inst.SecurityId}`);
        });
    }

    private resubscribe() {
        if (this.subscriptions.size === 0) return;
        const instruments = Array.from(this.subscriptions).map(s => {
            const [ExchangeSegment, SecurityId] = s.split(':');
            return { ExchangeSegment, SecurityId };
        });
        this.subscribe(instruments);
    }

    private handleMessage(data: Buffer) {
        if (data.length < 4) return;

        const responseCode = data.readUInt8(0);



        // Code 50 is Heartbeat
        if (responseCode === 50) return;

        let securityId = 0;
        let payload: any = {};

        try {
            if (responseCode === 1 && data.length >= 16) { // Index Packet
                securityId = data.readUInt32LE(4); // Security ID at 4-7
                payload = {
                    type: 'ticker',
                    ltp: data.readFloatLE(8),
                    ltt: data.readUInt32LE(12)
                };
            } else if (responseCode === 2 && data.length >= 16) { // Ticker Packet
                securityId = data.readUInt32LE(4);
                payload = {
                    type: 'ticker',
                    ltp: data.readInt32LE(8) / 100.0,
                    ltt: data.readUInt32LE(12)
                };
            } else if (responseCode === 4 && data.length >= 50) { // Quote Packet
                securityId = data.readUInt32LE(4);
                payload = {
                    type: 'quote',
                    ltp: data.readInt32LE(8) / 100.0,
                    volume: data.readUInt32LE(22),
                    oi: data.readUInt32LE(34)
                };
            } else if (responseCode === 5 && data.length >= 12) { // OI Packet
                securityId = data.readUInt32LE(4);
                payload = {
                    type: 'oi',
                    oi: data.readUInt32LE(8)
                };
            } else if (responseCode === 8 && data.length >= 162) { // Full Packet
                securityId = data.readUInt32LE(4);
                payload = {
                    type: 'quote',
                    ltp: data.readInt32LE(8) / 100.0,
                    volume: data.readUInt32LE(22),
                    oi: data.readUInt32LE(34)
                };
            }

            if (payload.type && securityId > 0) {
                this.emit('data', {
                    securityId,
                    ...payload
                });
            }
        } catch (err) {
            // Silently handle errors
        }
    }
}
