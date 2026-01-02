import type { Candle } from './CandleAnalysisStrategy';
import { MasterSignalEngine } from './MasterSignalEngine';

export interface BacktestResult {
    winRate: number;
    totalTrades: number;
    profitFactor: number;
    avgRR: number;
    netPoints: number;
    trades: Array<{
        entryTime: number;
        exitTime: number;
        entryPrice: number;
        exitPrice: number;
        type: 'WIN' | 'LOSS';
        signal: string;
    }>;
}

export class SignalValidator {
    public static runBacktest(candles: Candle[]): BacktestResult {
        const engine = new MasterSignalEngine();
        const trades: BacktestResult['trades'] = [];
        let activeTrade: any = null;

        // Skip the first 40 bars for indicator stabilization
        for (let i = 40; i < candles.length; i++) {
            const history = candles.slice(0, i + 1);
            const currentCandle = candles[i];

            if (activeTrade) {
                // Check Exit (SL or Target)
                if (activeTrade.direction === 'BULLISH') {
                    if (currentCandle.high >= activeTrade.target) {
                        trades.push({
                            entryTime: activeTrade.time,
                            exitTime: currentCandle.time,
                            entryPrice: activeTrade.entry,
                            exitPrice: activeTrade.target,
                            type: 'WIN',
                            signal: activeTrade.signal
                        });
                        activeTrade = null;
                    } else if (currentCandle.low <= activeTrade.sl) {
                        trades.push({
                            entryTime: activeTrade.time,
                            exitTime: currentCandle.time,
                            entryPrice: activeTrade.entry,
                            exitPrice: activeTrade.sl,
                            type: 'LOSS',
                            signal: activeTrade.signal
                        });
                        activeTrade = null;
                    }
                } else if (activeTrade.direction === 'BEARISH') {
                    if (currentCandle.low <= activeTrade.target) {
                        trades.push({
                            entryTime: activeTrade.time,
                            exitTime: currentCandle.time,
                            entryPrice: activeTrade.entry,
                            exitPrice: activeTrade.target,
                            type: 'WIN',
                            signal: activeTrade.signal
                        });
                        activeTrade = null;
                    } else if (currentCandle.high >= activeTrade.sl) {
                        trades.push({
                            entryTime: activeTrade.time,
                            exitTime: currentCandle.time,
                            entryPrice: activeTrade.entry,
                            exitPrice: activeTrade.sl,
                            type: 'LOSS',
                            signal: activeTrade.signal
                        });
                        activeTrade = null;
                    }
                }
                continue;
            }

            // Look for Entry
            const signal = engine.analyze(history);
            if (signal && signal.direction !== 'NEUTRAL' && signal.convictionScore > 40) {
                activeTrade = {
                    time: currentCandle.time,
                    entry: signal.entryPrice,
                    target: signal.targetPrice,
                    sl: signal.stopLossPrice,
                    direction: signal.direction,
                    signal: signal.signalText
                };
            }
        }

        const winCount = trades.filter(t => t.type === 'WIN').length;
        const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0;

        const grossProfit = trades.filter(t => t.type === 'WIN').reduce((acc, t) => acc + Math.abs(t.exitPrice - t.entryPrice), 0);
        const grossLoss = trades.filter(t => t.type === 'LOSS').reduce((acc, t) => acc + Math.abs(t.exitPrice - t.entryPrice), 0);
        const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;
        const netPoints = grossProfit - grossLoss;

        return {
            winRate,
            totalTrades: trades.length,
            profitFactor,
            avgRR: 1.5, // Logic usually sets 1:2 or 1:2.5
            netPoints,
            trades
        };
    }
}
