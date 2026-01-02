import type { Candle, PredictionResult } from './CandleAnalysisStrategy';
import { RiskManager } from './RiskManager';

export interface ProfessionalSignal {
    direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    pattern: string;
    confidence: number; // 0-100
    mathScore: number; // Raw mathematical conviction
    reasons: string[];
}

export class ProfessionalStrategyEngine {
    private getBodySize(c: Candle) { return Math.abs(c.close - c.open); }
    private getUpperWick(c: Candle) { return c.high - Math.max(c.open, c.close); }
    private getLowerWick(c: Candle) { return Math.min(c.open, c.close) - c.low; }
    private isBullish(c: Candle) { return c.close > c.open; }
    private isBearish(c: Candle) { return c.close < c.open; }

    private calculateEMA(data: number[], period: number): number {
        if (data.length < period) return data[data.length - 1] || 0;
        const k = 2 / (period + 1);
        let ema = data[0];
        for (let i = 1; i < data.length; i++) {
            ema = (data[i] - ema) * k + ema;
        }
        return ema;
    }

    /**
     * ADVANCED CANDLESTICK ANALYSIS (Section 6)
     * Detects Marubozu, Hammer, Inverted Hammer, Shooting Star, Doji, Hanging Man
     */
    private detectSingleCandlePatterns(c: Candle, isUptrend: boolean, isDowntrend: boolean): ProfessionalSignal[] {
        const body = this.getBodySize(c);
        const upper = this.getUpperWick(c);
        const lower = this.getLowerWick(c);
        const total = c.high - c.low;
        const signals: ProfessionalSignal[] = [];

        if (total === 0) return signals;

        // 1. Marubozu (Section 5.1 & 5.2)
        if (body >= total * 0.9) {
            signals.push({
                direction: this.isBullish(c) ? 'BULLISH' : 'BEARISH',
                pattern: `${this.isBullish(c) ? 'Bullish' : 'Bearish'} Marubozu`,
                confidence: 90, // Boosted to ensure isCleanSignal trigger
                mathScore: this.isBullish(c) ? 0.9 : -0.9,
                reasons: ['Extreme trend conviction', 'Full body dominance']
            });
        }

        // 2. Hammer / Hanging Man (Section 5.3 & 6.Position)
        if (lower >= body * 2 && upper <= body * 0.25) {
            if (isDowntrend) {
                signals.push({
                    direction: 'BULLISH',
                    pattern: 'Hammer',
                    confidence: 88,
                    mathScore: 0.88,
                    reasons: ['Strong lower rejection', 'Buying absorption at lows']
                });
            } else if (isUptrend) {
                signals.push({
                    direction: 'BEARISH',
                    pattern: 'Hanging Man',
                    confidence: 78,
                    mathScore: -0.78,
                    reasons: ['Potential blow-off top', 'Exhaustion at highs']
                });
            }
        }

        // 3. Inverted Hammer / Shooting Star (Section 5.4 & 5.5)
        if (upper >= body * 2 && lower <= body * 0.25) {
            if (isDowntrend) {
                signals.push({
                    direction: 'BULLISH',
                    pattern: 'Inverted Hammer',
                    confidence: 75,
                    mathScore: 0.75,
                    reasons: ['Attempted rally, bottoming phase']
                });
            } else if (isUptrend) {
                signals.push({
                    direction: 'BEARISH',
                    pattern: 'Shooting Star',
                    confidence: 95,
                    mathScore: -0.95,
                    reasons: ['Major overhead rejection', 'Sellers dominant at peak']
                });
            }
        }

        // 4. Doji (Section 5.6)
        if (body <= total * 0.1) {
            const isGravestone = upper >= total * 0.7;
            const isDragonfly = lower >= total * 0.7;

            signals.push({
                direction: isGravestone ? 'BEARISH' : (isDragonfly ? 'BULLISH' : 'NEUTRAL'),
                pattern: isGravestone ? 'Gravestone Doji' : (isDragonfly ? 'Dragonfly Doji' : 'Doji'),
                confidence: (isGravestone || isDragonfly) ? 85 : 50,
                mathScore: isGravestone ? -0.85 : (isDragonfly ? 0.85 : 0),
                reasons: [
                    isGravestone ? 'Buyers rejected, bearish pivot' :
                        isDragonfly ? 'Sellers rejected, bullish pivot' :
                            'Market Indecision'
                ]
            });
        }

        return signals;
    }

    /**
     * TWO CANDLESTICK PATTERNS (Section 5.2)
     */
    private detectDoubleCandlePatterns(curr: Candle, prev: Candle): ProfessionalSignal[] {
        const signals: ProfessionalSignal[] = [];
        const isBullishEngulfing = curr.close > prev.open && curr.open < prev.close && prev.close < prev.open;
        const isBearishEngulfing = curr.close < prev.open && curr.open > prev.close && prev.close > prev.open;

        if (isBullishEngulfing) {
            signals.push({ direction: 'BULLISH', pattern: 'Bullish Engulfing', confidence: 90, mathScore: 0.9, reasons: ['Total dominant reversal', 'Previous bears liquidated'] });
        } else if (isBearishEngulfing) {
            signals.push({ direction: 'BEARISH', pattern: 'Bearish Engulfing', confidence: 90, mathScore: -0.9, reasons: ['Total dominant reversal', 'Previous bulls trapped'] });
        }

        // Harami Detection (Extended)
        const bodyRange = Math.abs(prev.close - prev.open);
        const currBody = Math.abs(curr.close - curr.open);
        const isHarami = currBody < (bodyRange * 0.4) && curr.high < prev.high && curr.low > prev.low;
        const isDoji = Math.abs(curr.close - curr.open) <= (curr.high - curr.low) * 0.1;

        if (isHarami) {
            if (isDoji) {
                signals.push({ direction: prev.close < prev.open ? 'BULLISH' : 'BEARISH', pattern: 'Harami Cross', confidence: 80, mathScore: prev.close < prev.open ? 0.8 : -0.8, reasons: ['Doji contained within previous large body', 'Potentially strong reversal'] });
            } else {
                signals.push({ direction: prev.close < prev.open ? 'BULLISH' : 'BEARISH', pattern: prev.close < prev.open ? 'Bullish Harami' : 'Bearish Harami', confidence: 70, mathScore: prev.close < prev.open ? 0.7 : -0.7, reasons: ['Inside bar consolidation'] });
            }
        }

        const variance = curr.close * 0.0003;
        if (Math.abs(curr.low - prev.low) < variance) {
            signals.push({ direction: 'BULLISH', pattern: 'Tweezer Bottom', confidence: 75, mathScore: 0.75, reasons: ['Identical lows indicating strong support floor'] });
        } else if (Math.abs(curr.high - prev.high) < variance) {
            signals.push({ direction: 'BEARISH', pattern: 'Tweezer Top', confidence: 75, mathScore: -0.75, reasons: ['Identical highs indicating strong resistance ceiling'] });
        }

        return signals;
    }

    /**
     * THREE CANDLESTICK PATTERNS (Section 5.3)
     */
    private detectTripleCandlePatterns(curr: Candle, prev: Candle, prePrev: Candle, _older?: Candle): ProfessionalSignal[] {
        const signals: ProfessionalSignal[] = [];
        const isMorningStar = prePrev.close < prePrev.open && Math.abs(prev.close - prev.open) < (Math.abs(prePrev.close - prePrev.open) * 0.3) && curr.close > curr.open && curr.close > (prePrev.open + prePrev.close) / 2;
        const isEveningStar = prePrev.close > prePrev.open && Math.abs(prev.close - prev.open) < (Math.abs(prePrev.close - prePrev.open) * 0.3) && curr.close < curr.open && curr.close < (prePrev.open + prePrev.close) / 2;
        const prevIsDoji = Math.abs(prev.close - prev.open) <= (prev.high - prev.low) * 0.1;

        if (isMorningStar) {
            const name = prevIsDoji ? 'Morning Doji Star' : 'Morning Star';
            signals.push({ direction: 'BULLISH', pattern: name, confidence: 95, mathScore: 0.95, reasons: [`Bullish reversal triplet confirmed via ${name}`] });
        } else if (isEveningStar) {
            const name = prevIsDoji ? 'Evening Doji Star' : 'Evening Star';
            signals.push({ direction: 'BEARISH', pattern: name, confidence: 95, mathScore: -0.95, reasons: [`Bearish reversal triplet confirmed via ${name}`] });
        }

        if (this.isBullish(prePrev) && this.isBullish(prev) && this.isBullish(curr) && curr.close > prev.close && prev.close > prePrev.close) {
            signals.push({ direction: 'BULLISH', pattern: 'Three White Soldiers', confidence: 90, mathScore: 0.9, reasons: ['Strong bullish momentum', 'Consecutive higher closes'] });
        } else if (this.isBearish(prePrev) && this.isBearish(prev) && this.isBearish(curr) && curr.close < prev.close && prev.close < prePrev.close) {
            signals.push({ direction: 'BEARISH', pattern: 'Three Black Crows', confidence: 90, mathScore: -0.9, reasons: ['Strong bearish momentum', 'Consecutive lower closes'] });
        }

        if (prevIsDoji) {
            const bullAbBaby = prev.high < prePrev.low && prev.high < curr.low && prePrev.close < prePrev.open && curr.close > curr.open;
            const bearAbBaby = prev.low > prePrev.high && prev.low > curr.high && prePrev.close > prePrev.open && curr.close < curr.open;
            if (bullAbBaby) signals.push({ direction: 'BULLISH', pattern: 'Abandoned Baby (Bullish)', confidence: 98, mathScore: 1.2, reasons: ['Rare gap-doji-gap bullish reversal'] });
            if (bearAbBaby) signals.push({ direction: 'BEARISH', pattern: 'Abandoned Baby (Bearish)', confidence: 98, mathScore: -1.2, reasons: ['Rare gap-doji-gap bearish reversal'] });
        }

        return signals;
    }

    private detectGapPatterns(curr: Candle, prev: Candle, candles: Candle[]): ProfessionalSignal[] {
        const signals: ProfessionalSignal[] = [];
        const isUpGap = curr.low > prev.high;
        const isDownGap = curr.high < prev.low;
        if (!isUpGap && !isDownGap) return [];

        const avgVol = candles.slice(-20).reduce((a, b) => a + (b.volume || 0), 0) / 20;
        const ema20 = this.calculateEMA(candles.map(c => c.close), 20);

        if (isUpGap) {
            let type = 'Common Gap';
            const rangeMax = Math.max(...candles.slice(-30, -1).map(c => c.high));

            // Exhaustion Gap logic (sudden gap after a long run)
            const longRun = candles.length > 50 && curr.close > this.calculateEMA(candles.map(c => c.close), 50) * 1.05;
            if (longRun && (curr.close < curr.open || this.getUpperWick(curr) > this.getBodySize(curr))) {
                type = 'Exhaustion Gap (Bearish Pivot)';
                signals.push({ direction: 'BEARISH', pattern: type, confidence: 90, mathScore: -0.9, reasons: ['Gap in extreme trend followed by rejection'] });
                return signals;
            }

            if (prev.high > rangeMax * 0.99 && curr.volume > avgVol * 1.5) type = 'Breakaway Gap';
            else if (curr.close > ema20) type = 'Runaway Gap';

            signals.push({ direction: 'BULLISH', pattern: type, confidence: type === 'Common Gap' ? 60 : 85, mathScore: 0.7, reasons: [`Bullish ${type} detected`] });
        } else {
            let type = 'Common Gap';
            const rangeMin = Math.min(...candles.slice(-30, -1).map(c => c.low));

            // Exhaustion Gap (Bearish)
            const longRunDown = candles.length > 50 && curr.close < this.calculateEMA(candles.map(c => c.close), 50) * 0.95;
            if (longRunDown && (curr.close > curr.open || this.getLowerWick(curr) > this.getBodySize(curr))) {
                type = 'Exhaustion Gap (Bullish Pivot)';
                signals.push({ direction: 'BULLISH', pattern: type, confidence: 90, mathScore: 0.9, reasons: ['Gap in extreme downtrend followed by absorption'] });
                return signals;
            }

            if (prev.low < rangeMin * 1.01 && curr.volume > avgVol * 1.5) type = 'Breakaway Gap';
            else if (curr.close < ema20) type = 'Runaway Gap';

            signals.push({ direction: 'BEARISH', pattern: type, confidence: type === 'Common Gap' ? 60 : 85, mathScore: -0.7, reasons: [`Bearish ${type} detected`] });
        }

        return signals;
    }

    /**
     * VOLUME ANALYSIS (Section 8 & 10)
     */
    private analyzeVolume(curr: Candle, prev: Candle): ProfessionalSignal[] {
        const signals: ProfessionalSignal[] = [];
        const volSurge = curr.volume > prev.volume * 2;

        if (volSurge) {
            if (this.isBullish(curr)) {
                signals.push({
                    direction: 'BULLISH',
                    pattern: 'Volume Climax (Bullish)',
                    confidence: 85,
                    mathScore: 0.85,
                    reasons: ['Extreme institutional absorption', 'Possible trend exhaustion/reversal']
                });
            } else {
                signals.push({
                    direction: 'BEARISH',
                    pattern: 'Volume Climax (Bearish)',
                    confidence: 85,
                    mathScore: -0.85,
                    reasons: ['Extreme panic selling', 'Possible trend exhaustion/reversal']
                });
            }
        }

        // Volume-Price Divergence (Price moving but volume drying)
        const volDivergence = curr.volume < prev.volume * 0.5 && Math.abs(curr.close - prev.close) > (curr.high - curr.low) * 0.5;
        if (volDivergence) {
            signals.push({
                direction: 'NEUTRAL',
                pattern: 'V-P Divergence',
                confidence: 60,
                mathScore: 0,
                reasons: ['Price and volume out of sync', 'Momentum might be fake']
            });
        }

        return signals;
    }

    /**
     * CHART PATTERNS DETECTION (Section 7)
     * Mathematical detection of H&S, Double Top/Bottom using pivots
     */
    private detectChartPatterns(candles: Candle[]): ProfessionalSignal[] {
        const signals: ProfessionalSignal[] = [];
        if (candles.length < 50) return signals;

        // Implement math for Double Top/Bottom detection
        const prices = candles.slice(-50).map(c => c.close);
        const localHighs: { v: number, i: number }[] = [];
        const localLows: { v: number, i: number }[] = [];

        for (let i = 2; i < prices.length - 2; i++) {
            if (prices[i] > prices[i - 1] && prices[i] > prices[i - 2] && prices[i] > prices[i + 1] && prices[i] > prices[i + 2]) {
                localHighs.push({ v: prices[i], i });
            }
            if (prices[i] < prices[i - 1] && prices[i] < prices[i - 2] && prices[i] < prices[i + 1] && prices[i] < prices[i + 2]) {
                localLows.push({ v: prices[i], i });
            }
        }

        // Triple Top Detection
        if (localHighs.length >= 3) {
            const h1 = localHighs[localHighs.length - 1];
            const h2 = localHighs[localHighs.length - 2];
            const h3 = localHighs[localHighs.length - 3];
            const maxDiff = Math.abs(Math.max(h1.v, h2.v, h3.v) - Math.min(h1.v, h2.v, h3.v)) / h1.v;
            if (maxDiff < 0.003) {
                signals.push({
                    direction: 'BEARISH',
                    pattern: 'Triple Top',
                    confidence: 98,
                    mathScore: -0.98,
                    reasons: ['Major multi-peak resistance', 'Confirmed institutional exit']
                });
            }
        }

        // Triple Bottom Detection
        if (localLows.length >= 3) {
            const l1 = localLows[localLows.length - 1];
            const l2 = localLows[localLows.length - 2];
            const l3 = localLows[localLows.length - 3];
            const maxDiff = Math.abs(Math.max(l1.v, l2.v, l3.v) - Math.min(l1.v, l2.v, l3.v)) / l1.v;
            if (maxDiff < 0.003) {
                signals.push({
                    direction: 'BULLISH',
                    pattern: 'Triple Bottom',
                    confidence: 98,
                    mathScore: 0.98,
                    reasons: ['Major multi-trough accumulation', 'Confirmed floor established']
                });
            }
        }

        // Double Top Detection (Adam & Eve)
        if (localHighs.length >= 2) {
            const h1 = localHighs[localHighs.length - 1];
            const h2 = localHighs[localHighs.length - 2];
            const diff = Math.abs(h1.v - h2.v) / h1.v;
            if (diff < 0.002) {
                const isAdam1 = candles[h2.i].high - Math.max(candles[h2.i].open, candles[h2.i].close) > this.getBodySize(candles[h2.i]);
                const isAdam2 = candles[h1.i].high - Math.max(candles[h1.i].open, candles[h1.i].close) > this.getBodySize(candles[h1.i]);

                let variant = 'Double Top';
                if (isAdam1 && isAdam2) variant = 'Adam & Adam Double Top';
                else if (isAdam1 && !isAdam2) variant = 'Adam & Eve Double Top';
                else if (!isAdam1 && isAdam2) variant = 'Eve & Adam Double Top';
                else variant = 'Eve & Eve Double Top';

                signals.push({
                    direction: 'BEARISH',
                    pattern: variant,
                    confidence: 95,
                    mathScore: -0.95,
                    reasons: ['Strong resistance rejection', variant]
                });
            }
        }

        // Double Bottom Detection (Adam & Eve)
        if (localLows.length >= 2) {
            const l1 = localLows[localLows.length - 1];
            const l2 = localLows[localLows.length - 2];
            const diff = Math.abs(l1.v - l2.v) / l1.v;
            if (diff < 0.002) {
                const isAdam1 = Math.min(candles[l2.i].open, candles[l2.i].close) - candles[l2.i].low > this.getBodySize(candles[l2.i]);
                const isAdam2 = Math.min(candles[l1.i].open, candles[l1.i].close) - candles[l1.i].low > this.getBodySize(candles[l1.i]);

                let variant = 'Double Bottom';
                if (isAdam1 && isAdam2) variant = 'Adam & Adam Double Bottom';
                else if (isAdam1 && !isAdam2) variant = 'Adam & Eve Double Bottom';
                else if (!isAdam1 && isAdam2) variant = 'Eve & Adam Double Bottom';
                else variant = 'Eve & Eve Double Bottom';

                signals.push({
                    direction: 'BULLISH',
                    pattern: variant,
                    confidence: 95,
                    mathScore: 0.95,
                    reasons: ['Strong support rejection', variant]
                });
            }
        }

        // 2. Ascending Triangle Detection (Pressure Check)
        if (localHighs.length >= 2 && localLows.length >= 2) {
            const h1 = localHighs[localHighs.length - 1];
            const h2 = localHighs[localHighs.length - 2];
            const l1 = localLows[localLows.length - 1];
            const l2 = localLows[localLows.length - 2];

            const isResistanceFlat = Math.abs(h1.v - h2.v) / h1.v < 0.0025;
            const isHigherLows = l1.v > l2.v * 1.0005; // Tighten for pressure check

            if (isResistanceFlat && isHigherLows) {
                signals.push({
                    direction: 'BULLISH',
                    pattern: 'Ascending Triangle',
                    confidence: 90,
                    mathScore: 0.9,
                    reasons: ['Accumulation at resistance', 'Strong higher lows pressure']
                });
            }
        }

        // 3. Descending Triangle Detection
        if (localHighs.length >= 2 && localLows.length >= 2) {
            const h1 = localHighs[localHighs.length - 1];
            const h2 = localHighs[localHighs.length - 2];
            const l1 = localLows[localLows.length - 1];
            const l2 = localLows[localLows.length - 2];

            const isSupportFlat = Math.abs(l1.v - l2.v) / l1.v < 0.0025;
            const isLowerHighs = h1.v < h2.v * 0.9995;

            if (isSupportFlat && isLowerHighs) {
                signals.push({
                    direction: 'BEARISH',
                    pattern: 'Descending Triangle',
                    confidence: 90,
                    mathScore: -0.9,
                    reasons: ['Persistent selling pressure', 'Fixed floor being challenged']
                });
            }
        }

        // 4. Head and Shoulders
        if (localHighs.length >= 3) {
            const h1 = localHighs[localHighs.length - 1]; // Right Shoulder
            const h2 = localHighs[localHighs.length - 2]; // Head
            const h3 = localHighs[localHighs.length - 3]; // Left Shoulder
            if (h2.v > h1.v && h2.v > h3.v && Math.abs(h1.v - h3.v) / h1.v < 0.01) {
                signals.push({
                    direction: 'BEARISH',
                    pattern: 'Head and Shoulders',
                    confidence: 98,
                    mathScore: -0.98,
                    reasons: ['Major trend reversal pattern', 'Exhaustion after failed peak expansion']
                });
            }
        }

        // 5. Inverted Head and Shoulders
        if (localLows.length >= 3) {
            const l1 = localLows[localLows.length - 1]; // Right Shoulder
            const l2 = localLows[localLows.length - 2]; // Head
            const l3 = localLows[localLows.length - 3]; // Left Shoulder
            if (l2.v < l1.v && l2.v < l3.v && Math.abs(l1.v - l3.v) / l1.v < 0.01) {
                signals.push({
                    direction: 'BULLISH',
                    pattern: 'Inverted Head & Shoulders',
                    confidence: 98,
                    mathScore: 0.98,
                    reasons: ['Major trend reversal pattern', 'Buyers establishing local floor']
                });
            }
        }

        // 6. Cup and Handle (Section 7)
        if (localLows.length >= 4) {
            const l1 = localLows[localLows.length - 1]; // Handle
            const l2 = localLows[localLows.length - 2]; // Cup bottom
            const l3 = localLows[localLows.length - 3]; // Cup left rim

            if (l2.v < l1.v && l2.v < l3.v && l1.v < l3.v && (l3.v - l2.v) > (l1.v - l2.v) * 2) {
                signals.push({
                    direction: 'BULLISH',
                    pattern: 'Cup and Handle',
                    confidence: 85,
                    mathScore: 0.85,
                    reasons: ['Bullish continuation pattern', 'Healthy consolidation before breakout']
                });
            }
        }

        // 7. Channels, Wedges & Triangles
        if (localHighs.length >= 2 && localLows.length >= 2) {
            const h1 = localHighs[localHighs.length - 1];
            const h2 = localHighs[localHighs.length - 2];
            const l1 = localLows[localLows.length - 1];
            const l2 = localLows[localLows.length - 2];

            const slopeHigh = (h1.v - h2.v) / (h1.i - h2.i);
            const slopeLow = (l1.v - l2.v) / (l1.i - l2.i);

            // Rising Wedge (Bearish)
            if (slopeHigh > 0 && slopeLow > 0 && slopeLow > slopeHigh * 1.2) {
                signals.push({ direction: 'BEARISH', pattern: 'Rising Wedge', confidence: 85, mathScore: -0.85, reasons: ['Bearish volatility compression'] });
            }
            // Falling Wedge (Bullish)
            else if (slopeHigh < 0 && slopeLow < 0 && slopeHigh < slopeLow * 1.2) {
                signals.push({ direction: 'BULLISH', pattern: 'Falling Wedge', confidence: 85, mathScore: 0.85, reasons: ['Bullish volatility compression'] });
            }
            // Symmetrical Triangle
            else if (slopeHigh < -0.0001 && slopeLow > 0.0001 && Math.abs(slopeHigh + slopeLow) < 0.001) {
                signals.push({ direction: 'NEUTRAL', pattern: 'Symmetrical Triangle', confidence: 80, mathScore: 0, reasons: ['Neutral coil pattern'] });
            }
            // Channels
            else if (h1.v > h2.v && l1.v > l2.v) {
                signals.push({ direction: 'BULLISH', pattern: 'Rising Channel', confidence: 75, mathScore: 0.5, reasons: ['Uptrend structure'] });
            } else if (h1.v < h2.v && l1.v < l2.v) {
                signals.push({ direction: 'BEARISH', pattern: 'Falling Channel', confidence: 75, mathScore: -0.5, reasons: ['Downtrend structure'] });
            }
        }

        // 8. Flags & Pennants
        const poleWindow = candles.slice(-30, -10);
        const flagWindow = candles.slice(-10);
        if (poleWindow.length >= 15) {
            const poleMove = poleWindow[poleWindow.length - 1].close - poleWindow[0].open;
            const flagMove = flagWindow[flagWindow.length - 1].close - flagWindow[0].open;
            if (poleMove > 0 && Math.abs(flagMove) < poleMove * 0.3) {
                signals.push({ direction: 'BULLISH', pattern: 'Bull Flag', confidence: 80, mathScore: 0.8, reasons: ['Trend continuation setup'] });
            } else if (poleMove < 0 && Math.abs(flagMove) < Math.abs(poleMove) * 0.3) {
                signals.push({ direction: 'BEARISH', pattern: 'Bear Flag', confidence: 80, mathScore: -0.8, reasons: ['Trend continuation setup'] });
            }
        }

        return signals;
    }

    public analyze(candles: Candle[]): PredictionResult | null {
        if (!candles || candles.length < 30) return null;

        const curr = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        const prePrev = candles[candles.length - 3];

        // ALTERNATIVE HYPER-FAST EMA (3/8 for 20.25 ultra-early entries)
        const closes = candles.map(c => c.close);
        const ema3 = this.calculateEMA(closes, 3);
        const ema8 = this.calculateEMA(closes, 8);
        const isUptrend = ema3 > ema8;
        const isDowntrend = ema3 < ema8;

        let aggregateScore = 0;
        const activeSignals: ProfessionalSignal[] = [];

        // Alternative Aggressive Trend Confirmation (3/8)
        if (ema3 > ema8 && closes[closes.length - 1] > ema3) {
            activeSignals.push({
                direction: 'BULLISH',
                pattern: '3/8 EMA Cross (Early)',
                confidence: 72,
                mathScore: 0.55,
                reasons: ['Ultra-fast trend breakout', '3/8 alternative crossover']
            });
        } else if (ema3 < ema8 && closes[closes.length - 1] < ema3) {
            activeSignals.push({
                direction: 'BEARISH',
                pattern: '3/8 EMA Cross (Early)',
                confidence: 72,
                mathScore: -0.55,
                reasons: ['Ultra-fast trend breakdown', '3/8 alternative crossover']
            });
        }

        // Single Candle Patterns
        const single = this.detectSingleCandlePatterns(curr, isUptrend, isDowntrend);
        activeSignals.push(...single);

        // Gap Patterns (Crucial for institutional moves)
        const gap = this.detectGapPatterns(curr, prev, candles);
        activeSignals.push(...gap);

        // Double Candle Patterns
        const double = this.detectDoubleCandlePatterns(curr, prev);
        activeSignals.push(...double);

        // Triple Candle Patterns
        const triple = this.detectTripleCandlePatterns(curr, prev, prePrev, candles[candles.length - 4]);
        activeSignals.push(...triple);

        // 4. Volume Analysis
        const volume = this.analyzeVolume(curr, prev);
        activeSignals.push(...volume);

        // --- NEW: Rectangle & Trap Detection ---
        const rect = this.detectRectanglePattern(candles);
        activeSignals.push(...rect);

        const traps = this.detectTraps(candles);
        activeSignals.push(...traps);

        // 5. Chart Patterns
        const charts = this.detectChartPatterns(candles);
        activeSignals.push(...charts);

        // 6. Measured Move
        const mm = this.detectMeasuredMove(candles);
        activeSignals.push(...mm);

        // 7. Institutional Patterns
        const inst = this.detectInstitutionalPatterns(candles);
        activeSignals.push(...inst);

        // 8. Harmonic Patterns
        const harmonics = this.detectHarmonicPatterns(candles);
        activeSignals.push(...harmonics);

        // 9. Elliott Wave (Impulse)
        const elliott = this.detectElliottWave(candles);
        activeSignals.push(...elliott);

        if (activeSignals.length === 0) return null;

        // Mathematical Fusion
        activeSignals.forEach(s => aggregateScore += s.mathScore);

        const direction = aggregateScore > 0.5 ? 'BULLISH' : (aggregateScore < -0.5 ? 'BEARISH' : 'NEUTRAL');
        const patternLabel = activeSignals.map(s => s.pattern).join(' + ');

        // Calculate Mathematical Target & SL using RiskManager
        const volatility = curr.high - curr.low;
        const initialSL = RiskManager.getInitialStopLoss(curr.close, direction === 'BULLISH' ? 'BULLISH' : 'BEARISH', { high: curr.high, low: curr.low }, volatility);
        const riskData = RiskManager.calculatePositionSize(100000, 1, curr.close, initialSL);

        return {
            direction,
            strength: Math.min(100, Math.abs(aggregateScore) * 100),
            confidence: Math.min(98, Math.abs(aggregateScore) * 100),
            targetPrice: riskData.targets[0],
            targets: riskData.targets, // T1, T2, T3
            stopLossPrice: riskData.stopLoss,
            entryPrice: curr.close,
            signalText: patternLabel,
            metrics: {
                momentumScore: aggregateScore,
                volumeTrend: curr.volume || 0,
                volatility: curr.high - curr.low,
                recommendedLots: riskData.recommendedLots,
                positionSize: riskData.positionSize
            }
        };
    }

    private detectMeasuredMove(candles: Candle[]): ProfessionalSignal[] {
        const signals: ProfessionalSignal[] = [];
        const pivots = this.getPivotPoints(candles.map(c => c.close));
        if (pivots.length < 3) return [];

        const a = pivots[pivots.length - 3].v;
        const b = pivots[pivots.length - 2].v;
        const c = pivots[pivots.length - 1].v;
        const curr = candles[candles.length - 1].close;

        const move1 = Math.abs(b - a);
        const move2 = Math.abs(curr - c);

        if (b > a && c < b && c > a && curr > c) {
            if (Math.abs(move1 - move2) / move1 < 0.1) signals.push({ direction: 'BULLISH', pattern: 'Measured Move (ABC)', confidence: 85, mathScore: 0.9, reasons: ['Bullish ABC structure completed'] });
        } else if (b < a && c > b && c < a && curr < c) {
            if (Math.abs(move1 - move2) / move1 < 0.1) signals.push({ direction: 'BEARISH', pattern: 'Measured Move (ABC Down)', confidence: 85, mathScore: -0.9, reasons: ['Bearish ABC structure completed'] });
        }
        return signals;
    }

    private detectInstitutionalPatterns(candles: Candle[]): ProfessionalSignal[] {
        const signals: ProfessionalSignal[] = [];
        const curr = candles[candles.length - 1];
        const rangeMin = Math.min(...candles.slice(-20, -1).map(c => c.low));
        const rangeMax = Math.max(...candles.slice(-20, -1).map(c => c.high));

        if (curr.low < rangeMin && curr.close > rangeMin) {
            signals.push({ direction: 'BULLISH', pattern: 'Wyckoff Spring', confidence: 95, mathScore: 1.1, reasons: ['Fakeout below support followed by recovery'] });
        }
        if (curr.high > rangeMax && curr.close < rangeMax) {
            signals.push({ direction: 'BEARISH', pattern: 'Wyckoff Upthrust', confidence: 95, mathScore: -1.1, reasons: ['Fakeout above resistance followed by rejection'] });
        }

        const prev = candles[candles.length - 2];
        const prePrev = candles[candles.length - 3];
        if (prev.high < prePrev.low && curr.low > prev.high) signals.push({ direction: 'BULLISH', pattern: 'Island Reversal (Bullish)', confidence: 98, mathScore: 1.25, reasons: ['Isolated price island'] });
        if (prev.low > prePrev.high && curr.high < prev.low) signals.push({ direction: 'BEARISH', pattern: 'Island Reversal (Bearish)', confidence: 98, mathScore: -1.25, reasons: ['Isolated price island'] });

        return signals;
    }

    private detectHarmonicPatterns(candles: Candle[]): ProfessionalSignal[] {
        const signals: ProfessionalSignal[] = [];
        const pivots = this.getPivotPoints(candles.map(c => c.close));
        if (pivots.length < 5) return [];

        const x = pivots[pivots.length - 5].v;
        const a = pivots[pivots.length - 4].v;
        const b = pivots[pivots.length - 3].v;
        const c = pivots[pivots.length - 2].v;
        const d = pivots[pivots.length - 1].v;

        const xa = Math.abs(a - x);
        const ab = Math.abs(b - a);
        const ad = Math.abs(d - a);

        // Bullish Gartley
        if (a > x && b < a && c > b && d < c && d > x) {
            const ab_xa = ab / xa;
            const ad_xa = ad / xa;
            if (this.isNear(ab_xa, 0.618) && this.isNear(ad_xa, 0.786)) {
                signals.push({ direction: 'BULLISH', pattern: 'Gartley (Bullish)', confidence: 95, mathScore: 1.1, reasons: ['Bullish Harmonic Gartley completed', 'Fibonacci ratios 0.618/0.786 confirmed'] });
            }
        }
        // Bullish Bat
        if (a > x && b < a && c > b && d < c && d > x) {
            const ab_xa = ab / xa;
            const ad_xa = ad / xa;
            if (this.isNear(ab_xa, 0.382) && this.isNear(ad_xa, 0.886)) {
                signals.push({ direction: 'BULLISH', pattern: 'Bat (Bullish)', confidence: 95, mathScore: 1.1, reasons: ['Bullish Harmonic Bat completed', 'Fibonacci ratios 0.382/0.886 confirmed'] });
            }
        }
        return signals;
    }

    private detectElliottWave(candles: Candle[]): ProfessionalSignal[] {
        const signals: ProfessionalSignal[] = [];
        const pivots = this.getPivotPoints(candles.map(c => c.close));
        if (pivots.length < 5) return [];

        const w1 = pivots[pivots.length - 5];
        const w2 = pivots[pivots.length - 4];
        const w3 = pivots[pivots.length - 3];
        const w4 = pivots[pivots.length - 2];
        const w5 = pivots[pivots.length - 1];

        // Bullish Impulse (1-2-3-4-5)
        if (w1.v < w3.v && w3.v < w5.v && w2.v < w4.v && w2.v > w1.v && w4.v > w2.v) {
            const move1 = Math.abs(w1.v - pivots[pivots.length - 6]?.v || 0);
            const move3 = Math.abs(w3.v - w2.v);
            const move5 = Math.abs(w5.v - w4.v);
            if (move3 > move1 && move3 > move5) {
                signals.push({ direction: 'BULLISH', pattern: 'Elliott Wave (Impulse 1-5)', confidence: 90, mathScore: 1.0, reasons: ['Bullish Elliott Impulse completed', 'Wave 3 is the longest extending wave'] });
            }
        }
        return signals;
    }

    private isNear(val: number, target: number, tolerance: number = 0.05): boolean {
        return Math.abs(val - target) / target < tolerance;
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

    private detectRectanglePattern(candles: Candle[]): ProfessionalSignal[] {
        if (candles.length < 20) return [];
        const window = candles.slice(-20);
        const highs = window.map(c => c.high);
        const lows = window.map(c => c.low);
        const maxHigh = Math.max(...highs);
        const minLow = Math.min(...lows);

        const totalRange = maxHigh - minLow;
        const atrs = this.calculateATR(window, 14);
        const avgATR = atrs[atrs.length - 1];

        // If the 20-candle range is less than 2x ATR, it's a tight compression box
        if (totalRange < avgATR * 2.0) {
            return [{
                direction: 'NEUTRAL',
                pattern: 'Rectangle (Tight Box)',
                confidence: 90,
                mathScore: 0,
                reasons: ['Market in tight compression', 'Avoid mid-range signals', 'High breakout impact expected']
            }];
        }
        return [];
    }

    public validateBreakout(candles: Candle[], direction: 'BULLISH' | 'BEARISH'): boolean {
        if (candles.length < 5) return false;
        const curr = candles[candles.length - 1];
        const avgVol = candles.slice(-20).reduce((a, b) => a + (b.volume || 0), 0) / 20;

        // 1. Volume Check (Institutional force)
        const hasInstitutionalVolume = (curr.volume || 0) > avgVol * 1.5;

        // 2. Body vs Wick Check (Avoid pokes)
        const range = curr.high - curr.low;
        const body = Math.abs(curr.close - curr.open);
        const hasSolidBody = body > range * 0.5;

        // 3. Rejection Check (Avoid long wicks in breakout direction)
        const upperWick = curr.high - Math.max(curr.open, curr.close);
        const lowerWick = Math.min(curr.open, curr.close) - curr.low;
        const hasRejection = direction === 'BULLISH' ? (upperWick > body * 0.8) : (lowerWick > body * 0.8);

        return hasInstitutionalVolume && hasSolidBody && !hasRejection;
    }

    private detectTraps(candles: Candle[]): ProfessionalSignal[] {
        if (candles.length < 5) return [];
        const curr = candles[candles.length - 1];
        const prev = candles[candles.length - 2];

        const avgVol = candles.slice(-20).reduce((a, b) => a + (b.volume || 0), 0) / 20;
        const window10 = candles.slice(-12, -2);
        const high10 = Math.max(...window10.map(c => c.high));
        const low10 = Math.min(...window10.map(c => c.low));

        // 1️⃣ Institutional Rejection (V-Reversal / U-Turn)
        // Previous candle broke out, but current candle ENGULFS it back inside
        if (prev.high > high10 && curr.close < prev.low && curr.close < high10) {
            return [{
                direction: 'BEARISH',
                pattern: 'V-Rejection (Bull Trap)',
                confidence: 98,
                mathScore: -1.5,
                reasons: ['Institutional U-turn detected', 'Breakout immediately engulfed', 'Massive bull trap confirmed']
            }];
        }

        if (prev.low < low10 && curr.close > prev.high && curr.close > low10) {
            return [{
                direction: 'BULLISH',
                pattern: 'V-Rejection (Bear Trap)',
                confidence: 98,
                mathScore: 1.5,
                reasons: ['Institutional U-turn detected', 'Breakdown immediately absorbed', 'Massive bear trap confirmed']
            }];
        }

        // 2️⃣ Classic Bull/Bear Traps (Close back inside)
        if (prev.high > high10 && curr.close < high10 && curr.volume > avgVol) {
            return [{
                direction: 'BEARISH',
                pattern: 'Bull Trap (Failed Breakout)',
                confidence: 92,
                mathScore: -1.2,
                reasons: ['Failed breakout above resistance', 'Price rejected back into range']
            }];
        }

        if (prev.low < low10 && curr.close > low10 && curr.volume > avgVol) {
            return [{
                direction: 'BULLISH',
                pattern: 'Bear Trap (Failed Breakdown)',
                confidence: 92,
                mathScore: 1.2,
                reasons: ['Failed breakdown below support', 'Price recovered quickly']
            }];
        }

        // 3️⃣ Wick Rejection (Institutional Poke)
        const currUpperWick = curr.high - Math.max(curr.open, curr.close);

        if (curr.high > high10 && currUpperWick > (curr.high - curr.low) * 0.6) {
            return [{
                direction: 'BEARISH',
                pattern: 'Institutional Rejection (High)',
                confidence: 88,
                mathScore: -1.0,
                reasons: ['Pin bar rejection at resistance', 'Institutional selling detected']
            }];
        }

        return [];
    }

    private getPivotPoints(data: number[]): { v: number, i: number }[] {
        const pivots: { v: number, i: number }[] = [];
        for (let i = 2; i < data.length - 2; i++) {
            if (data[i] > data[i - 1] && data[i] > data[i - 2] && data[i] > data[i + 1] && data[i] > data[i + 2]) {
                pivots.push({ v: data[i], i });
            } else if (data[i] < data[i - 1] && data[i] < data[i - 2] && data[i] < data[i + 1] && data[i] < data[i + 2]) {
                pivots.push({ v: data[i], i });
            }
        }
        return pivots;
    }
}
