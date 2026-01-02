/**
 * Utility for Advanced Market Quote Analysis
 * Handles Bias, Depth (Support/Resistance), and Volume/OI Confirmation.
 */

export interface DepthLevel {
    price: number;
    quantity: number;
    orders: number;
}

export interface QuoteAnalysis {
    bias: {
        sentiment: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' | 'MILD_BULLISH' | 'MILD_BEARISH';
        interpretation: string;
        score: number; // 0 to 100
    };
    depth: {
        supportZone: { price: number; quantity: number };
        resistanceZone: { price: number; quantity: number };
        buyerStrength: number; // 0 to 100
        conclusion: string;
    };
    confirmation: {
        isStrong: boolean;
        message: string;
    };
}

export const analyzeQuoteData = (quote: any): QuoteAnalysis | null => {
    if (!quote) return null;

    // Normalize keys (Dhan API keys variation handling)
    const ltp = quote.last_price || quote.ltp || quote.lastPrice || quote.lp || 0;
    const high = quote.ohlc?.high || quote.high || quote.h || 0;
    const low = quote.ohlc?.low || quote.low || quote.l || 0;
    const close = quote.ohlc?.close || quote.close || quote.c || quote.prev_close || 0;
    const volume = quote.volume || quote.v || quote.vol || 0;
    const oi = quote.oi || quote.open_interest || quote.openInterest || 0;

    // Net change calculation if not provided
    const change = quote.net_change !== undefined ? quote.net_change :
        (quote.change !== undefined ? quote.change : (ltp - close));

    // 1. Bias Interpretation
    let biasSentiment: QuoteAnalysis['bias']['sentiment'] = 'SIDEWAYS';
    let biasInterpretation = '';
    let biasScore = 50;

    const range = high - low;
    const positionInRange = range > 0 ? (ltp - low) / range : 0.5;

    if (positionInRange > 0.8) {
        biasSentiment = 'BULLISH';
        biasInterpretation = 'Price is near day high. Strong upward momentum.';
        biasScore = 85;
    } else if (positionInRange > 0.6) {
        biasSentiment = 'MILD_BULLISH';
        biasInterpretation = 'Positive recovery from lows. Holding upper range.';
        biasScore = 65;
    } else if (positionInRange < 0.2) {
        biasSentiment = 'BEARISH';
        biasInterpretation = 'Price is near day low. Selling pressure is peak.';
        biasScore = 15;
    } else if (positionInRange < 0.4) {
        biasSentiment = 'MILD_BEARISH';
        biasInterpretation = 'Fading from highs. Testing lower levels.';
        biasScore = 35;
    } else {
        biasSentiment = 'SIDEWAYS';
        biasInterpretation = 'Consolidating in the middle of day range.';
        biasScore = 50;
    }

    if (change < 0 && biasSentiment === 'BULLISH') {
        biasSentiment = 'MILD_BULLISH';
        biasInterpretation += ' (Note: Net negative change suggests correction).';
    }

    // 2. Depth Analysis (Robust handle for Indices/missing depth)
    const buyDepth: DepthLevel[] = quote.depth?.buy || [];
    const sellDepth: DepthLevel[] = quote.depth?.sell || [];

    const totalBuyQty = buyDepth.reduce((acc, d) => acc + d.quantity, 0);
    const totalSellQty = sellDepth.reduce((acc, d) => acc + d.quantity, 0);

    const supportLevel = [...buyDepth].sort((a, b) => b.quantity - a.quantity)[0] || { price: 0, quantity: 0 };
    const resistanceLevel = [...sellDepth].sort((a, b) => b.quantity - a.quantity)[0] || { price: 0, quantity: 0 };

    const hasDepth = (totalBuyQty + totalSellQty) > 0;
    const buyerStrength = hasDepth ? (totalBuyQty / (totalBuyQty + totalSellQty)) * 100 : 50;

    let depthConclusion = hasDepth ? 'Market is balanced.' : 'Depth data unavailable for this instrument.';
    if (hasDepth) {
        if (buyerStrength > 60) depthConclusion = 'Buyers are substantially stronger than sellers.';
        else if (buyerStrength > 55) depthConclusion = 'Buyers are leading.';
        else if (buyerStrength < 40) depthConclusion = 'Sellers are dominating the order book.';
        else if (buyerStrength < 45) depthConclusion = 'Selling pressure is building.';
    }

    // 3. Volume + OI Confirmation
    let isConfirmed = true;
    let confirmationMsg = 'Trend continuation possible.';

    // Indices like NIFTY/SENSEX don't have OI in the spot quote
    if (oi === 0 && !hasDepth) {
        confirmationMsg = 'Spot Index analysis; based on price action only.';
    } else if (oi === 0) {
        isConfirmed = false;
        confirmationMsg = 'Low liquidity/OI; avoid high conviction.';
    } else if (Math.abs(change) > 0 && volume > 1000) {
        confirmationMsg = 'Volume supports current price action.';
    }

    // 4. Volatility & Velocity Analysis
    const pctChange = quote.percentage_change || quote.pChange || 0;
    const isVolatile = range > (close * 0.01); // Simple check: range > 1% of close

    if (isVolatile) {
        biasInterpretation += " High intraday volatility detected.";
    }

    if (Math.abs(pctChange) > 0.5) {
        biasInterpretation += " Significant trend momentum.";
    }

    return {
        bias: {
            sentiment: biasSentiment,
            interpretation: biasInterpretation,
            score: Math.round(biasScore)
        },
        depth: {
            supportZone: { price: supportLevel.price, quantity: supportLevel.quantity },
            resistanceZone: { price: resistanceLevel.price, quantity: resistanceLevel.quantity },
            buyerStrength: Math.round(buyerStrength),
            conclusion: depthConclusion
        },
        confirmation: {
            isStrong: isConfirmed,
            message: confirmationMsg
        }
    };
};
