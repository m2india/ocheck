import type { Candle, PredictionResult } from './CandleAnalysisStrategy';

export class SnRStrategy {
    public analyze(candles: Candle[], type: 'SNR' | 'PROJ_SNR' = 'SNR'): PredictionResult | null {
        if (!candles || candles.length < 50) return null;

        const lastPrice = candles[candles.length - 1].close;
        const result: PredictionResult = {
            direction: 'NEUTRAL',
            strength: 50,
            confidence: 60,
            targetPrice: lastPrice,
            signalText: type === 'SNR' ? 'Support & Resistance' : 'Projected S&R',
            metrics: {
                momentumScore: 0,
                volumeTrend: 1,
                volatility: 0
            }
        };

        if (type === 'SNR') {
            const pivots = this.findPivots(candles);
            const levels = this.clusterPivots(pivots, lastPrice);
            (result as any).snrLevels = levels;
            result.signalText = `SnR (${levels.length} zones found)`;
        } else {
            const projected = this.calculateProjected(candles);
            (result as any).snrLevels = projected;
            result.signalText = "Projected Volatility Channels";
            result.targetPrice = projected.find(l => l.type === 'RESISTANCE')?.price || lastPrice;
        }

        return result;
    }

    private findPivots(candles: Candle[]): number[] {
        const pivots: number[] = [];
        const window = 5;
        for (let i = window; i < candles.length - window; i++) {
            const high = candles[i].high;
            const low = candles[i].low;

            let isHigh = true;
            let isLow = true;
            for (let j = 1; j <= window; j++) {
                if (candles[i - j].high > high || candles[i + j].high > high) isHigh = false;
                if (candles[i - j].low < low || candles[i + j].low < low) isLow = false;
            }
            if (isHigh) pivots.push(high);
            if (isLow) pivots.push(low);
        }
        return pivots;
    }

    private clusterPivots(pivots: number[], lastPrice: number): { price: number, type: 'SUPPORT' | 'RESISTANCE' }[] {
        if (pivots.length === 0) return [];
        const sorted = [...new Set(pivots.map(p => Math.round(p * 10) / 10))].sort((a, b) => a - b);
        const uniqueLevels = sorted.filter((p, i) => i === 0 || p > sorted[i - 1] * 1.002);

        return uniqueLevels.slice(-8).map(p => ({
            price: p,
            type: p > lastPrice ? 'RESISTANCE' : 'SUPPORT'
        }));
    }

    private calculateProjected(candles: Candle[]): { price: number, type: 'SUPPORT' | 'RESISTANCE' }[] {
        const lastCandle = candles[candles.length - 1];
        const lastPrice = lastCandle.close;

        let totalRange = 0;
        const period = 14;
        for (let i = Math.max(0, candles.length - period); i < candles.length; i++) {
            totalRange += (candles[i].high - candles[i].low);
        }
        const atr = totalRange / Math.min(period, candles.length);

        return [
            { price: lastPrice + (atr * 1.5), type: 'RESISTANCE' },
            { price: lastPrice + (atr * 2.5), type: 'RESISTANCE' },
            { price: lastPrice - (atr * 1.5), type: 'SUPPORT' },
            { price: lastPrice - (atr * 2.5), type: 'SUPPORT' }
        ];
    }
}
