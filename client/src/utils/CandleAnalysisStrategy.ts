export interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface StrategyConfig {
    lookbackPeriod: number; // 2-20
    bodyWeight: number;     // Multiplier for body size
    wickWeight: number;     // Multiplier for wick influence
    volumeWeight: number;   // Multiplier for volume impact
    sensitivity: number;    // Threshold for valid signal (e.g., 50)
    lineLength: number;     // ATR multiplier for target distance
}

export interface PredictionResult {
    direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    strength: number; // Absolute score
    confidence: number; // 0-100
    entryPrice?: number;
    targetPrice: number;
    targets?: number[];
    stopLossPrice?: number;
    signalText: string;
    metrics: {
        momentumScore: number;
        volumeTrend: number;
        volatility: number;
        recommendedLots?: number;
        positionSize?: number;
        chopScore?: number;
        atrPercent?: number;
        emaGapPercent?: number;
        trendStrength?: number;
    };
    cpr?: any; // Add optional CPR levels for rendering
    supplyZones?: { top: number; bottom: number }[];
    demandZones?: { top: number; bottom: number }[];
    supports?: number[];
    resistances?: number[];
    insight?: {
        candlestickStructure: string;
        volumeConfirmation: string;
        nextLikelyTrend: string;
        marketTrend?: string; // BULLISH, BEARISH, or SIDEWAYS
        marketTrendPct?: number; // Real-time percentage change from open
        marketSentimentScore?: number; // Technical strength score (0-100)
        currentPrice?: number;
        targetPrice?: number;
        targets?: number[];
        exactTarget?: number;
        moveDescription?: string;
        volumeActivity?: string;
        volatilityLabel?: string;
        liquidityLabel?: string;
    };
}

export class CandleAnalysisStrategy {
    private config: StrategyConfig;

    constructor(config?: Partial<StrategyConfig>) {
        this.config = {
            lookbackPeriod: 5,
            bodyWeight: 1.0,
            wickWeight: 0.5,
            volumeWeight: 0.8,
            sensitivity: 2.0,
            lineLength: 2.0,
            ...config
        };
    }

    public updateConfig(newConfig: Partial<StrategyConfig>) {
        this.config = { ...this.config, ...newConfig };
    }

    public analyze(candles: Candle[]): PredictionResult | null {
        if (!candles || candles.length < Math.max(20, this.config.lookbackPeriod + 1)) {
            return null;
        }

        // Use the most recent completed candles + current candle if needed
        // Assuming 'candles' ends with the most recent one. 
        // We analyze the window defined by lookbackPeriod ending at the last candle.
        const window = candles.slice(-this.config.lookbackPeriod);


        if (window.length === 0) return null;

        // 1. Calculate Average Volume (Simple Moving Average of volume over last 20 periods)
        // We use up to 20 candles prior to the window for average volume baseline
        const volLookback = candles.slice(-20);
        const avgVol = volLookback.reduce((sum, c) => sum + c.volume, 0) / volLookback.length;

        let totalScore = 0;
        let totalVolumeInfluence = 0;

        window.forEach((candle) => {

            const body = candle.close - candle.open;
            const absBody = Math.abs(body);
            const isGreen = body >= 0;

            const upperWick = candle.high - Math.max(candle.open, candle.close);
            const lowerWick = Math.min(candle.open, candle.close) - candle.low;

            // Normalized component scores (relative to range to handle different price scales)
            // But strict points are better for meaningful accumulation if we normalize by price or ATR later.
            // Let's use raw types first but weighted.

            // Body Score: Positive for Green, Negative for Red
            const bodyScore = (isGreen ? 1 : -1) * absBody * this.config.bodyWeight;

            // Wick Score: Lower wick is bullish (rejection of lows), Upper wick is bearish (rejection of highs)
            const wickScore = (lowerWick * this.config.wickWeight) - (upperWick * this.config.wickWeight);

            // Volume Multiplier
            const volRatio = avgVol > 0 ? (candle.volume / avgVol) : 1;
            // If high volume, amplify the move. If weak volume, dampen it? 
            // Or add a raw volume score?
            // User asked "weighted by your preference"
            // "Volume Activity" usually confirms price. High volume Green = Strong Bull. High volume Red = Strong Bear.

            const rawCandleScore = bodyScore + wickScore;

            // Apply volume weight: score is amplified by volume excess
            // e.g., if volRatio is 1.5 and weight is 1, multiplier = 1.5. 
            // Base multiplier is 1.
            const volMultiplier = 1 + ((volRatio - 1) * this.config.volumeWeight);

            const finalCandleScore = rawCandleScore * Math.max(0.2, volMultiplier); // Ensure not zeroing out too much

            totalScore += finalCandleScore;
            totalVolumeInfluence += volRatio;
        });

        // 2. Determine Sentiment
        // Normalize total score by Average True Range (ATR) to make it price-agnostic
        // Calculate ATR of the last 14 candles
        const atrPeriod = 14;
        const atrData = candles.slice(-(atrPeriod + 1));
        let trSum = 0;
        for (let i = 1; i < atrData.length; i++) {
            const curr = atrData[i];
            const prev = atrData[i - 1];
            const tr = Math.max(
                curr.high - curr.low,
                Math.abs(curr.high - prev.close),
                Math.abs(curr.low - prev.close)
            );
            trSum += tr;
        }
        const atr = trSum / atrPeriod || 1;

        // Normalized Score: Total Score / ATR
        // This tells us how many "ATRs" worth of bullish/bearish pressure exists
        const normalizedScore = totalScore / atr;

        let direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        if (normalizedScore > this.config.sensitivity) {
            direction = 'BULLISH';
        } else if (normalizedScore < -this.config.sensitivity) {
            direction = 'BEARISH';
        }

        // 3. Target Calculation
        const lastClose = candles[candles.length - 1].close;
        const targetDist = atr * this.config.lineLength;
        const targetPrice = direction === 'BULLISH'
            ? lastClose + targetDist
            : (direction === 'BEARISH' ? lastClose - targetDist : lastClose);

        // 4. Signal Text & Confidence
        const confidence = Math.min(Math.abs(normalizedScore) * 10, 100); // Rough mapping
        const signalText = direction === 'NEUTRAL'
            ? 'SIDEWAYS'
            : `${direction} (${Math.round(confidence)}%)`;

        return {
            direction,
            strength: Math.abs(normalizedScore),
            confidence,
            targetPrice,
            signalText,
            metrics: {
                momentumScore: normalizedScore,
                volumeTrend: totalVolumeInfluence / window.length,
                volatility: atr
            }
        };
    }
}
