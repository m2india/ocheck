import React, { useMemo } from 'react';
import { calculateAISentiment } from './utils/AITradingStrategy';
import { ProfessionalStrategyEngine } from './utils/ProfessionalStrategyEngine';
import './MarketSentiment2.css';

interface Props {
    data: any;
    scripName?: string;
    analysis?: any;
}

const MarketSentiment2: React.FC<Props> = ({ data, scripName, analysis: passedAnalysis }) => {
    const analysis = useMemo(() => {
        const underlyingPrice = data?.underlyingPrice || data?.data?.last_price || data?.underlyingValue || 0;

        if (passedAnalysis) {
            const isBullish = passedAnalysis.sentiment === 'BULLISH';
            const rec = isBullish ? passedAnalysis.bullishRec : passedAnalysis.bearishRec;

            // Professional Insight Overlay
            const profEngine = new ProfessionalStrategyEngine();
            const profResult = profEngine.analyze(data?.candles || []);
            const signalText = profResult?.signalText || passedAnalysis.reasons[0];

            return {
                sentiment: passedAnalysis.sentiment,
                selectedStrike: rec ? rec.strike : 0,
                optionType: rec ? rec.optionType : (isBullish ? 'CE' : 'PE'),
                confidence: passedAnalysis.confidence,
                winProbability: passedAnalysis.confidence,
                profitabilityScore: rec ? rec.strength : 'N/A',
                metrics: {
                    liquidityScore: 8.5
                },
                reason: signalText || 'No clear signal detected',
                recommendation: rec,
                entryPrice: profResult?.entryPrice || rec?.entry || underlyingPrice,
                targetPrice: profResult?.targetPrice || rec?.targets?.['5m'] || (isBullish ? underlyingPrice * 1.001 : underlyingPrice * 0.999),
                targets: profResult?.targets || (rec?.targets ? [rec.targets['5m'], rec.targets['10m'], rec.targets['15m']] : [underlyingPrice * (isBullish ? 1.001 : 0.999), underlyingPrice * (isBullish ? 1.002 : 0.998), underlyingPrice * (isBullish ? 1.003 : 0.997)]),
                stopLossPrice: profResult?.stopLossPrice || rec?.stopLoss || (isBullish ? underlyingPrice * 0.998 : underlyingPrice * 1.002)
            };
        }

        if (!data || (!data.oc && !data.data?.oc)) return null;

        // Helper to derive previous price for robust change calculation
        const derivePrev = (ltp: number, prev: number, chg: number, chgPct: number) => {
            if (prev > 0) return prev;
            if (ltp > 0 && chg !== 0) return ltp - chg;
            if (ltp > 0 && chgPct !== 0) return ltp / (1 + chgPct / 100);
            return ltp; // Fallback (0 change)
        };

        const ocData = data.oc || data.data?.oc;

        let processedStrikes: any[] = [];
        const rawStrikes = Array.isArray(ocData)
            ? ocData
            : Object.keys(ocData).map(k => ({ ...ocData[k], strikePrice: parseFloat(k) }));

        processedStrikes = rawStrikes.map((d: any) => {
            const strike = parseFloat(d.strike_price || d.strikePrice || d.StrikePrice || 0);

            // CALL Data
            const cLtp = d.ce?.lastPrice || d.ce?.last_price || 0;
            const cChg = d.ce?.change || 0;
            const cChgPct = d.ce?.pChange || d.ce?.changePct || 0;
            const cPrev = derivePrev(cLtp, d.ce?.previousPrice || 0, cChg, cChgPct);

            // PUT Data
            const pLtp = d.pe?.lastPrice || d.pe?.last_price || 0;
            const pChg = d.pe?.change || 0;
            const pChgPct = d.pe?.pChange || d.pe?.changePct || 0;
            const pPrev = derivePrev(pLtp, d.pe?.previousPrice || 0, pChg, pChgPct);

            return {
                strike: strike,
                callLTP: cLtp,
                callPrev: cPrev,
                callVolume: d.ce?.volume || 0,
                callOI: d.ce?.oi || d.ce?.openInterest || 0,
                callOIChg: d.ce?.changeinOpenInterest || 0,
                putLTP: pLtp,
                putPrev: pPrev,
                putVolume: d.pe?.volume || 0,
                putOI: d.pe?.oi || d.pe?.openInterest || 0,
                putOIChg: d.pe?.changeinOpenInterest || 0
            };
        });

        // underlyingPrice already declared at top of useMemo
        const sentimentResult = calculateAISentiment(processedStrikes, scripName || 'COMMON', '', Date.now(), underlyingPrice);
        const isBullish = sentimentResult.sentiment === 'BULLISH';
        const rec = isBullish ? sentimentResult.bullishRec : sentimentResult.bearishRec;

        // Professional Insight Overlay for initial calculation
        const profEngine = new ProfessionalStrategyEngine();
        const profResult = profEngine.analyze(data?.candles || []);
        const signalText = profResult?.signalText || sentimentResult.reasons[0];

        return {
            sentiment: sentimentResult.sentiment,
            selectedStrike: rec ? rec.strike : 0,
            optionType: rec ? rec.optionType : (isBullish ? 'CE' : 'PE'),
            confidence: sentimentResult.confidence,
            winProbability: sentimentResult.confidence, // Use confidence as proxy for win prob
            profitabilityScore: rec ? rec.strength : 'N/A',
            metrics: {
                liquidityScore: 8.5 // Placeholder as liquidity score is not explicitly returned
            },
            reason: signalText || 'No clear signal detected',
            recommendation: rec,
            entryPrice: profResult?.entryPrice || rec?.entry || underlyingPrice,
            targetPrice: profResult?.targetPrice || rec?.targets?.['5m'] || (isBullish ? underlyingPrice * 1.001 : underlyingPrice * 0.999),
            targets: profResult?.targets || (rec?.targets ? [rec.targets['5m'], rec.targets['10m'], rec.targets['15m']] : [underlyingPrice * (isBullish ? 1.001 : 0.999), underlyingPrice * (isBullish ? 1.002 : 0.998), underlyingPrice * (isBullish ? 1.003 : 0.997)]),
            stopLossPrice: profResult?.stopLossPrice || rec?.stopLoss || (isBullish ? underlyingPrice * 0.998 : underlyingPrice * 1.002)
        };
    }, [data, scripName, passedAnalysis]);

    if (!analysis) return null;

    const getSentimentColor = () => {
        if (analysis.sentiment === 'BULLISH') return 'var(--color-green)';
        if (analysis.sentiment === 'BEARISH') return 'var(--color-red)';
        return '#1f739f';
    };

    return (
        <div className="sentiment2-container card">
            <div className="sentiment2-header">
                <span className="sentiment2-title">Sentiment-2 Analysis</span>
                <span className="sentiment2-badge" style={{ backgroundColor: getSentimentColor() }}>
                    {analysis.sentiment}
                </span>
            </div>

            <div className="sentiment2-content">
                <div className="sentiment2-main">
                    <div className="sentiment2-strike-box">
                        <span className="label">Recommended Strike</span>
                        <span className="value">
                            {analysis.selectedStrike > 0
                                ? `${analysis.selectedStrike} ${analysis.optionType}`
                                : 'Seeking Setup...'}
                        </span>
                    </div>
                    <div className="sentiment2-confidence-box">
                        <span className="label">Technical Sentiment Score</span>
                        <span className="value" style={{ color: getSentimentColor() }}>{analysis.confidence}%</span>
                    </div>
                </div>

                <div className="sentiment2-metrics">
                    <div className="metric-item">
                        <span className="label">Win Probability</span>
                        <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${analysis.winProbability}%`, backgroundColor: getSentimentColor() }}></div>
                        </div>
                        <span className="val">{analysis.winProbability}%</span>
                    </div>
                    <div className="metric-item">
                        <span className="label">Profitability Score</span>
                        <span className="val">{analysis.profitabilityScore}</span>
                    </div>
                    <div className="metric-item">
                        <span className="label">Liquidity</span>
                        <span className="val">{analysis.metrics.liquidityScore.toFixed(1)} / 10</span>
                    </div>
                </div>

            </div>

            {/* Section: Goal Achievement Track (Laddering) */}
            <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(0, 230, 118, 0.05)', borderRadius: '12px', border: '1px solid rgba(0, 230, 118, 0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#00e676', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sequential Multi-Timeframe Analysis</span>
                    <div style={{ background: '#00e676', color: '#000', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '900' }}>
                        {(() => {
                            const currentLtp = data.underlyingPrice || data.data?.last_price || 0;
                            const entry = analysis.entryPrice || currentLtp;
                            const t1 = (analysis.targets && (analysis.targets as any)[0]) || analysis.targetPrice;
                            const totalMove = Math.abs(t1 - entry);
                            const currentMove = analysis.sentiment === 'BULLISH' ? (currentLtp - entry) : (entry - currentLtp);
                            const progress = totalMove > 0 ? Math.max(0, (currentMove / totalMove) * 100) : 0;
                            return `${progress.toFixed(1)}% ACHIEVED`;
                        })()}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)' }}>Live Market Price</span>
                            <span style={{ fontSize: '18px', fontWeight: '900', color: '#fff' }}>₹{(data.underlyingPrice || data.data?.last_price || 0).toLocaleString()}</span>
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)' }}>Primary Goal</span>
                            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#00e676' }}>
                                ₹{((analysis.targets && (analysis.targets as any)[0]) || analysis.targetPrice || 0).toLocaleString()}
                            </span>
                        </div>
                    </div>

                    {/* Visual Progress Bar */}
                    <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${(() => {
                                const currentLtp = data.underlyingPrice || data.data?.last_price || 0;
                                const entry = analysis.entryPrice || currentLtp;
                                const t1 = (analysis.targets && (analysis.targets as any)[0]) || analysis.targetPrice;
                                const totalMove = Math.abs(t1 - entry);
                                const currentMove = analysis.sentiment === 'BULLISH' ? (currentLtp - entry) : (entry - currentLtp);
                                return totalMove > 0 ? Math.min(100, Math.max(0, (currentMove / totalMove) * 100)) : 0;
                            })()}%`,
                            background: 'linear-gradient(90deg, #00e676, #69f0ae)',
                            borderRadius: '3px',
                            boxShadow: '0 0 10px rgba(0, 230, 118, 0.4)'
                        }}></div>
                    </div>

                    {/* Sequential Laddering Grid */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {[
                            { id: 'T1', tf: '5m', idx: 0 },
                            { id: 'T2', tf: '10m', idx: 1 },
                            { id: 'T3', tf: '15m', idx: 2 }
                        ].map((t) => {
                            const currentLtp = data.underlyingPrice || data.data?.last_price || 0;
                            const targetPrices = (analysis.targets && analysis.targets.length > 0) ? analysis.targets : [analysis.targetPrice];
                            const mainEntry = analysis.entryPrice || currentLtp;

                            // Laddering Logic: Step-by-Step
                            const stepEntry = t.idx === 0 ? mainEntry : (targetPrices[t.idx - 1] || (mainEntry * (1 + (t.idx * 0.0005))));
                            const stepExit = targetPrices[t.idx] || (stepEntry * (analysis.sentiment === 'BEARISH' ? 0.9995 : 1.0005));

                            if (!stepEntry || !stepExit) return null;

                            const isHit = analysis.sentiment === 'BULLISH' ? currentLtp >= stepExit : currentLtp <= stepExit;

                            return (
                                <div key={t.id} className="sentiment2-ladder-item" style={{
                                    padding: '10px',
                                    background: 'rgba(255,255,255,0.03)',
                                    borderRadius: '10px',
                                    border: `1px solid ${isHit ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255,255,255,0.05)'}`,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '50%',
                                            background: isHit ? '#00e676' : 'rgba(255,255,255,0.1)',
                                            color: isHit ? '#000' : '#fff',
                                            display: 'flex',
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            fontSize: '10px',
                                            fontWeight: 'bold'
                                        }}>{t.tf}</div>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>{t.id} Ladder</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>₹{stepEntry.toFixed(2)}</span>
                                                <i className="fa fa-arrow-right" style={{ fontSize: '10px', color: '#607d8b' }}></i>
                                                <span style={{ fontSize: '13px', fontWeight: 'bold', color: isHit ? '#00e676' : '#69f0ae' }}>₹{stepExit.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {isHit ? (
                                        <div style={{ background: '#00e676', color: '#000', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '900' }}>GOAL HIT</div>
                                    ) : (
                                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>ACTIVE</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="sentiment2-reason" style={{ marginTop: '20px' }}>
                <i className="fa fa-info-circle"></i>
                <span>{analysis.reason}</span>
            </div>
        </div>
    );
};

export default MarketSentiment2;
