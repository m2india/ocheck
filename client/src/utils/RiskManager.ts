export interface RiskCalculations {
    positionSize: number;
    recommendedLots: number;
    stopLoss: number;
    targets: number[];
    riskRewardRatio: number;
}

export class RiskManager {
    /**
     * Calculates professional position sizing (Section 12)
     */
    public static calculatePositionSize(
        capital: number,
        riskPerTradePct: number,
        entry: number,
        stopLoss: number,
        lotSize: number = 1
    ): RiskCalculations {
        const riskAmount = capital * (riskPerTradePct / 100);
        const slDistance = Math.abs(entry - stopLoss);

        // Calculation of Position Size (Section 12)
        const positionSize = slDistance > 0 ? (riskAmount / slDistance) : 0;
        const recommendedLots = Math.floor(positionSize / lotSize) || 1;

        const targets = [
            entry + (slDistance * 1.5), // T1: 1.5R
            entry + (slDistance * 2.5), // T2: 2.5R
            entry + (slDistance * 4.0)  // T3: 4.0R
        ];

        return {
            positionSize: Number(positionSize.toFixed(2)),
            recommendedLots,
            stopLoss,
            targets: targets.map(t => Number(t.toFixed(2))),
            riskRewardRatio: Number(((targets[0] - entry) / slDistance).toFixed(2))
        };
    }

    /**
     * Initial Stop Loss Strategies (Section 13)
     */
    public static getInitialStopLoss(
        entry: number,
        direction: 'BULLISH' | 'BEARISH',
        signalCandle: { high: number, low: number },
        atrVolatility?: number
    ): number {
        if (direction === 'BULLISH') {
            const sl = signalCandle.low;
            // Fallback buffer if low is too close to entry
            if (atrVolatility && (entry - sl) < (atrVolatility * 0.5)) {
                return entry - (atrVolatility * 1.5);
            }
            return sl;
        } else {
            const sl = signalCandle.high;
            if (atrVolatility && (sl - entry) < (atrVolatility * 0.5)) {
                return entry + (atrVolatility * 1.5);
            }
            return sl;
        }
    }

    /**
     * Trailing Stop Loss Logic (Section 14)
     */
    public static calculateTrailingSL(
        currentPrice: number,
        entryPrice: number,
        currentSL: number,
        direction: 'BULLISH' | 'BEARISH',
        volatility: number
    ): number {
        const profit = direction === 'BULLISH' ? currentPrice - entryPrice : entryPrice - currentPrice;

        // Only start trailing after 1.5R profit
        if (profit > volatility * 1.5) {
            const newSL = direction === 'BULLISH'
                ? Math.max(currentSL, currentPrice - (volatility * 1.2))
                : Math.min(currentSL, currentPrice + (volatility * 1.2));
            return newSL;
        }
        return currentSL;
    }
}
