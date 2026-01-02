import type { Candle, PredictionResult } from './CandleAnalysisStrategy';
import { ProfessionalStrategyEngine } from './ProfessionalStrategyEngine';
import { CandleDirectionStrategy } from './CandleDirectionStrategyNew';

export interface MasterSignal extends PredictionResult {
    convictionScore: number;
    isCleanSignal?: boolean;
    logicPath: string;
}

type InstrumentProfile = {
    atrLowVolPct: number;
    emaSqueezePct: number;
    macdDeadAtrRatio: number;
    minTrendStrength: number;
};

const INSTRUMENT_PROFILES: Record<string, InstrumentProfile> = {
    NIFTY: {
        atrLowVolPct: 0.10,
        emaSqueezePct: 0.04,
        macdDeadAtrRatio: 0.04,
        minTrendStrength: 0.38
    },
    BANKNIFTY: {
        atrLowVolPct: 0.15,
        emaSqueezePct: 0.06,
        macdDeadAtrRatio: 0.06,
        minTrendStrength: 0.42
    },
    MCX: {
        atrLowVolPct: 0.20,
        emaSqueezePct: 0.08,
        macdDeadAtrRatio: 0.07,
        minTrendStrength: 0.45
    }
};

export class MasterSignalEngine {
    private techEngine: CandleDirectionStrategy;
    private proEngine: ProfessionalStrategyEngine;

    constructor() {
        this.techEngine = new CandleDirectionStrategy();
        this.proEngine = new ProfessionalStrategyEngine();
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

    private calculateEMA(data: number[], period: number): number[] {
        const emas: number[] = new Array(data.length).fill(0);
        if (data.length < period) return emas;
        const k = 2 / (period + 1);
        let sum = 0;
        for (let i = 0; i < period; i++) sum += data[i];
        emas[period - 1] = sum / period;
        for (let i = period; i < data.length; i++) {
            emas[i] = (data[i] - emas[i - 1]) * k + emas[i - 1];
        }
        return emas;
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

    private calculateMACD(data: number[]): { macdLine: number[] } {
        const fastEMA = this.calculateEMA(data, 12);
        const slowEMA = this.calculateEMA(data, 26);
        const macdLine = fastEMA.map((f, i) => f - slowEMA[i]);
        return { macdLine };
    }

    public analyze(candles: Candle[]): MasterSignal | null {
        if (!candles || candles.length < 20) return null;

        // Optimization: Cap the data used for indicators to the last 250 candles
        // 250 candles is more than enough for stabilization of 50 EMA and 14 ATR
        const dataCount = candles.length;
        const analysisWindow = dataCount > 250 ? candles.slice(-250) : candles;
        const lastIdx = analysisWindow.length - 1;

        const currentCandle = analysisWindow[lastIdx];
        const currentPrice = currentCandle.close;

        // --- STEP 1: DETECT INSTRUMENT PROFILE ---
        // Enhanced symbol detection (using symbol property if available, or guessing from price)
        const symbol = (currentCandle as any).symbol?.toUpperCase() || 'NIFTY';
        const profile = INSTRUMENT_PROFILES[symbol] ||
            (currentPrice > 50000 ? INSTRUMENT_PROFILES.BANKNIFTY :
                (currentPrice < 1000 ? INSTRUMENT_PROFILES.MCX : INSTRUMENT_PROFILES.NIFTY));

        // --- STEP 2: CALCULATE REQUIRED VARIABLES ---
        const closes = analysisWindow.map(c => c.close);
        const atrs = this.calculateATR(analysisWindow, 14);

        // --- HULL MOVING AVERAGE (HMA) ALTERNATIVE ---
        // Replacing EMA 2/7 with HMA 9/21 for superior trend fidelity and zero lag
        const emaFast = this.calculateHMA(closes, 9);
        const emaSlow = this.calculateHMA(closes, 21);

        const { macdLine } = this.calculateMACD(closes);

        const lastATR = Math.max(atrs[lastIdx], currentPrice * 0.001);
        const lastEmaFast = emaFast[lastIdx];
        const lastEmaSlow = emaSlow[lastIdx];
        const lastMACD = macdLine[lastIdx];
        const lastVolume = currentCandle.volume || 0;
        const avgVolume =
            candles.slice(-20).reduce((s, c) => s + (c.volume || 0), 0) / 20;

        const bodySize = Math.abs(currentCandle.close - currentCandle.open);

        // Define trend direction for the filter
        const isUptrend = lastEmaFast > lastEmaSlow;
        const isDowntrend = lastEmaFast < lastEmaSlow;

        // ======================================================
        // 🔥 ADX-LITE (TREND STRENGTH FILTER)
        // ======================================================

        // Price expansion over last N candles
        const trendLookback = 6;

        // Directional move
        const priceMove =
            Math.abs(candles[lastIdx].close - candles[lastIdx - trendLookback].close);

        // Noise (sum of ranges)
        const noise = candles
            .slice(lastIdx - trendLookback, lastIdx)
            .reduce((s, c) => s + (c.high - c.low), 0);

        // Trend Strength Ratio
        const trendStrength = noise === 0 ? 0 : priceMove / noise;

        // EMA direction alignment
        const emaDirectionAligned =
            (isUptrend && currentPrice > lastEmaFast) ||
            (isDowntrend && currentPrice < lastEmaFast);

        // ADX-Lite verdict
        const isWeakTrend = trendStrength < profile.minTrendStrength;
        const isStrongTrend = trendStrength > 0.55;

        // --- STEP 3: 🔥 ADAPTIVE CHOP FILTER SYSTEM ---
        // ======================================================
        // 🔥 CHOP FILTER SYSTEM (FALSE SIGNAL KILLER)
        // ======================================================

        // 1️⃣ ATR Compression (Low volatility chop)
        const atrPercent = (lastATR / currentPrice) * 100;
        const isLowVolatility = atrPercent < profile.atrLowVolPct;

        // 2️⃣ EMA Squeeze (Sideways market)
        const emaGap = Math.abs(lastEmaFast - lastEmaSlow);
        const emaGapPercent = (emaGap / currentPrice) * 100;
        const isEmaSqueezed = emaGapPercent < profile.emaSqueezePct;

        // 3️⃣ MACD Dead Zone (No momentum)
        const macdDeadZone = Math.abs(lastMACD) < lastATR * profile.macdDeadAtrRatio;

        // 4️⃣ Volume Dryness (Fake moves)
        const isVolumeDry = lastVolume < avgVolume * 0.6;

        // 5️⃣ Micro Candle Noise
        const isMicroCandle = bodySize < lastATR * 0.15;

        // 🧠 CHOP SCORE (3+ = NO TRADE)
        const chopScore =
            (isLowVolatility ? 1 : 0) +
            (isEmaSqueezed ? 1 : 0) +
            (macdDeadZone ? 1 : 0) +
            (isVolumeDry ? 1 : 0) +
            (isMicroCandle ? 1 : 0) +
            (isWeakTrend ? 1 : 0);

        // BankNifty tolerates noise → require higher score
        const chopThreshold = symbol === 'BANKNIFTY' ? 4 : 3;
        const isChoppyMarket = chopScore >= chopThreshold;

        // --- STEP 4: RUN ENGINES ---
        const techResult = this.techEngine.analyze(candles);
        const proResult = this.proEngine.analyze(candles);

        if (!techResult) return null;

        // High-Quality Breakout Validation
        const isTechBreakout = techResult.signalText.includes('BREAKOUT');
        const isHighQualityBreakout = isTechBreakout && this.proEngine.validateBreakout(analysisWindow, techResult.direction === 'BULLISH' ? 'BULLISH' : 'BEARISH');

        const isVolumeBreakout = isHighQualityBreakout && (techResult.metrics.volumeTrend || 0) > 1.5;
        const isORBBreakoutUp = techResult.signalText.includes('ORB') && techResult.direction === 'BULLISH' && isHighQualityBreakout;
        const isORBBreakoutDown = techResult.signalText.includes('ORB') && techResult.direction === 'BEARISH' && isHighQualityBreakout;

        // 🔒 CHOP GATE (With Trap & Breakout Validation)
        // ======================================================
        // 🚫 MASTER CHOP GATE
        // Allow ONLY validated high-quality breakouts or pro signals
        // ======================================================
        const hasInstitutionalTrap = proResult && (proResult.signalText.includes('Trap') || proResult.signalText.includes('Rejection'));

        if (
            ((isChoppyMarket || isWeakTrend) &&
                !isVolumeBreakout &&
                !isORBBreakoutUp &&
                !isORBBreakoutDown &&
                !techResult.signalText.includes('MOMENTUM') && // BYPASS FOR 20.25 FAST MOVES
                !(proResult && proResult.confidence > 82)) || // Lowered from 88
            hasInstitutionalTrap
        ) {
            const isTrapBlock = hasInstitutionalTrap;
            return {
                direction: isTrapBlock ? proResult!.direction : 'NEUTRAL',
                strength: isTrapBlock ? proResult!.strength : 20,
                confidence: isTrapBlock ? proResult!.confidence : 20,
                entryPrice: currentPrice,
                targetPrice: isTrapBlock ? proResult!.targetPrice : currentPrice,
                targets: isTrapBlock ? proResult!.targets : [],
                stopLossPrice: isTrapBlock ? proResult!.stopLossPrice : currentPrice,
                signalText: isTrapBlock ? proResult!.signalText : (isWeakTrend ? 'NO TREND (ADX-LITE)' : `CHOP (${symbol}) – WAIT`),
                metrics: {
                    momentumScore: techResult.metrics.momentumScore,
                    volumeTrend: techResult.metrics.volumeTrend,
                    volatility: lastATR,
                    chopScore,
                    trendStrength,
                    atrPercent,
                    emaGapPercent
                },
                supports: techResult.supports?.slice(-3) || [],
                resistances: techResult.resistances?.slice(-3) || [],
                insight: {
                    ...techResult.insight,
                    volatilityLabel: isTrapBlock ? 'HIGH' : 'LOW',
                    volumeActivity: isTrapBlock ? 'SURGE' : 'QUIET',
                    marketTrend: isTrapBlock ? (proResult!.direction === 'BULLISH' ? 'BULLISH' : 'BEARISH') : 'SIDEWAYS',
                    candlestickStructure: isTrapBlock ? 'Institutional Rejection' : 'Weak',
                    volumeConfirmation: isTrapBlock ? 'Institutional Absorption' : 'Weak / Dry',
                    nextLikelyTrend: isTrapBlock ? proResult!.direction : 'Neutral'
                } as any,
                convictionScore: isTrapBlock ? proResult!.confidence : 20,
                logicPath: isTrapBlock ? `TRAP DETECTED: ${proResult!.signalText}` : (isWeakTrend ? 'ADX-LITE WEAK TREND' : `CHOP GATE: ${chopScore}/5`)
            };
        }

        // Weights
        // Institutional Flow (tech's VWAP logic) + Trend (EMAs) + Pattern (Pro)
        let totalScore = 0;
        let finalDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        let reasons: string[] = [];

        // 1. Technical Sentiment (Trend + VWAP + RSI)
        // We use the "marketSentimentScore" from techResult as a baseline (0-100)
        const techScore = techResult?.insight?.marketSentimentScore || 50;
        const techWeight = 0.4;
        totalScore += (techScore - 50) * techWeight; // Normalize to -20 to +20

        // 2. Professional Patterns
        let proPatternScore = 0;
        if (proResult) {
            proPatternScore = proResult.confidence * (proResult.direction === 'BULLISH' ? 1 : -1);
            reasons.push(proResult.signalText);
        }
        const proWeight = 0.4;
        totalScore += (proPatternScore / 100) * 40 * proWeight; // Normalize to -16 to +16

        // 3. Volatility & Breakout Confluence
        let momentumScore = 0;
        if (techResult && techResult.signalText.includes('BREAKOUT')) momentumScore = 20;
        if (techResult && techResult.signalText.includes('REVERSAL')) momentumScore = 15;
        if (techResult && techResult.direction === 'BEARISH') momentumScore *= -1;

        totalScore += momentumScore;

        // Determine Final Direction
        const convictionThreshold = 10; // Normalized scale

        // MASTER CHOP GATE ENFORCEMENT
        // This block is now redundant due to the early return chop gate above,
        // but keeping the structure for finalDirection assignment based on totalScore.
        if (totalScore > convictionThreshold) {
            finalDirection = 'BULLISH';
        } else if (totalScore < -convictionThreshold) {
            finalDirection = 'BEARISH';
        } else {
            finalDirection = 'NEUTRAL';
        }

        // Calculate Final Conviction Score (0-100)
        let convictionScore = Math.min(100, Math.abs(totalScore) * 2);

        // STEP 4: BOOST CONFIDENCE FOR REAL TRENDS
        if (isStrongTrend && emaDirectionAligned) {
            convictionScore += 10;
        }
        convictionScore = Math.min(100, convictionScore);

        // Final Signal Text Construction
        let signalText = techResult?.signalText || proResult?.signalText || 'NEUTRAL';

        // MULTIPLE STRATEGY COMBINATION LOGIC
        // If we have both a Sniper/Technical signal AND a Professional Pattern signal
        if (techResult && proResult && techResult.direction === proResult.direction && techResult.direction !== 'NEUTRAL') {
            const shortPro = proResult.signalText.split('+')[0].trim(); // Take only the first/strongest pattern
            const shortTech = techResult.signalText.replace('REVERSAL', '').trim(); // Shorten 'SNIPER REVERSAL' to 'SNIPER'

            signalText = `${shortTech} + ${shortPro}`;
        }
        else if (techResult && (techResult.signalText.includes('SNIPER') || techResult.signalText.includes('MOMENTUM'))) {
            signalText = techResult.signalText;
        }

        // 🎯 Final Result Construction
        const finalSL = techResult?.stopLossPrice || currentPrice;
        const finalTargets = techResult?.targets || [currentPrice];

        // 🔗 Insight Unification (Synchronize UI with Final Synthesis)
        const finalInsight = {
            ...(techResult?.insight || {}),
            marketSentimentScore: Math.round(50 + (totalScore * 2)), // Dynamic score based on synthesis
            nextLikelyTrend: finalDirection === 'NEUTRAL' ? 'Neutral' : (finalDirection === 'BULLISH' ? 'Bullish' : 'Bearish'),
            marketTrend: finalDirection,
            exactTarget: finalTargets[0] || (currentPrice + (lastATR * 2)),
            targets: finalTargets.length > 0 ? finalTargets : [(finalDirection === 'BULLISH' ? currentPrice + (lastATR * 2) : currentPrice - (lastATR * 2))],
            currentPrice: currentPrice,
            moveDescription: signalText // Use the clean signal text directly
        };

        // --- PROFESSIONAL SIGNAL FILTER (Restored for Stability) ---
        // Require strict trend alignment and high conviction.
        const isMomentumStrong = techResult.metrics.momentumScore > 60 || techResult.metrics.momentumScore < 40;

        const isCleanSignal = Boolean(
            // 1. Must NOT be choppy
            !isChoppyMarket &&
            // 2. Must meet Volume & Trend criteria
            !isVolumeDry &&
            // 3. High Conviction Threshold (70%+) or Very Strong Momentum with Trend
            (
                (convictionScore >= 70 && !isWeakTrend) ||
                (convictionScore >= 65 && isMomentumStrong && !isWeakTrend) ||
                (proResult && proResult.confidence > 88) // Only Pro patterns with extreme confidence
            )
        );

        return {
            direction: finalDirection,
            strength: convictionScore,
            confidence: convictionScore,
            entryPrice: currentPrice,
            targetPrice: finalInsight.targets[0],
            targets: finalInsight.targets,
            stopLossPrice: finalSL,
            signalText: (isChoppyMarket && !isVolumeBreakout && !proResult) ? 'CHOP ZONE – WAIT' : (finalDirection === 'NEUTRAL' ? 'SIDEWAYS / WAIT' : signalText.toUpperCase()),
            convictionScore,
            isCleanSignal, // Flag for high-quality chart markers
            logicPath: reasons.join(' | '),
            metrics: {
                momentumScore: techResult.metrics.momentumScore,
                volumeTrend: techResult.metrics.volumeTrend,
                volatility: lastATR,
                chopScore,
                trendStrength,
                atrPercent,
                emaGapPercent
            },
            supports: techResult?.supports || [],
            resistances: techResult?.resistances || [],
            supplyZones: techResult?.supplyZones || [],
            demandZones: techResult?.demandZones || [],
            insight: finalInsight as any
        };
    }
}
