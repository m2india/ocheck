import React, { useMemo } from 'react';
import { calculateAISentiment } from './utils/AITradingStrategy';
import './MarketSentiment.css';

interface Props {
    data: any;
    scripName?: string;
    analysis?: SentimentAnalysis | any;
}

// Lot sizes mapping for user-specific definition of "1 Lot"
const LOT_SIZES: Record<string, number> = {
    'NIFTY': 75,
    'SENSEX': 20,
    'BANKNIFTY': 15,
    'NATURALGAS': 1250,
    'CRUDEOIL': 100,
    'GOLD': 100,
    'SILVER': 30
};

interface SentimentAnalysis {
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number;
    ceScore: number;
    peScore: number;
    bullishRec: any;
    bearishRec: any;
    newLogs: any[];
}

const MarketSentiment: React.FC<Props> = ({ data, scripName = 'NIFTY', analysis: passedAnalysis }) => {

    const analysis = useMemo((): SentimentAnalysis | null => {
        const lotSize = LOT_SIZES[scripName] || 1;

        const processRec = (rec: any) => {
            if (!rec) return null;
            const next1MinProfit = (rec.targets['1m'] - rec.entry) * lotSize;
            const next3MinProfit = (rec.targets['3m'] - rec.entry) * lotSize;
            const next5MinProfit = (rec.targets['5m'] - rec.entry) * lotSize;
            const next15MinProfit = (rec.targets['15m'] - rec.entry) * lotSize;
            const maxLoss = (rec.entry - rec.stopLoss) * lotSize;

            return {
                ...rec,
                next1MinProfit,
                next3MinProfit,
                next5MinProfit,
                next15MinProfit,
                maxLoss,
                profitAmount: next3MinProfit,
                next1MinStatus: rec.locks['1m']?.status || 'ACTIVE',
                next3MinStatus: rec.locks['3m']?.status || 'ACTIVE',
                next5MinStatus: rec.locks['5m']?.status || 'ACTIVE',
                next15MinStatus: rec.locks['15m']?.status || 'ACTIVE'
            };
        };

        if (passedAnalysis) {
            return {
                sentiment: passedAnalysis.sentiment,
                confidence: passedAnalysis.confidence,
                ceScore: passedAnalysis.details.ceScore,
                peScore: passedAnalysis.details.peScore,
                bullishRec: processRec(passedAnalysis.bullishRec),
                bearishRec: processRec(passedAnalysis.bearishRec),
                newLogs: passedAnalysis.newLogs || [],
            };
        }

        if (!data) return null;

        const underlyingPrice = data.underlyingPrice || data.data?.last_price || data.underlyingValue || 0;
        const ocData = data.oc || data.data?.oc || data.data?.options || {};

        if (underlyingPrice === 0 || Object.keys(ocData).length === 0) return null;

        let processedStrikes: any[] = [];
        if (Array.isArray(ocData)) {
            processedStrikes = ocData.map(strikeData => {
                const strikePrice = parseFloat(strikeData.strike_price || strikeData.strikePrice || strikeData.StrikePrice || 0);
                return { strikeData, strikePrice };
            });
        } else {
            processedStrikes = Object.keys(ocData).map(strikeKey => {
                const strikeData = ocData[strikeKey];
                const strikePrice = parseFloat(strikeKey);
                return { strikeData, strikePrice };
            });
        }

        const strikes = processedStrikes.map(({ strikeData, strikePrice }) => {
            if (!strikePrice || isNaN(strikePrice)) return null;

            return {
                strike: strikePrice,
                callOI: strikeData.ce?.oi || strikeData.ce?.openInterest || 0,
                putOI: strikeData.pe?.oi || strikeData.pe?.openInterest || 0,
                callVolume: strikeData.ce?.volume || 0,
                putVolume: strikeData.pe?.volume || 0,
                callOIChg: strikeData.ce?.changeinOpenInterest || 0,
                putOIChg: strikeData.pe?.changeinOpenInterest || 0,
                callLTP: strikeData.ce?.lastPrice || strikeData.ce?.last_price || 0,
                putLTP: strikeData.pe?.lastPrice || strikeData.pe?.last_price || 0,
                callAsk: strikeData.ce?.ask || strikeData.ce?.askPrice || strikeData.ce?.lastPrice || 0,
                callBid: strikeData.ce?.bid || strikeData.ce?.bidPrice || strikeData.ce?.lastPrice || 0,
                putAsk: strikeData.pe?.ask || strikeData.pe?.askPrice || strikeData.pe?.lastPrice || 0,
                putBid: strikeData.pe?.bid || strikeData.pe?.bidPrice || strikeData.pe?.lastPrice || 0,
                callGamma: strikeData.ce?.gamma || strikeData.ce?.greeks?.gamma || 0,
                putGamma: strikeData.pe?.gamma || strikeData.pe?.greeks?.gamma || 0,
            };
        }).filter(s => s !== null).sort((a, b) => a!.strike - b!.strike) as any[];

        if (strikes.length === 0) return null;

        const aiAnalysis = calculateAISentiment(strikes, scripName, data.expiryDate || '', Date.now(), underlyingPrice);

        return {
            sentiment: aiAnalysis.sentiment,
            confidence: aiAnalysis.confidence,
            ceScore: aiAnalysis.details.ceScore,
            peScore: aiAnalysis.details.peScore,
            bullishRec: processRec(aiAnalysis.bullishRec),
            bearishRec: processRec(aiAnalysis.bearishRec),
            newLogs: aiAnalysis.newLogs || [],
        };
    }, [data, scripName, passedAnalysis]);

    const getSentimentColor = (type: 'BULLISH' | 'BEARISH') => {
        return type === 'BULLISH' ? '#4ade80' : '#f87171';
    };

    const getSentimentIcon = (type: 'BULLISH' | 'BEARISH') => {
        return type === 'BULLISH' ? '📈' : '📉';
    };

    const getConfidenceLabel = (rec: any) => {
        if (!rec) return '';
        if (rec.strength === 'VERY_STRONG') return 'VERY STRONG';
        if (rec.confidence >= 80) return 'Strong';
        if (rec.confidence >= 60) return 'Moderate';
        return 'Weak';
    };

    const renderRow = (rec: any, type: 'BULLISH' | 'BEARISH') => {
        if (!rec || !analysis) return null;

        const otherRec = type === 'BULLISH' ? analysis.bearishRec : analysis.bullishRec;
        const isBestSignal = !otherRec || rec.confidence > otherRec.confidence || (rec.confidence === otherRec.confidence && (type === 'BULLISH' ? analysis.ceScore > analysis.peScore : analysis.peScore > analysis.ceScore));
        const isVeryStrong = rec.strength === 'VERY_STRONG';

        return (
            <tr key={type} className={`${isVeryStrong ? 'very-strong-row' : ''} ${isBestSignal ? 'best-signal-row' : ''}`}>
                <td>
                    <div className="sentiment-badge-simple" style={{ backgroundColor: getSentimentColor(type), fontSize: '18px' }}>
                        {getSentimentIcon(type)}
                        {isBestSignal && <span className="pro-badge" title="AI Suggested Best Trade">⭐ BEST</span>}
                    </div>
                </td>
                <td className="strike-value">{rec.strike}</td>
                <td><strong style={{ color: getSentimentColor(type) }}>{rec.action}</strong></td>
                <td style={{ color: '#4ade80' }}><strong>{type === 'BULLISH' ? analysis.ceScore.toFixed(2) : '-'}</strong></td>
                <td style={{ color: '#f87171' }}><strong>{type === 'BEARISH' ? analysis.peScore.toFixed(2) : '-'}</strong></td>
                <td className="confidence-value">
                    <span className={isVeryStrong ? 'strength-very-strong' : ''}>
                        {rec.confidence}%
                    </span>
                </td>
                <td className="interpretation-value" style={{
                    fontSize: '11px',
                    fontWeight: isVeryStrong ? 'bold' : '500',
                    color: isVeryStrong ? '#fbbf24' : 'inherit'
                }}>
                    {getConfidenceLabel(rec)}
                </td>
            </tr>
        );
    };

    return (
        <div className="market-sentiment-wrapper">
            <div className="sentiment-main-card">
                <table className="sentiment-simple-table sentiment-horizontal">
                    <thead>
                        <tr>
                            <th>Sentiment</th>
                            <th>Strike</th>
                            <th>Action</th>
                            <th>CE Score</th>
                            <th>PE Score</th>
                            <th>Confidence</th>
                            <th>Interpretation</th>
                        </tr>
                    </thead>
                    <tbody>
                        {analysis && renderRow(analysis.bullishRec, 'BULLISH')}
                        {analysis && renderRow(analysis.bearishRec, 'BEARISH')}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default MarketSentiment;
