import type { Candle, PredictionResult } from './CandleAnalysisStrategy';

export class CandlestickPatternStrategy {
    private getBodySize(c: Candle) { return Math.abs(c.close - c.open); }
    private getUpperWick(c: Candle) { return c.high - Math.max(c.open, c.close); }
    private getLowerWick(c: Candle) { return Math.min(c.open, c.close) - c.low; }
    private isBullish(c: Candle) { return c.close > c.open; }
    private isBearish(c: Candle) { return c.close < c.open; }

    public analyze(candles: Candle[]): PredictionResult | null {
        if (!candles || candles.length < 5) return null;

        const lastIdx = candles.length - 1;
        const c1 = candles[lastIdx];     // Current
        const c2 = candles[lastIdx - 1]; // Previous
        const c3 = candles[lastIdx - 2]; // 3rd last

        let pattern = "";
        let direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        let strength = 0;

        // --- Bullish Patterns ---

        // 1. Hammer
        if (this.getLowerWick(c1) > 2 * this.getBodySize(c1) && this.getUpperWick(c1) < 0.1 * this.getBodySize(c1)) {
            pattern = "HAMMER";
            direction = 'BULLISH';
            strength = 80;
        }

        // 2. Bullish Engulfing
        else if (this.isBearish(c2) && this.isBullish(c1) && c1.open < c2.close && c1.close > c2.open) {
            pattern = "BULLISH ENGULFING";
            direction = 'BULLISH';
            strength = 90;
        }

        // 3. Morning Star
        else if (this.isBearish(c3) && this.getBodySize(c2) < 0.3 * this.getBodySize(c3) && this.isBullish(c1) && c1.close > (c3.open + c3.close) / 2) {
            pattern = "MORNING STAR";
            direction = 'BULLISH';
            strength = 95;
        }

        // 4. Piercing Line
        else if (this.isBearish(c2) && this.isBullish(c1) && c1.open < c2.low && c1.close > (c2.open + c2.close) / 2) {
            pattern = "PIERCING LINE";
            direction = 'BULLISH';
            strength = 85;
        }

        // 5. Bullish Harami
        else if (this.isBearish(c2) && this.isBullish(c1) && c1.open > c2.close && c1.close < c2.open) {
            pattern = "BULLISH HARAMI";
            direction = 'BULLISH';
            strength = 75;
        }

        // 6. Tweezer Bottom
        else if (this.isBearish(c2) && this.isBullish(c1) && Math.abs(c1.low - c2.low) < (c1.high - c1.low) * 0.05) {
            pattern = "TWEEZER BOTTOM";
            direction = 'BULLISH';
            strength = 80;
        }

        // 7. Three White Soldiers
        else if (candles.length >= 3 && this.isBullish(c1) && this.isBullish(c2) && this.isBullish(c3) && c1.close > c2.close && c2.close > c3.close) {
            pattern = "3 WHITE SOLDIERS";
            direction = 'BULLISH';
            strength = 95;
        }

        // 8. White Marubozu
        else if (this.isBullish(c1) && this.getUpperWick(c1) < 0.05 * this.getBodySize(c1) && this.getLowerWick(c1) < 0.05 * this.getBodySize(c1)) {
            pattern = "MARUBOZU";
            direction = 'BULLISH';
            strength = 85;
        }

        // 9. Inverted Hammer
        else if (this.getUpperWick(c1) > 2 * this.getBodySize(c1) && this.getLowerWick(c1) < 0.1 * this.getBodySize(c1)) {
            pattern = "INVERTED HAMMER";
            direction = 'BULLISH';
            strength = 70;
        }

        // --- Bearish Patterns ---

        // 1. Shooting Star
        else if (this.getUpperWick(c1) > 2 * this.getBodySize(c1) && this.getLowerWick(c1) < 0.1 * this.getBodySize(c1) && direction === 'NEUTRAL') {
            // Logic for Shooting Star is same as Inverted Hammer visually, context matters (uptrend)
            // For now, let's treat it as Bearish if it's not already Bullish
            pattern = "SHOOTING STAR";
            direction = 'BEARISH';
            strength = 80;
        }

        // 2. Bearish Engulfing
        else if (this.isBullish(c2) && this.isBearish(c1) && c1.open > c2.close && c1.close < c2.open) {
            pattern = "BEARISH ENGULFING";
            direction = 'BEARISH';
            strength = 90;
        }

        // 3. Evening Star
        else if (this.isBullish(c3) && this.getBodySize(c2) < 0.3 * this.getBodySize(c3) && this.isBearish(c1) && c1.close < (c3.open + c3.close) / 2) {
            pattern = "EVENING STAR";
            direction = 'BEARISH';
            strength = 95;
        }

        // 4. Dark Cloud Cover
        else if (this.isBullish(c2) && this.isBearish(c1) && c1.open > c2.high && c1.close < (c2.open + c2.close) / 2) {
            pattern = "DARK CLOUD";
            direction = 'BEARISH';
            strength = 85;
        }

        // 5. Bearish Harami
        else if (this.isBullish(c2) && this.isBearish(c1) && c1.open < c2.close && c1.close > c2.open) {
            pattern = "BEARISH HARAMI";
            direction = 'BEARISH';
            strength = 75;
        }

        // 6. Tweezer Top
        else if (this.isBullish(c2) && this.isBearish(c1) && Math.abs(c1.high - c2.high) < (c1.high - c1.low) * 0.05) {
            pattern = "TWEEZER TOP";
            direction = 'BEARISH';
            strength = 80;
        }

        // 7. Three Black Crows
        else if (candles.length >= 3 && this.isBearish(c1) && this.isBearish(c2) && this.isBearish(c3) && c1.close < c2.close && c2.close < c3.close) {
            pattern = "3 BLACK CROWS";
            direction = 'BEARISH';
            strength = 95;
        }

        // 8. Hanging Man
        else if (this.getLowerWick(c1) > 2 * this.getBodySize(c1) && this.getUpperWick(c1) < 0.1 * this.getBodySize(c1) && direction === 'NEUTRAL') {
            pattern = "HANGING MAN";
            direction = 'BEARISH';
            strength = 70;
        }

        if (direction === 'NEUTRAL') return null;

        return {
            direction,
            strength,
            confidence: strength,
            targetPrice: direction === 'BULLISH' ? c1.high + (c1.high - c1.low) : c1.low - (c1.high - c1.low),
            signalText: pattern,
            metrics: {
                momentumScore: direction === 'BULLISH' ? 1 : -1,
                volumeTrend: 1,
                volatility: c1.high - c1.low
            }
        };
    }
}
