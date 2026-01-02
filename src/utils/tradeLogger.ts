import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'strikeprice.log');

export interface TradeLogEntry {
    timestamp: string;
    scripName: string;
    timeframe: string;
    type: 'CE' | 'PE';
    strike: number;
    entry: number;
    target: number;
    stopLoss: number;
    maxLoss: number;
    profit: number;
    confidence: number;
    status: 'ACTIVE' | 'TARGET_HIT' | 'SL_HIT' | 'EXPIRED';
}

export const logTrade = (entry: TradeLogEntry) => {
    const date = new Date(entry.timestamp);
    const dateStr = date.toLocaleDateString('en-IN');
    const timeStr = date.toLocaleTimeString('en-IN');

    // Format: [DATE TIME] TF TYPE STRIKE ENTRY TARGET SL MAXLOSS PROFIT CONF STATUS
    // Matching user example: PE 350 ₹29.80 ₹32.54 ₹28.24 ₹1952 ₹3421 53%
    const line = `[${dateStr} ${timeStr}] [${entry.scripName}] [${entry.timeframe}] ${entry.type}\t${entry.strike}\t₹${entry.entry.toFixed(2)}\t₹${entry.target.toFixed(2)}\t₹${entry.stopLoss.toFixed(2)}\t₹${entry.maxLoss.toFixed(0)}\t₹${entry.profit.toFixed(0)}\t${entry.confidence}%\t${entry.status}\n`;

    fs.appendFileSync(LOG_FILE, line);
};
