import type { Candle, PredictionResult } from './CandleAnalysisStrategy';
import { RiskManager } from './RiskManager';
import { ProfessionalStrategyEngine } from './ProfessionalStrategyEngine';

export interface DirectionStrategyConfig {
    emaPeriodFast: number;
    emaPeriodSlow: number;
    emaPeriodMaster: number;
    atrPeriod: number;
    atrMultiplier: number;
    rsiPeriod: number;
    macdFast: number;
    macdSlow: number;
    macdSignal: number;
}

export class CandleDirectionStrategy {
    private config: DirectionStrategyConfig;

    constructor(config?: Partial<DirectionStrategyConfig>) {
        this.config = {
            emaPeriodFast: 5,
            emaPeriodSlow: 13,
            emaPeriodMaster: 200,
            atrPeriod: 14,
            atrMultiplier: 2.0,
            rsiPeriod: 14,
            macdFast: 12,
            macdSlow: 26,
            macdSignal: 9,
            ...config
        };
    }

    private calculateEMA(data: number[], period: number): number[] {
        const emas: number[] = new Array(data.length).fill(0);
        if (data.length < period) return emas;
        const k = 2 / (period + 1);

        // Initial SMA
        let sum = 0;
        for (let i = 0; i < period; i++) sum += data[i];
        emas[period - 1] = sum / period;

        for (let i = period; i < data.length; i++) {
            emas[i] = (data[i] - emas[i - 1]) * k + emas[i - 1];
        }
        return emas;
    }

    private calculateWMA(data: number[], period: number): number[] {
        const wmas: number[] = new Array(data.length).fill(0);
        if (data.length < period) return wmas;

        for (let i = period - 1; i < data.length; i++) {
            let sum = 0;
            let weightSum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j] * (period - j);
                weightSum += (period - j);
            }
            wmas[i] = sum / weightSum;
        }
        return wmas;
    }

    private calculateHMA(data: number[], period: number): number[] {
        const halfPeriod = Math.floor(period / 2);
        const sqrtPeriod = Math.floor(Math.sqrt(period));

        const wmaFull = this.calculateWMA(data, period);
        const wmaHalf = this.calculateWMA(data, halfPeriod);

        const diffSeries = new Array(data.length).fill(0);
        for (let i = 0; i < data.length; i++) {
            diffSeries[i] = (2 * wmaHalf[i]) - wmaFull[i];
        }

        return this.calculateWMA(diffSeries, sqrtPeriod);
    }

    private calculateMACD(data: number[]): { macdLine: number[], signalLine: number[], histogram: number[] } {
        const fastEMA = this.calculateEMA(data, this.config.macdFast);
        const slowEMA = this.calculateEMA(data, this.config.macdSlow);

        const macdLine = fastEMA.map((f, i) => f - slowEMA[i]);
        // Signal line is EMA of MACD Line
        // We need to handle the initial zeros from slowEMA which distort MACD
        // The signal line calculation should start where valid MACD data starts (at macdSlow - 1)

        const signalLine = this.calculateEMA(macdLine, this.config.macdSignal);
        const histogram = macdLine.map((m, i) => m - signalLine[i]);

        return { macdLine, signalLine, histogram };
    }

    private calculateATR(candles: Candle[], period: number): number[] {
        const atrs: number[] = new Array(candles.length).fill(0);
        if (candles.length < period) return atrs;
        let trSum = 0;
        for (let i = 0; i < candles.length; i++) {
            const curr = candles[i];
            const prev = i > 0 ? candles[i - 1] : curr;
            const tr = Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close));
            if (i < period) {
                trSum += tr;
                if (i === period - 1) atrs[i] = trSum / period;
            } else {
                atrs[i] = (atrs[i - 1] * (period - 1) + tr) / period;
            }
        }
        return atrs;
    }

    private calculateBollingerBands(data: number[], period: number = 20, stdDev: number = 2): { upper: number[], middle: number[], lower: number[] } {
        const sma = this.calculateEMA(data, period); // Using EMA for smoother center line, or SMA if strict standard
        const upper: number[] = [];
        const middle: number[] = sma;
        const lower: number[] = [];

        for (let i = 0; i < data.length; i++) {
            if (i < period) {
                upper.push(0);
                lower.push(0);
                continue;
            }

            // Calculate Standard Deviation
            let sumSqDiff = 0;
            for (let j = 0; j < period; j++) {
                const diff = data[i - j] - sma[i];
                sumSqDiff += diff * diff;
            }
            const sd = Math.sqrt(sumSqDiff / period);

            upper.push(sma[i] + (sd * stdDev));
            lower.push(sma[i] - (sd * stdDev));
        }
        return { upper, middle, lower };
    }

    private calculateRSI(data: number[], period: number): number[] {
        const rsi: number[] = new Array(data.length).fill(0);
        if (data.length < period) return rsi;
        let gains = 0;
        let losses = 0;
        for (let i = 1; i <= period; i++) {
            const diff = data[i] - data[i - 1];
            if (diff >= 0) gains += diff;
            else losses -= diff;
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;
        rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

        for (let i = period + 1; i < data.length; i++) {
            const diff = data[i] - data[i - 1];
            if (diff >= 0) {
                avgGain = (avgGain * (period - 1) + diff) / period;
                avgLoss = (avgLoss * (period - 1)) / period;
            } else {
                avgGain = (avgGain * (period - 1)) / period;
                avgLoss = (avgLoss * (period - 1) - diff) / period;
            }
            rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
        }
        return rsi;
    }

    private findSupportResistance(candles: Candle[], lookback: number = 60): { supports: number[], resistances: number[] } {
        const supports: number[] = [];
        const resistances: number[] = [];
        const start = Math.max(2, candles.length - lookback);
        const end = candles.length - 2;

        for (let i = start; i < end; i++) {
            const low = candles[i].low;
            const high = candles[i].high;
            // Swing Low (Fractal)
            if (low < candles[i - 1].low && low < candles[i - 2].low &&
                low < candles[i + 1].low && low < candles[i + 2].low) {
                supports.push(low);
            }
            // Swing High (Fractal)
            if (high > candles[i - 1].high && high > candles[i - 2].high &&
                high > candles[i + 1].high && high > candles[i + 2].high) {
                resistances.push(high);
            }
        }
        return { supports, resistances };
    }

    private findSupplyDemandZones(candles: Candle[]): { supplyZones: { top: number; bottom: number }[], demandZones: { top: number; bottom: number }[] } {
        const supplyZones: { top: number; bottom: number }[] = [];
        const demandZones: { top: number; bottom: number }[] = [];

        // Look back 100 periods for recent zones
        const start = Math.max(5, candles.length - 100);
        const end = candles.length - 2;

        for (let i = start; i < end; i++) {
            const curr = candles[i];

            // Supply Zone (Fractal High)
            // Logic: High is higher than 2 left and 2 right
            if (curr.high > candles[i - 1].high && curr.high > candles[i - 2].high &&
                curr.high > candles[i + 1].high && curr.high > candles[i + 2].high) {

                // Define Zone: High to (Max of Open/Close) - i.e., the upper wick area
                const bodyTop = Math.max(curr.open, curr.close);
                const height = curr.high - bodyTop;
                // Ensure min thickness
                const zoneBottom = height < (curr.high * 0.0005) ? curr.high * 0.9995 : bodyTop;

                supplyZones.push({ top: curr.high, bottom: zoneBottom });
            }

            // Demand Zone (Fractal Low)
            // Logic: Low is lower than 2 left and 2 right
            if (curr.low < candles[i - 1].low && curr.low < candles[i - 2].low &&
                curr.low < candles[i + 1].low && curr.low < candles[i + 2].low) {

                // Define Zone: Low to (Min of Open/Close) - i.e., the lower wick area
                const bodyBottom = Math.min(curr.open, curr.close);
                const height = bodyBottom - curr.low;
                // Ensure min thickness
                const zoneTop = height < (curr.low * 0.0005) ? curr.low * 1.0005 : bodyBottom;

                demandZones.push({ top: zoneTop, bottom: curr.low });
            }
        }

        // Return only the last 5 of each to avoid clutter
        return {
            supplyZones: supplyZones.slice(-5),
            demandZones: demandZones.slice(-5)
        };
    }

    public analyze(candles: Candle[]): PredictionResult | null {
        // Reduced requirement to 20 bars so it works earlier in the session
        if (candles.length < 20) return null;

        // Optimization: Cap data to last 250 candles for smooth processing in loops
        const analysisData = candles.length > 250 ? candles.slice(-250) : candles;
        const closes = analysisData.map(c => c.close);

        // --- HULL MOVING AVERAGE STRATEGY (HMA 9/21 - The "Sniper" Alternative) ---
        // Replacing standard EMAs with HMAs for superior lag reduction and smoothness.
        const emaFast = this.calculateHMA(closes, 9);  // Fast Hull
        const emaSlow = this.calculateHMA(closes, 21); // Slow Hull

        // --- INTRADAY OPTIMIZATION ---
        // Use 50 EMA as the "Session Master" instead of 200.
        // It catches trend shifts much faster (suitable for scalping/intraday).
        let emaSession = this.calculateEMA(closes, 50);
        if (emaSession.every(v => v === 0) || emaSession[emaSession.length - 1] === 0) {
            emaSession = this.calculateEMA(closes, 20); // Quick fallback for first 30 mins
        }

        const atrs = this.calculateATR(analysisData, this.config.atrPeriod);
        const rsis = this.calculateRSI(closes, this.config.rsiPeriod);
        const { macdLine, signalLine, histogram } = this.calculateMACD(closes);
        const lastIdx = analysisData.length - 1;
        const currentCandle = analysisData[lastIdx];
        const prevCandle = analysisData[lastIdx - 1];
        const currentPrice = currentCandle.close;

        // VWAP Calculation (Intraday cumulative)
        let totalVol = 0;
        let totalVal = 0;
        const vwaps: number[] = [];
        for (let i = 0; i < candles.length; i++) {
            const avgPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
            totalVol += (candles[i].volume || 0);
            totalVal += (avgPrice * (candles[i].volume || 0));
            vwaps.push(totalVol === 0 ? avgPrice : totalVal / totalVol);
        }
        const lastVWAP = vwaps[lastIdx];

        // Ensure we have valid previous data
        if (!prevCandle) return null;

        const lastEmaFast = emaFast[lastIdx];
        const lastEmaSlow = emaSlow[lastIdx];
        const lastEmaSession = emaSession[lastIdx] || lastEmaSlow;
        const lastRSI = rsis[lastIdx];
        const lastMACD = macdLine[lastIdx];
        const lastSignal = signalLine[lastIdx];
        const lastHist = histogram[lastIdx];
        const prevHist = histogram[lastIdx - 1];

        const levels = this.findSupportResistance(candles, 100);
        const zones = this.findSupplyDemandZones(analysisData);

        const lastATR = Math.max(atrs[lastIdx], currentPrice * 0.001);

        let direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        let signalText = 'WAIT...';
        let confidence = 0;

        // --- STRATEGY LOGIC ---

        const isUptrend = lastEmaFast > lastEmaSlow;
        const isDowntrend = lastEmaFast < lastEmaSlow;
        const isSessionUp = currentPrice > lastEmaSession;
        const isSessionDown = currentPrice < lastEmaSession;

        // Trend Strength (ADX-like check: spread between EMAs expanding)
        // const prevEmaDiff = Math.abs(emaFast[lastIdx - 1] - emaSlow[lastIdx - 1]);
        // const currEmaDiff = Math.abs(lastEmaFast - lastEmaSlow);

        // 2. Momentum Filter (Aggressive for 20.25)

        // 3. Trigger (MACD Crossover or Histogram expansion)

        // 4. Candle Confirmation
        // Bullish: Close near high, green body
        const isGreen = currentCandle.close > currentCandle.open;
        const isRed = currentCandle.close < currentCandle.open;

        // Avoid "wicky" candles for entry
        const bodySize = Math.abs(currentCandle.close - currentCandle.open);
        const upperWick = currentCandle.high - Math.max(currentCandle.open, currentCandle.close);
        const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;

        // Piercing Pattern (Bullish Reversal)
        const isBullishEngulfing = isGreen && prevCandle.close < prevCandle.open && currentCandle.close > prevCandle.open && currentCandle.open < prevCandle.close;

        const strongBullCandle = isGreen && (upperWick < bodySize * 0.4) && bodySize > (lastATR * 0.2);
        const strongBearCandle = isRed && (lowerWick < bodySize * 0.4) && bodySize > (lastATR * 0.2);

        // Volume Context
        const lastVolume = currentCandle.volume || 0;
        const avgVolume = candles.slice(-20).reduce((s, c) => s + (c.volume || 0), 0) / 20;
        const isVolumeConfirm = lastVolume > avgVolume * 0.8;

        // --- SNIPER REVERSAL LOGIC (The "20.25" Pivot Hunter) ---
        const bb = this.calculateBollingerBands(closes, 20, 2);
        const lastUpperBB = bb.upper[lastIdx];
        const lastLowerBB = bb.lower[lastIdx];

        // 1. Sniper BUY Conditions (Absolute Bottom)
        // - Price touches/pierces Lower Bollinger Band
        // - RSI is Oversold (< 35) or showing Divergence
        // - Candle shows rejection (Hammer, Long Lower Wick) OR Bullish Engulfing
        const isBBTouchLow = currentCandle.low <= lastLowerBB;
        const isOversold = lastRSI < 35;
        const isWickRejectionLow = lowerWick > bodySize * 1.5; // Strong rejection

        // 2. Sniper SELL Conditions (Absolute Top)
        const isBBTouchHigh = currentCandle.high >= lastUpperBB;
        const isOverbought = lastRSI > 65;
        const isWickRejectionHigh = upperWick > bodySize * 1.5;

        // --- PROFESSIONAL PATTERN OVERLAY ---
        const proEngine = new ProfessionalStrategyEngine();
        const proResult = proEngine.analyze(candles);

        // --- SIGNAL PRIORITY STACK ---

        // 0. SNIPER REVERSAL (Highest Priority - The "20.25" Entry)
        // Logic: Lower BB Touch + Oversold + Rejection
        if (isBBTouchLow && (isOversold || lastRSI < 40) && (isWickRejectionLow || isBullishEngulfing) && isGreen) {
            direction = 'BULLISH';
            confidence = 98;
            signalText = `SNIPER REVERSAL BUY`;
        }
        // Logic: Upper BB Touch + Overbought + Rejection
        else if (isBBTouchHigh && (isOverbought || lastRSI > 60) && (isWickRejectionHigh || strongBearCandle) && isRed) {
            direction = 'BEARISH';
            confidence = 98;
            signalText = `SNIPER REVERSAL SELL`;
        }
        // 1. HIGH CONFIDENCE PROFESSIONAL SIGNALS (Backup)
        else if (proResult && proResult.confidence > 88) {
            direction = proResult.direction;
            confidence = proResult.confidence;
            signalText = proResult.signalText;
        }

        // Targets & Stop Loss
        let targetPrice = currentPrice;
        let stopLoss = currentPrice;

        if (direction === 'BULLISH') {
            stopLoss = RiskManager.getInitialStopLoss(currentPrice, 'BULLISH', currentCandle, lastATR);
            const risk = currentPrice - stopLoss;
            targetPrice = currentPrice + (risk * 2.5); // Slightly higher RR for breakouts/reversals
        } else if (direction === 'BEARISH') {
            stopLoss = RiskManager.getInitialStopLoss(currentPrice, 'BEARISH', currentCandle, lastATR);
            const risk = stopLoss - currentPrice;
            targetPrice = currentPrice - (risk * 2.5);
        }

        let finalTargets = [targetPrice];
        if (proResult) {
            // If the professional engine has specific pattern results, use them for targets if they are better
            if (proResult.direction === direction) {
                finalTargets = proResult.targets || [proResult.targetPrice || targetPrice];
                confidence = Math.max(confidence, proResult.confidence);
                // Keep the signalText if we haven't set a high-priority one yet
                if (signalText === 'WAIT...' || signalText === 'CONFIRMED BUY' || signalText === 'CONFIRMED SELL') {
                    signalText = proResult.signalText;
                }
            }
        }

        return {
            direction,
            strength: confidence,
            confidence,
            entryPrice: currentPrice,
            targetPrice: finalTargets[0],
            targets: finalTargets,
            stopLossPrice: stopLoss,
            signalText: direction === 'NEUTRAL' ? 'NEUTRAL' : signalText,
            metrics: {
                momentumScore: lastRSI,
                volumeTrend: currentCandle.volume,
                volatility: lastATR
            },
            supports: levels.supports.slice(-3),
            resistances: levels.resistances.slice(-3),
            supplyZones: zones.supplyZones,
            demandZones: zones.demandZones,
            insight: {
                candlestickStructure: strongBullCandle ? 'Bullish' : (strongBearCandle ? 'Bearish' : 'Weak'),
                volumeConfirmation: (() => {
                    const avgVol = candles.slice(-20).reduce((s, c) => s + (c.volume || 0), 0) / 20;
                    const currVol = currentCandle.volume || 0;
                    if (currVol > avgVol * 2.0) return 'Bullish (Surge)';
                    if (currVol > avgVol * 1.5) return 'Bullish';
                    if (currVol < avgVol * 0.5) return 'Weak / Dry';
                    return isGreen ? 'Bullish' : 'Bearish';
                })(),
                volumeActivity: (() => {
                    const avgVol = candles.slice(-20).reduce((s, c) => s + (c.volume || 0), 0) / 20;
                    const currVol = currentCandle.volume || 0;
                    const ratio = currVol / (avgVol || 1);
                    if (ratio > 2) return 'SURGE';
                    if (ratio > 1.2) return 'ACTIVE';
                    if (ratio < 0.6) return 'QUIET';
                    return 'STABLE';
                })(),
                volatilityLabel: (() => {
                    const price = currentPrice;
                    const volatilityPercent = (lastATR / price) * 100;
                    if (volatilityPercent > 0.5) return 'HIGH';
                    if (volatilityPercent > 0.2) return 'MODERATE';
                    return 'LOW';
                })(),
                liquidityLabel: (() => {
                    const avgVol = candles.slice(-20).reduce((s, c) => s + (c.volume || 0), 0) / 20;
                    if (avgVol > 100000) return 'DEEP';
                    if (avgVol > 20000) return 'GOOD';
                    return 'THIN';
                })(),
                marketTrend: (() => {
                    if (candles.length === 0) return 'NEUTRAL';
                    const dayOpen = candles[0].open;
                    const change = ((currentPrice - dayOpen) / dayOpen) * 100;
                    if (change > 0.1) return 'BULLISH';
                    if (change < -0.1) return 'BEARISH';
                    return 'SIDEWAYS';
                })(),
                marketTrendPct: (() => {
                    if (candles.length === 0) return 0;
                    const dayOpen = candles[0].open;
                    return ((currentPrice - dayOpen) / dayOpen) * 100;
                })(),
                marketSentimentScore: (() => {
                    // Multi-Factor Weighting (Intraday Balanced)
                    let score = 50;

                    // 1. Session Trend (50 EMA) - 20%
                    score += isSessionUp ? 10 : -10;

                    // 2. Pivot Momentum (9/21 EMA) - 20%
                    score += isUptrend ? 10 : -10;

                    // 3. Institutional Anchor (VWAP) - 30% (Boosted for Intraday)
                    // VWAP is the single most important intraday indicator
                    score += (currentPrice > lastVWAP) ? 15 : -15;

                    // 4. Momentum Momentum (RSI) - 15%
                    const rsiFactor = (lastRSI - 50) / 3.33; // -15 to +15
                    score += rsiFactor;

                    // 5. Volume/Trend Exhaustion (MACD Hist) - 15%
                    const histIncrease = lastHist > prevHist;
                    score += (lastHist > 0 ? 10 : -10) + (histIncrease ? 5 : -5);

                    return Math.max(0, Math.min(100, score));
                })(),
                nextLikelyTrend: (() => {
                    const lastRes = levels.resistances.length > 0 ? levels.resistances[levels.resistances.length - 1] : Infinity;
                    if (currentPrice > lastRes * 0.99 && lastRSI > 75 && lastHist < prevHist && direction === 'NEUTRAL') return 'Sideways (Near Res)';

                    // Otherwise sync with signal direction
                    if (direction === 'BULLISH') return 'Bullish';
                    if (direction === 'BEARISH') return 'Bearish';

                    // Fallback to momentum if direction is neutral
                    if (isUptrend && lastRSI > 55) return 'Bullish';
                    if (isDowntrend && lastRSI < 45) return 'Bearish';
                    return 'Neutral';
                })(),
                currentPrice,
                targetPrice,
                targets: (() => {
                    const isUp = direction === 'BULLISH' || (direction === 'NEUTRAL' && isUptrend);
                    const multi = isUp ? 1 : -1;
                    return [
                        currentPrice + (lastATR * 1.5 * multi),
                        currentPrice + (lastATR * 3.0 * multi),
                        currentPrice + (lastATR * 5.0 * multi)
                    ];
                })(),
                exactTarget: (() => {
                    const res = levels.resistances;
                    const sup = levels.supports;
                    const minGap = lastATR * 1.5;
                    const findBuffer = lastATR * 0.5;

                    if (direction === 'BULLISH' || (direction === 'NEUTRAL' && isUptrend)) {
                        const nextRes = res.find(r => r > currentPrice + findBuffer);
                        return Math.max(currentPrice + minGap, nextRes || (currentPrice + (lastATR * 3.0)));
                    }
                    if (direction === 'BEARISH' || (direction === 'NEUTRAL' && isDowntrend)) {
                        const nextSup = [...sup].reverse().find(s => s < currentPrice - findBuffer);
                        return Math.min(currentPrice - minGap, nextSup || (currentPrice - (lastATR * 3.0)));
                    }
                    // Final fallback for true neutral
                    return currentPrice + (lastATR * 2.0);
                })(),
                moveDescription: (() => {
                    const avgVol = candles.slice(-20).reduce((s, c) => s + (c.volume || 0), 0) / 20;
                    const volFactor = currentCandle.volume / (avgVol || 1);
                    if (direction === 'NEUTRAL') return 'Consolidating...';
                    if (volFactor > 1.8) return 'Strong volume breakout - high target probability';
                    if (volFactor > 1.2) return 'Moderate volume support - likely continuation';
                    return 'Low volume - caution ADVISED on target';
                })()
            }
        };
    }
}
