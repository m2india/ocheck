export interface TradeLock {
    timeframe: '1m' | '3m' | '5m' | '10m' | '15m';
    candleTime: number;
    entry: number;
    target: number;
    stopLoss: number;
    status: 'ACTIVE' | 'TARGET_HIT' | 'SL_HIT' | 'EXPIRED';
    type: 'CE' | 'PE';
    strike: number;
    confidence: number;
    logged?: boolean;
}

export interface Recommendation {
    action: 'CALL' | 'PUT' | 'WAIT';
    strike: number;
    optionType: 'CE' | 'PE';
    entry: number;
    targets: { '1m': number; '3m': number; '5m': number; '10m': number; '15m': number };
    underlyingTargets?: { '1m': number; '3m': number; '5m': number; '10m': number; '15m': number };
    stopLoss: number;
    underlyingStopLoss?: number;
    confidence: number;
    strength: 'LOW' | 'MEDIUM' | 'STRONG' | 'VERY_STRONG';
    locks: Record<'1m' | '3m' | '5m' | '10m' | '15m', TradeLock | null>;
}

export interface SentimentAnalysisResult {
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number;
    reasons: string[];
    bullishRec: Recommendation | null;
    bearishRec: Recommendation | null;
    bullishRecs: Recommendation[]; // Top 4
    bearishRecs: Recommendation[]; // Top 4
    newLogs?: TradeLock[];
    details: {
        totalCEScore: number; // Represents BULLISH Force
        totalPEScore: number; // Represents BEARISH Force
        ceScore: number;
        peScore: number;
        bestCE?: any;
        bestPE?: any;
        allScoredCE?: any[];
        allScoredPE?: any[];
    };
}

/* =========================
   🔒 TRADE LOCK STORAGE
 ========================= */
const tradeLocks: Record<string, Record<'1m' | '3m' | '5m' | '10m' | '15m', TradeLock | null>> = {};

export const calculateAISentiment = (
    processedStrikes: any[],
    scripName: string = 'COMMON',
    expiry: string = '',
    now: number = Date.now(),
    underlyingPrice: number = 0
): SentimentAnalysisResult => {

    const contextKey = `${scripName}_${expiry}`;

    let MIN_VOLUME = 5;
    let MIN_OI = 10;
    let MAX_SPREAD_PCT = 10.0; // Relaxed for wider scanning

    if (scripName === 'NIFTY' || scripName === 'SENSEX' || scripName === 'BANKNIFTY') {
        MIN_VOLUME = 50; // Reduced for indices
        MIN_OI = 50;     // Reduced for indices
        MAX_SPREAD_PCT = 15.0;
    } else if (['NATURALGAS', 'CRUDEOIL', 'SILVER', 'GOLD'].includes(scripName)) {
        MIN_VOLUME = 1;      // Commodities often have very low lot volume/liquidity in options
        MIN_OI = 2;          // Be extremely permissive for commodities
        MAX_SPREAD_PCT = 35.0; // Spreads are notoriously wide in MCX options
    }

    const tradableStrikes = processedStrikes.filter(s => {
        // Spread check: If Bid/Ask missing (common in some feeds), assume valid spread (0)
        const ceSpread = (s.callAsk > 0 && s.callBid > 0) ? ((s.callAsk - s.callBid) / s.callAsk) * 100 : 0;
        const peSpread = (s.putAsk > 0 && s.putBid > 0) ? ((s.putAsk - s.putBid) / s.putAsk) * 100 : 0;


        const isCeLiquid = s.callVolume >= MIN_VOLUME && s.callOI >= MIN_OI && ceSpread <= MAX_SPREAD_PCT;
        const isPeLiquid = s.putVolume >= MIN_VOLUME && s.putOI >= MIN_OI && peSpread <= MAX_SPREAD_PCT;

        // Pass if EITHER is liquid, OR if we just have Price/OI data (fallback for missing volume)
        return isCeLiquid || isPeLiquid || (s.callLTP > 0 || s.putLTP > 0);
    });

    const usableStrikes = tradableStrikes.length > 0 ? tradableStrikes : processedStrikes;

    const maxCallVol = Math.max(...usableStrikes.map(s => s.callVolume || 0), 1);
    const maxPutVol = Math.max(...usableStrikes.map(s => s.putVolume || 0), 1);

    // SCORING LOGIC WITH BUILDUP DETECTION
    let totalBullishScore = 0;
    let totalBearishScore = 0;
    const scoredCE: any[] = [];
    const scoredPE: any[] = [];

    // Reasons accumulator
    const bullishReasons: Set<string> = new Set();
    const bearishReasons: Set<string> = new Set();

    for (const s of usableStrikes) {
        // Price Changes
        const ceChange = (s.callLTP - (s.callPrev || s.callLTP));
        const peChange = (s.putLTP - (s.putPrev || s.putLTP));

        // Volume weighting (Normalized)
        const volWeightCE = (s.callVolume / maxCallVol);
        const volWeightPE = (s.putVolume / maxPutVol);

        // 1. CALL Analysis
        if (s.callOIChg > 0 && ceChange > 0) {
            // Long Buildup (BULLISH)
            const score = volWeightCE * 1.2;
            totalBullishScore += score;
            s.ceTrend = 'Long Buildup';
            scoredCE.push({ ...s, score: score, trend: 'Long Buildup' });
            if (score > 0.5) bullishReasons.add('Strong Call Buying (Long Buildup)');
        }
        else if (s.callOIChg > 0 && ceChange < 0) {
            // Short Buildup (BEARISH - Call Writing)
            const score = volWeightCE * 1.5;
            totalBearishScore += score;
            s.ceTrend = 'Short Buildup';
            scoredCE.push({ ...s, score: -score, trend: 'Short Buildup' });
            if (score > 0.5) bearishReasons.add('Heavy Call Writing (Resistance)');
        }
        else if (s.callOIChg < 0 && ceChange < 0) {
            // Long Unwinding (BEARISH)
            const score = volWeightCE * 0.8;
            totalBearishScore += score;
            s.ceTrend = 'Long Unwind';
            scoredCE.push({ ...s, score: -score, trend: 'Long Unwind' });
        }
        else if (s.callOIChg < 0 && ceChange > 0) {
            // Short Covering (BULLISH)
            const score = volWeightCE * 1.1;
            totalBullishScore += score;
            s.ceTrend = 'Short Covering';
            scoredCE.push({ ...s, score: score * 1.2, trend: 'Short Covering' });
            if (score > 0.4) bullishReasons.add('Short Covering in Calls');
        }
        // FAILSAFE: Pure Price Momentum (If OI Data invalid/static)
        else if (s.callOIChg === 0 && ceChange > 0) {
            const baseScore = Math.max(volWeightCE, 0.5); // Ensure at least 0.5 score
            const score = baseScore * 0.5;
            totalBullishScore += score;
            scoredCE.push({ ...s, score: score, trend: 'Price Momentum' });
        }
        // FAILSAFE: High Liquidity Flat (If Market is flat but active)
        else if (ceChange === 0 && s.callVolume > 0) {
            const score = volWeightCE * 0.1; // Tiny positive score for liquidity
            scoredCE.push({ ...s, score: score, trend: 'Consolidation' });
        }

        // 2. PUT Analysis
        if (s.putOIChg > 0 && peChange > 0) {
            // Long Buildup (BEARISH - Buying Puts)
            const score = volWeightPE * 1.2;
            totalBearishScore += score;
            s.peTrend = 'Long Buildup';
            scoredPE.push({ ...s, score: score, trend: 'Long Buildup' });
            if (score > 0.5) bearishReasons.add('Strong Put Buying (Long Buildup)');
        }
        else if (s.putOIChg > 0 && peChange < 0) {
            // Short Buildup (BULLISH - Put Writing)
            const score = volWeightPE * 1.5;
            totalBullishScore += score;
            s.peTrend = 'Short Buildup';
            scoredPE.push({ ...s, score: -score, trend: 'Short Buildup' });
            if (score > 0.5) bullishReasons.add('Heavy Put Writing (Support)');
        }
        else if (s.putOIChg < 0 && peChange < 0) {
            // Long Unwinding (BULLISH - Exiting Puts)
            const score = volWeightPE * 0.8;
            totalBullishScore += score;
            s.peTrend = 'Long Unwind';
            scoredPE.push({ ...s, score: -score, trend: 'Long Unwind' });
        }
        else if (s.putOIChg < 0 && peChange > 0) {
            // Short Covering (BEARISH)
            const score = volWeightPE * 1.1;
            totalBearishScore += score;
            s.peTrend = 'Short Covering';
            scoredPE.push({ ...s, score: score * 1.2, trend: 'Short Covering' });
            if (score > 0.4) bearishReasons.add('Short Covering in Puts');
        }
        // FAILSAFE: Pure Price Momentum (If OI Data invalid/static)
        else if (s.putOIChg === 0 && peChange > 0) {
            const baseScore = Math.max(volWeightPE, 0.5); // Ensure at least 0.5 score
            const score = baseScore * 0.5;
            totalBearishScore += score;
            scoredPE.push({ ...s, score: score, trend: 'Price Momentum' });
        }
        // FAILSAFE: High Liquidity Flat
        else if (peChange === 0 && s.putVolume > 0) {
            const score = volWeightPE * 0.1;
            scoredPE.push({ ...s, score: score, trend: 'Consolidation' });
        }
    }

    // Determine Sentiment
    let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    const totalScore = totalBullishScore + totalBearishScore;

    // More stringent threshold for signals
    const thresholdPercentage = 15; // 15% diff required
    const diffPct = totalScore > 0 ? (Math.abs(totalBullishScore - totalBearishScore) / totalScore) * 100 : 0;

    if (totalBullishScore > totalBearishScore && diffPct > thresholdPercentage) sentiment = 'BULLISH';
    else if (totalBearishScore > totalBullishScore && diffPct > thresholdPercentage) sentiment = 'BEARISH';

    let aiConfidence = Math.min(diffPct * 2 + 40, 98); // Boost confidence logic
    if (totalScore < 10) aiConfidence = Math.min(aiConfidence, 40); // Low volume penalty

    const reasons: string[] = [];
    if (aiConfidence < 50) {
        sentiment = 'NEUTRAL';
        reasons.push('Market direction unclear (Consolidation)');
    } else {
        if (sentiment === 'BULLISH') reasons.push(...Array.from(bullishReasons).slice(0, 3));
        if (sentiment === 'BEARISH') reasons.push(...Array.from(bearishReasons).slice(0, 3));
    }

    const pendingLogs: TradeLock[] = [];

    const buildRecommendation = (type: 'CE' | 'PE', index: number = 0): Recommendation | null => {
        // Filter only positive score strikes (meaning Buying or Short Covering)
        // We shouldn't recommend buying an option that is being Written (Short Buildup)
        const candidates = type === 'CE' ? scoredCE.filter(s => s.score > 0) : scoredPE.filter(s => s.score > 0);
        const sorted = candidates.sort((a, b) => b.score - a.score);
        const bestStrike = sorted[index];

        if (!bestStrike) return null;
        const ltp = type === 'CE' ? bestStrike.callLTP : bestStrike.putLTP;
        if (!ltp || ltp <= 0) return null;

        const dualKey = `${contextKey}_${type}_${bestStrike.strike}`;
        if (!tradeLocks[dualKey]) tradeLocks[dualKey] = { '1m': null, '3m': null, '5m': null, '10m': null, '15m': null };

        const getLock = (tf: '1m' | '3m' | '5m' | '10m' | '15m', atrMult: number): TradeLock | null => {
            const candleSize = tf === '1m' ? 60000 : tf === '3m' ? 180000 : tf === '5m' ? 300000 : tf === '10m' ? 600000 : 900000;
            const candleTime = Math.floor(now / candleSize) * candleSize;
            const existing = tradeLocks[dualKey][tf];

            if (existing && existing.candleTime === candleTime) {
                if (existing.status === 'ACTIVE') {
                    if (ltp >= existing.target) existing.status = 'TARGET_HIT';
                    else if (ltp <= existing.stopLoss) existing.status = 'SL_HIT';
                    if (existing.status !== 'ACTIVE' && !existing.logged) {
                        pendingLogs.push({ ...existing });
                        existing.logged = true;
                    }
                }
                // FILTER OUT Completed Trades from Recommendations so they don't show again
                if (existing.status !== 'ACTIVE') {
                    return null;
                }
                return existing;
            }

            let atrProxy = Math.max(ltp * 0.05, 1);
            if (scripName === 'NIFTY' || scripName === 'BANKNIFTY') atrProxy = Math.max(ltp * 0.10, 5);

            const lock: TradeLock = {
                timeframe: tf, candleTime, entry: ltp,
                target: ltp + atrProxy * atrMult,
                stopLoss: ltp - (atrProxy * atrMult * 0.5),
                status: 'ACTIVE', type, strike: bestStrike.strike, confidence: Math.round(aiConfidence)
            };
            tradeLocks[dualKey][tf] = lock;
            return lock;
        };

        const locks = {
            '1m': getLock('1m', 0.6),
            '3m': getLock('3m', 1.2),
            '5m': getLock('5m', 2.0),
            '10m': getLock('10m', 2.8),
            '15m': getLock('15m', 3.5)
        };

        // If primary timeframe (3m) is finished/null, skip this recommendation
        if (!locks['3m']) return null;


        const sideConfidence = aiConfidence;

        // Calculate Underlying Targets
        const uAtr = (scripName === 'NIFTY' || scripName === 'SENSEX') ? 25 : (scripName === 'BANKNIFTY' ? 60 : (underlyingPrice * 0.002));
        const uTargets = {
            '1m': underlyingPrice + (type === 'CE' ? uAtr * 0.8 : -uAtr * 0.8),
            '3m': underlyingPrice + (type === 'CE' ? uAtr * 1.5 : -uAtr * 1.5),
            '5m': underlyingPrice + (type === 'CE' ? uAtr * 2.5 : -uAtr * 2.5),
            '10m': underlyingPrice + (type === 'CE' ? uAtr * 3.5 : -uAtr * 3.5),
            '15m': underlyingPrice + (type === 'CE' ? uAtr * 4.5 : -uAtr * 4.5),
        };
        const uSL = underlyingPrice + (type === 'CE' ? -uAtr * 1.2 : uAtr * 1.2);

        return {
            action: type === 'CE' ? 'CALL' : 'PUT',
            strike: bestStrike.strike,
            optionType: type,
            entry: locks['3m'].entry,
            targets: {
                '1m': locks['1m'] ? locks['1m'].target : 0,
                '3m': locks['3m'].target,
                '5m': locks['5m'] ? locks['5m'].target : 0,
                '10m': locks['10m'] ? locks['10m'].target : 0,
                '15m': locks['15m'] ? locks['15m'].target : 0
            },
            underlyingTargets: uTargets,
            stopLoss: locks['3m'].stopLoss,
            underlyingStopLoss: uSL,
            confidence: Math.round(sideConfidence),
            strength: sideConfidence > 80 ? 'VERY_STRONG' : sideConfidence > 65 ? 'STRONG' : sideConfidence > 45 ? 'MEDIUM' : 'LOW',
            locks
        };
    };

    // Generate Top 4 Recommendations
    let bullishRecs = [0, 1, 2, 3].map(i => buildRecommendation('CE', i)).filter(r => r !== null) as Recommendation[];
    let bearishRecs = [0, 1, 2, 3].map(i => buildRecommendation('PE', i)).filter(r => r !== null) as Recommendation[];
    // ---------------------------------------------------------------------------------------------

    return {
        sentiment,
        confidence: Math.round(aiConfidence),
        reasons: reasons,
        bullishRec: bullishRecs[0] || null,
        bearishRec: bearishRecs[0] || null,
        bullishRecs,
        bearishRecs,
        newLogs: pendingLogs,
        details: {
            totalCEScore: Number(totalBullishScore.toFixed(2)), // Mapped to Bullish for UI compat
            totalPEScore: Number(totalBearishScore.toFixed(2)), // Mapped to Bearish for UI compat
            ceScore: Number(totalBullishScore.toFixed(2)),
            peScore: Number(totalBearishScore.toFixed(2)),
            bestCE: scoredCE.sort((a, b) => b.score - a.score)[0],
            bestPE: scoredPE.sort((a, b) => b.score - a.score)[0],
            allScoredCE: scoredCE,
            allScoredPE: scoredPE
        }
    };
};
