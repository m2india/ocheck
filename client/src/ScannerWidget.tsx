import React, { useEffect, useState } from 'react';
import { SCRIPS, type Scrip } from './constants/scrips';
import { calculateAISentiment, type SentimentAnalysisResult } from './utils/AITradingStrategy';

interface ScannerProps {
    baseUrl: string;
    onSelectScrip: (scrip: Scrip) => void;
    onClose: () => void;
}

interface ScanResult {
    scrip: Scrip;
    sentiment: SentimentAnalysisResult;
    loading: boolean;
    error?: string;
}

const ScannerWidget: React.FC<ScannerProps> = ({ baseUrl, onSelectScrip, onClose }) => {
    const [results, setResults] = useState<ScanResult[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [progress, setProgress] = useState(0);

    const getExpiryForScrip = (scrip: Scrip) => {
        const d = new Date();
        const currentDay = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

        // Default to Thursday (NIFTY, BANKNIFTY)
        let targetDay = 4;

        if (['SENSEX', 'BANKEX'].includes(scrip.name)) {
            targetDay = 5; // Friday
        } else if (['FINNIFTY'].includes(scrip.name)) {
            targetDay = 2; // Tuesday
        } else if (['MIDCPNIFTY'].includes(scrip.name)) {
            targetDay = 1; // Monday
        }

        // Calculate days until next target day. 
        // If today matches targetDay, result is 0 (Today).
        let daysToAdd = (targetDay - currentDay + 7) % 7;

        // If strictly looking for "Next" expiry excluding today (e.g. end of day), 
        // we could add logic here. For scanner, "Today" is usually valid.

        d.setDate(d.getDate() + daysToAdd);
        const dateStr = d.toISOString().split('T')[0];
        if (dateStr === '2026-01-01') return '2025-12-31';
        return dateStr;
    };

    const runScan = async () => {
        setIsScanning(true);
        setResults([]);
        setProgress(0);

        const scripsToScan = SCRIPS.filter(s => s.segment === 'IDX_I'); // Only scan Indices for reliability
        const newResults: ScanResult[] = [];

        for (let i = 0; i < scripsToScan.length; i++) {
            const scrip = scripsToScan[i];
            const expiry = getExpiryForScrip(scrip);

            try {
                // Fetch Option Chain
                const payload = {
                    UnderlyingScrip: scrip.occId || scrip.id,
                    UnderlyingSeg: scrip.segment,
                    Expiry: expiry
                };

                const response = await fetch(`${baseUrl}/option-chain`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (data.error) {
                    newResults.push({ scrip, sentiment: null as any, loading: false, error: 'Fetch Failed' });
                } else {
                    // Process Data
                    const underlyingPrice = data.underlyingPrice || data.data?.last_price || 0;
                    const ocData = data.oc || data.data?.oc || data.data?.options || {};

                    if (Object.keys(ocData).length > 0) {
                        let processedStrict: any[] = [];
                        if (Array.isArray(ocData)) {
                            processedStrict = ocData.map(s => {
                                const ceLtp = s.ce?.lastPrice || 0;
                                const peLtp = s.pe?.lastPrice || 0;

                                const derivePrev = (ltp: number, obj: any) => {
                                    if (!obj) return ltp;
                                    if (obj.previousPrice || obj.prev_close) return obj.previousPrice || obj.prev_close;
                                    if (obj.change || obj.netChange) return ltp - (obj.change || obj.netChange);
                                    const pct = obj.changePct || obj.pChange;
                                    if (pct && ltp) return ltp / (1 + (pct / 100));
                                    return ltp;
                                };

                                return {
                                    strike: parseFloat(s.strike_price || s.strikePrice || 0),
                                    callOI: s.ce?.oi || 0,
                                    putOI: s.pe?.oi || 0,
                                    callVolume: s.ce?.volume || 0,
                                    putVolume: s.pe?.volume || 0,
                                    callOIChg: s.ce?.changeinOpenInterest || 0,
                                    putOIChg: s.pe?.changeinOpenInterest || 0,
                                    callLTP: ceLtp,
                                    putLTP: peLtp,
                                    callPrev: derivePrev(ceLtp, s.ce),
                                    putPrev: derivePrev(peLtp, s.pe),
                                    callGamma: s.ce?.greeks?.gamma || 0,
                                    putGamma: s.pe?.greeks?.gamma || 0,
                                };
                            });
                        } else {
                            processedStrict = Object.keys(ocData).map(k => {
                                const s = ocData[k];
                                const ceLtp = s.ce?.lastPrice || 0;
                                const peLtp = s.pe?.lastPrice || 0;

                                const derivePrev = (ltp: number, obj: any) => {
                                    if (!obj) return ltp;
                                    if (obj.previousPrice || obj.prev_close) return obj.previousPrice || obj.prev_close;
                                    if (obj.change || obj.netChange) return ltp - (obj.change || obj.netChange);
                                    const pct = obj.changePct || obj.pChange;
                                    if (pct && ltp) return ltp / (1 + (pct / 100));
                                    return ltp;
                                };

                                return {
                                    strike: parseFloat(k),
                                    callOI: s.ce?.oi || 0,
                                    putOI: s.pe?.oi || 0,
                                    callVolume: s.ce?.volume || 0,
                                    putVolume: s.pe?.volume || 0,
                                    callOIChg: s.ce?.changeinOpenInterest || 0,
                                    putOIChg: s.pe?.changeinOpenInterest || 0,
                                    callLTP: ceLtp,
                                    putLTP: peLtp,
                                    callPrev: derivePrev(ceLtp, s.ce),
                                    putPrev: derivePrev(peLtp, s.pe),
                                    callGamma: s.ce?.greeks?.gamma || 0,
                                    putGamma: s.pe?.greeks?.gamma || 0,
                                };
                            });
                        }

                        const sentiment = calculateAISentiment(processedStrict, scrip.name, expiry, Date.now(), underlyingPrice);
                        newResults.push({ scrip, sentiment, loading: false });
                    } else {
                        newResults.push({ scrip, sentiment: null as any, loading: false, error: 'No Data' });
                    }
                }
            } catch (e) {
                newResults.push({ scrip, sentiment: null as any, loading: false, error: 'Network Error' });
            }

            setResults([...newResults]);
            setProgress(Math.round(((i + 1) / scripsToScan.length) * 100));
        }
        setIsScanning(false);
    };

    useEffect(() => {
        runScan();
    }, []);

    return (
        <div className="scanner-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.9)', zIndex: 1000, color: '#fff',
            display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px'
        }}>
            <div className="scanner-header" style={{ width: '100%', maxWidth: '800px', display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h2>Market Scanner (AI Prediction)</h2>
                <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>&times;</button>
            </div>

            {isScanning && (
                <div style={{ width: '100%', maxWidth: '800px', marginBottom: '20px' }}>
                    <div style={{ background: '#333', height: '4px', borderRadius: '2px' }}>
                        <div style={{ width: `${progress}%`, background: '#2196f3', height: '100%' }}></div>
                    </div>
                    <div style={{ textAlign: 'center', fontSize: '12px', marginTop: '5px' }}>Scanning Markets... {progress}%</div>
                </div>
            )}

            <div className="scanner-grid" style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px',
                width: '100%', maxWidth: '1000px', overflowY: 'auto'
            }}>
                {results.map((res, idx) => (
                    <div key={idx} className="scanner-card" style={{
                        background: '#1e1e2d', padding: '15px', borderRadius: '8px', border: '1px solid #333',
                        cursor: 'pointer', transition: 'transform 0.2s', position: 'relative'
                    }} onClick={() => onSelectScrip(res.scrip)}>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>{res.scrip.name}</h3>
                        {res.error ? (
                            <div style={{ color: '#f44336', fontSize: '12px' }}>{res.error}</div>
                        ) : (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                    <span style={{
                                        color: res.sentiment.sentiment === 'BULLISH' ? '#4caf50' :
                                            (res.sentiment.sentiment === 'BEARISH' ? '#f44336' : '#bbb'),
                                        fontWeight: 'bold'
                                    }}>
                                        {res.sentiment.sentiment}
                                    </span>
                                    <span style={{ fontSize: '12px', opacity: 0.7 }}>{res.sentiment.confidence}% Conf.</span>
                                </div>
                                <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
                                    {res.sentiment.reasons[0]}
                                </div>
                                <div style={{ display: 'flex', gap: '5px', fontSize: '11px' }}>
                                    {res.sentiment.bullishRec && (
                                        <span style={{ background: 'rgba(76, 175, 80, 0.2)', padding: '2px 4px', borderRadius: '4px', color: '#4caf50' }}>
                                            Buy CE {res.sentiment.bullishRec.strike}
                                        </span>
                                    )}
                                    {res.sentiment.bearishRec && (
                                        <span style={{ background: 'rgba(244, 67, 54, 0.2)', padding: '2px 4px', borderRadius: '4px', color: '#f44336' }}>
                                            Buy PE {res.sentiment.bearishRec.strike}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                        <div style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '10px', color: '#555' }}>
                            View &rarr;
                        </div>
                    </div>
                ))}
            </div>

            {!isScanning && (
                <button onClick={runScan} style={{ marginTop: '20px', padding: '10px 20px', background: '#2196f3', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>
                    Rescan All
                </button>
            )}
        </div>
    );
};

export default ScannerWidget;
