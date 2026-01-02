import React, { useMemo, useEffect, useRef } from 'react';
import { calculateAISentiment } from './utils/AITradingStrategy';
import { ProfessionalStrategyEngine } from './utils/ProfessionalStrategyEngine';
import './MarketSentiment.css'; // Reuse existing styles

interface Props {
    data: any;
    scripName?: string;
    selectedStrikes: { strike: number, side: 'CE' | 'PE', entryPrice?: number }[];
    onRemove: (strike: number, side: 'CE' | 'PE') => void;
    liveData?: Record<string, any>;
    baseUrl?: string;
    onLogUpdate?: () => void;
}

const LOT_SIZES: Record<string, number> = {
    'NIFTY': 75,
    'SENSEX': 20,
    'BANKNIFTY': 15,
    'NATURALGAS': 1250,
    'CRUDEOIL': 100,
    'GOLD': 100,
    'SILVER': 30
};

const SelectionStrategy: React.FC<Props> = ({ data, scripName = 'NIFTY', selectedStrikes, onRemove, liveData, baseUrl, onLogUpdate }) => {

    const selectionAnalysis = useMemo(() => {
        if (!data || selectedStrikes.length === 0) return [];

        const underlyingPrice = data.underlyingPrice || data.data?.last_price || data.underlyingValue || 0;
        const ocData = data.oc || data.data?.oc || data.data?.options || {};

        if (underlyingPrice === 0 || Object.keys(ocData).length === 0) return [];

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
                callIV: strikeData.ce?.impliedVolatility || strikeData.ce?.implied_volatility || 0,
                putIV: strikeData.pe?.impliedVolatility || strikeData.pe?.implied_volatility || 0,
                callSecurityId: strikeData.ce?.security_id,
                putSecurityId: strikeData.pe?.security_id
            };
        }).filter(s => s !== null).sort((a, b) => a!.strike - b!.strike) as any[];

        const aiAnalysis = calculateAISentiment(strikes, scripName, data.expiryDate || '', Date.now());
        const lotSize = LOT_SIZES[scripName] || 1;

        // Function to create a custom recommendation for a specific strike/side
        const getStrikeRecommendation = (strikeValue: number, side: 'CE' | 'PE', capturedEntryPrice?: number) => {

            const strikeObj = side === 'CE' ? strikes.find(s => s.strike === strikeValue) : strikes.find(s => s.strike === strikeValue); // Use local strikes with IV

            if (!strikeObj) return null;

            try {
                // Ensure inputs are numbers via parseFloat
                let rawLtp = side === 'CE' ? strikeObj.callLTP : strikeObj.putLTP;
                const rawIV = side === 'CE' ? strikeObj.callIV : strikeObj.putIV;

                // LIVE DATA OVERRIDE
                if (liveData) {
                    const secId = side === 'CE' ? strikeObj.callSecurityId : strikeObj.putSecurityId;
                    if (secId && liveData[secId]) {
                        rawLtp = liveData[secId].lp || liveData[secId].last_price || rawLtp;
                    }
                }

                const currentLtp = parseFloat(String(rawLtp)) || 0;
                const iv = parseFloat(String(rawIV)) || 0;

                // The entry price is fixed at selection time (capturedEntryPrice)
                const entry = capturedEntryPrice ? parseFloat(String(capturedEntryPrice)) : currentLtp;

                if (!entry || entry <= 0) return null;

                // --- DYNAMIC LOGIC BASED ON IV ---
                // If IV is missing (0), fallback to 20% default.
                const volatility = (iv && iv > 0) ? iv : 20;

                // Standard Deviation Calculation (Rule of 16 for Daily, then minute adjustments)
                // Daily Vol = IV / 16. Minute Vol = Daily / sqrt(375).
                // We use a multiplier to create meaningful targets (e.g. 0.5 SD, 1 SD).
                const dailyVol = (volatility / 100) * entry / 16;

                // Dynamic Targets adjusted by IV
                const targets = {
                    '1m': entry + (dailyVol * 0.3),  // Quick Scalp (~1 min)
                    '5m': entry + (dailyVol * 0.6),  // Momentum (~5 mins)
                    '10m': entry + (dailyVol * 1.5)  // Trend (~15 mins)
                };

                // 1:1 Risk/Reward Concept: Stop Loss distance = Target 1 distance.
                // Target 1 is (dailyVol * 0.3) away.
                const stopLoss = entry - (dailyVol * 0.3);

                // --- DYNAMIC CONFIDENCE BASED ON STRIKE SCORE ---
                // Find the AI score for this specific strike (0.0 to 1.0)
                // This ensures every strike has its OWN confidence, not the global market confidence.
                const scoredList = side === 'CE' ? aiAnalysis.details.allScoredCE : aiAnalysis.details.allScoredPE;
                const scoredStrike = scoredList?.find((s: any) => s.strike === strikeValue);

                // Raw score is 0.0 to 1.0 (normalized against the best strike in the chain)
                const rawScore = scoredStrike ? scoredStrike.score : 0;

                // Convert to percentage (0-100). 
                // We can boost it slightly to make it readable, but it must be distinct per strike.
                // e.g. 0.9 score -> 90% confidence.
                const confidence = Math.min(Math.round(rawScore * 100), 99);

                // Fallback: If score is 0 (illiquid), confidence is low.
                const safeConfidence = confidence > 0 ? confidence : 10;
                const interpretation = safeConfidence > 80 ? 'VERY STRONG' : safeConfidence > 60 ? 'Strong' : safeConfidence > 40 ? 'Moderate' : 'Weak';

                // Professional Strategy Label
                const profEngine = new ProfessionalStrategyEngine();
                const profResult = profEngine.analyze(data?.candles || []);
                const profLabel = profResult?.signalText || (side === 'CE' ? 'Long Call' : 'Long Put');

                const liveProfit = (currentLtp - entry) * lotSize;
                const maxLoss = (entry - stopLoss) * lotSize;
                const maxProfit = (targets['10m'] - entry) * lotSize; // Potential profit at Target 3

                // Status Check
                const getStatus = (target: number) => {
                    if (currentLtp >= target) return 'HIT';
                    if (currentLtp <= stopLoss) return 'STOPPED';
                    return 'ACTIVE';
                };

                const status1m = getStatus(targets['1m']);
                const status5m = getStatus(targets['5m']);
                const status10m = getStatus(targets['10m']);

                let overallStatus = 'Active';
                if (status1m === 'STOPPED') overallStatus = 'Stop Loss Hit';
                else if (status10m === 'HIT') overallStatus = 'All Targets Hit';
                else if (status5m === 'HIT') overallStatus = 'Target 2 Hit';
                else if (status1m === 'HIT') overallStatus = 'Target 1 Hit';

                return {
                    sentiment: side === 'CE' ? 'BULLISH' : 'BEARISH',
                    strike: strikeValue,
                    action: side === 'CE' ? 'BUY CE' : 'BUY PE',
                    strategy: profLabel,
                    status: overallStatus,
                    ceScore: side === 'CE' ? rawScore * 10 : 0,
                    peScore: side === 'PE' ? rawScore * 10 : 0,
                    confidence: safeConfidence,
                    interpretation: interpretation,
                    type: 'Intraday',
                    entry: entry,
                    currentLtp: currentLtp,
                    targets: targets,
                    statusMap: { '1m': status1m, '5m': status5m, '10m': status10m },
                    stopLoss: stopLoss,
                    maxLoss: maxLoss,
                    maxProfit: maxProfit,
                    profit: liveProfit,
                    side
                };
            } catch (err) {
                console.error("Selection Strategy Calculation Error:", err);
                return null;
            }
        };

        return selectedStrikes.map(s => getStrikeRecommendation(s.strike, s.side, s.entryPrice)).filter(r => r !== null);
    }, [data, scripName, selectedStrikes, liveData]);

    // Ref to track what has been logged to prevent duplicate logs for the same state
    const loggedStatesRef = useRef<Record<string, string>>({});

    // Effect to log selections and status changes
    useEffect(() => {
        if (!baseUrl || selectionAnalysis.length === 0) return;

        selectionAnalysis.forEach((rec: any) => {
            const stateKey = `${rec.strike}_${rec.side}_${rec.entry}`;
            const currentStatus = rec.status;

            // Log if it's the first time we see this strike OR if the status changed (e.g. from Active to Hit)
            if (loggedStatesRef.current[stateKey] !== currentStatus) {
                console.log(`[LOG] Selection Update for ${rec.strike} ${rec.side}: ${currentStatus}`);

                fetch(`${baseUrl}/save-selection`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        scrip: scripName,
                        strike: rec.strike,
                        side: rec.side,
                        price: rec.entry,
                        expiry: data?.expiryDate,
                        status: rec.status,
                        strategy: rec.strategy,
                        confidence: rec.confidence,
                        interpretation: rec.interpretation,
                        entry: rec.entry,
                        targets: rec.targets,
                        stopLoss: rec.stopLoss,
                        maxLoss: rec.maxLoss,
                        maxProfit: rec.maxProfit,
                        profit: rec.profit,
                        ltp: rec.currentLtp
                    })
                }).then(() => {
                    if (onLogUpdate) onLogUpdate();
                }).catch(e => console.error("Error logging selection update:", e));

                loggedStatesRef.current[stateKey] = currentStatus;
            }
        });
    }, [selectionAnalysis, baseUrl, scripName, data?.expiryDate]);

    if (selectionAnalysis.length === 0) return null;

    return (
        <div className="market-sentiment-wrapper" style={{ marginTop: '20px' }}>
            <div className="sentiment-header" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa fa-crosshairs" style={{ color: 'var(--primary-color)' }}></i>
                <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--text-main)' }}>Selection Strategy Details</h3>
            </div>
            <div className="sentiment-main-card" style={{ border: '1px solid rgba(76, 111, 255, 0.3)', background: 'rgba(76, 111, 255, 0.03)' }}>
                <table className="sentiment-simple-table sentiment-horizontal">
                    <thead>
                        <tr>
                            <th>Sentiment</th>
                            <th>Strike</th>
                            <th>Action</th>
                            <th>Status</th>
                            <th>Strategy</th>
                            <th>CE Score</th>
                            <th>PE Score</th>
                            <th>Confidence</th>
                            <th>Interpretation</th>
                            <th>Type</th>
                            <th>Entry</th>
                            <th>Targets</th>
                            <th>Stop Loss</th>
                            <th>Max Loss</th>
                            <th>Max Profit</th>
                            <th>Profit (₹)</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {selectionAnalysis.map((rec: any, idx) => (
                            <tr key={`${rec!.strike}-${rec!.side}-${idx}`}>
                                <td>
                                    <div className="sentiment-badge-simple" style={{
                                        backgroundColor: rec!.sentiment === 'BULLISH' ? '#4ade80' : '#f87171',
                                        fontSize: '16px'
                                    }}>
                                        {rec!.sentiment === 'BULLISH' ? '📈' : '📉'}
                                    </div>
                                </td>
                                <td className="strike-value">{rec!.strike}</td>
                                <td><strong style={{ color: rec!.sentiment === 'BULLISH' ? '#4ade80' : '#f87171' }}>{rec!.action}</strong></td>

                                {/* Status Column */}
                                <td style={{
                                    fontWeight: 'bold',
                                    color: rec!.status.includes('Hit') ? '#4ade80' : rec!.status.includes('Stop') ? '#f87171' : 'var(--text-main)'
                                }}>
                                    {rec!.status}
                                </td>

                                <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{rec!.strategy}</td>
                                <td style={{ color: '#4ade80' }}><strong>{rec!.ceScore > 0 ? rec!.ceScore.toFixed(2) : '-'}</strong></td>
                                <td style={{ color: '#f87171' }}><strong>{rec!.peScore > 0 ? rec!.peScore.toFixed(2) : '-'}</strong></td>
                                <td className="confidence-value">{rec!.confidence}%</td>
                                <td className="interpretation-value">{rec!.interpretation}</td>
                                <td className="option-type">{rec!.type}</td>
                                <td className="entry-value" style={{ color: '#44cdff', fontWeight: 'bold' }}>₹{rec!.entry.toFixed(2)}</td>

                                {/* Consolidated Targets Column */}
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px' }}>
                                        <span style={{ color: rec!.statusMap['1m'] === 'HIT' ? '#4ade80' : 'inherit', fontWeight: rec!.statusMap['1m'] === 'HIT' ? 'bold' : 'normal' }}>
                                            T1: ₹{rec!.targets['1m'].toFixed(2)} (01 min) {rec!.statusMap['1m'] === 'HIT' && '✅'}
                                        </span>
                                        <span style={{ color: rec!.statusMap['5m'] === 'HIT' ? '#4ade80' : 'inherit', fontWeight: rec!.statusMap['5m'] === 'HIT' ? 'bold' : 'normal' }}>
                                            T2: ₹{rec!.targets['5m'].toFixed(2)} (05 min) {rec!.statusMap['5m'] === 'HIT' && '✅'}
                                        </span>
                                        <span style={{ color: rec!.statusMap['10m'] === 'HIT' ? '#4ade80' : 'inherit', fontWeight: rec!.statusMap['10m'] === 'HIT' ? 'bold' : 'normal' }}>
                                            T3: ₹{rec!.targets['10m'].toFixed(2)} (15 min) {rec!.statusMap['10m'] === 'HIT' && '✅'}
                                        </span>
                                    </div>
                                </td>

                                <td className="stop-loss-value" style={{ color: rec!.status.includes('Stop') ? '#f87171' : 'inherit' }}>
                                    ₹{rec!.stopLoss.toFixed(2)} {rec!.status.includes('Stop') && '❌'}
                                </td>
                                <td className="max-loss-value">₹{Math.abs(rec!.maxLoss).toFixed(0)}</td>
                                <td className="max-loss-value" style={{ color: '#4ade80' }}>₹{Math.abs(rec!.maxProfit).toFixed(0)}</td>
                                <td className={`profit-amount-value ${rec!.profit >= 0 ? 'text-green' : 'text-red'}`} style={{ fontWeight: 'bold' }}>
                                    ₹{rec!.profit.toFixed(0)}
                                    <div style={{ fontSize: '9px', opacity: 0.8, color: 'var(--text-secondary)' }}>LTP: ₹{rec!.currentLtp.toFixed(2)}</div>
                                </td>

                                <td>
                                    <button
                                        onClick={() => onRemove(rec!.strike, rec!.side)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--text-secondary)',
                                            cursor: 'pointer',
                                            padding: '4px'
                                        }}
                                        title="Remove"
                                    >
                                        <i className="fa fa-times"></i>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SelectionStrategy;
