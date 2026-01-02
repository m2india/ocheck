import React, { useEffect, useState, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import './PredictionChart.css';
import { MasterSignalEngine } from './utils/MasterSignalEngine';
import IntradayInsightWidget from './IntradayInsightWidget';
import type { PredictionResult } from './utils/CandleAnalysisStrategy';
import type { MasterSignal } from './utils/MasterSignalEngine';
import SignalRenderer, { type VisualSignal } from './components/SignalRenderer';

// Cached formatters to prevent lag during chart interactions
const istTimeFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

const istDateFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short'
});

interface Props {
    scrip: { id: string | number, name: string, exchange?: string, segment?: string };
    livePrice?: number;
    baseUrl: string;
}

interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

interface ChartData extends Candle { }

const PredictionChart: React.FC<Props> = ({ scrip, livePrice, baseUrl }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const priceLinesRef = useRef<any[]>([]);

    const [data, setData] = useState<ChartData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [latestInsight, setLatestInsight] = useState<PredictionResult['insight'] | undefined>(undefined);
    const [interval, setIntervalState] = useState<number>(5);
    const [showSignals, setShowSignals] = useState<boolean>(true);
    const [visualSignals, setVisualSignals] = useState<VisualSignal[]>([]);
    const isMounted = useRef<boolean>(true);

    // Fetch Data
    useEffect(() => {
        if (!scrip?.id) return;

        const fetchData = async () => {
            if (!isMounted.current) return;
            setLoading(true);
            try {
                const now = new Date();
                const past = new Date();
                past.setDate(now.getDate() - 50);

                const targetDate = now.toISOString().split('T')[0];
                const fromDateDate = past.toISOString().split('T')[0];

                const start = scrip.segment === 'MCX_COMM' ? '09:00:00' : '09:15:00';
                const end = scrip.segment === 'MCX_COMM' ? '23:30:00' : '15:30:00';

                const fromDate = `${fromDateDate} ${start}`;
                const toDate = `${targetDate} ${end}`;

                const payload = {
                    securityId: scrip.id.toString(),
                    exchangeSegment: scrip.segment === 'IDX_I' ? 'IDX_I' : (scrip.segment === 'MCX_COMM' ? 'MCX_COMM' : 'NSE_EQ'),
                    instrument: scrip.segment === 'IDX_I' ? 'INDEX' : (scrip.segment === 'MCX_COMM' ? 'FUTCOM' : 'EQUITY'),
                    interval: interval,
                    oi: true,
                    fromDate: fromDate,
                    toDate: toDate
                };

                const response = await fetch(`${baseUrl}/intraday-chart`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}`);
                }

                const result = await response.json();
                const sourceData = (result.data && result.data.timestamp) ? result.data : (result.timestamp ? result : null);

                if (sourceData && sourceData.timestamp && Array.isArray(sourceData.timestamp)) {
                    const formatted = sourceData.timestamp.map((ts: number, i: number) => ({
                        time: ts as any,
                        open: sourceData.open[i],
                        high: sourceData.high[i],
                        low: sourceData.low[i],
                        close: sourceData.close[i],
                        volume: sourceData.volume ? sourceData.volume[i] : 0
                    }));

                    const uniqueData = Array.from(new Map(formatted.map((item: any) => [item.time, item])).values())
                        .sort((a: any, b: any) => (a.time as any) - (b.time as any));

                    if (uniqueData.length > 0 && isMounted.current) {
                        const finalData = uniqueData as ChartData[];
                        setData(finalData);
                        setError(null);
                    } else if (isMounted.current) {
                        setData([]);
                        setError('No data found for this period');
                    }
                }
            } catch (err: any) {
                console.error("Failed to fetch chart data", err);
                if (isMounted.current) setError(`Fetch failed: ${err.message}`);
            } finally {
                if (isMounted.current) setLoading(false);
            }
        };

        fetchData();
        const pollInterval = setInterval(fetchData, 60000);
        return () => clearInterval(pollInterval);
    }, [scrip?.id, interval]);

    // Live price update
    useEffect(() => {
        if (!livePrice || !seriesRef.current || data.length === 0) return;

        const lastBar = { ...data[data.length - 1] };
        const now = Date.now() / 1000;
        const intervalInSeconds = interval * 60;
        const currentCandleTime = Math.floor(now / intervalInSeconds) * intervalInSeconds;

        if (currentCandleTime === lastBar.time) {
            lastBar.close = livePrice;
            if (livePrice > lastBar.high) lastBar.high = livePrice;
            if (livePrice < lastBar.low) lastBar.low = livePrice;
            seriesRef.current.update(lastBar as any);

            const newData = [...data];
            newData[newData.length - 1] = lastBar;
            setData(newData);
        } else if (currentCandleTime > lastBar.time) {
            const newBar = {
                time: currentCandleTime as any,
                open: livePrice,
                high: livePrice,
                low: livePrice,
                close: livePrice,
                volume: 0
            };
            const newData = [...data, newBar];
            setData(newData);
            seriesRef.current.update(newBar as any);
        }
    }, [livePrice, interval]);

    // Initialize Chart
    useEffect(() => {
        if (!chartContainerRef.current) return;
        isMounted.current = true;

        if (!chartRef.current) {
            const chart = createChart(chartContainerRef.current, {
                layout: {
                    background: { type: ColorType.Solid, color: '#1e1e2d' },
                    textColor: '#d1d4dc',
                },
                width: chartContainerRef.current.clientWidth,
                height: 350,
                grid: {
                    vertLines: { color: '#2B2B43' },
                    horzLines: { color: '#2B2B43' },
                },
                timeScale: {
                    timeVisible: true,
                    secondsVisible: false,
                    tickMarkFormatter: (time: number, tickMarkType: number) => {
                        const date = new Date(time * 1000);
                        if (tickMarkType < 3) return istDateFormatter.format(date);
                        return istTimeFormatter.format(date);
                    },
                },
                rightPriceScale: { autoScale: true },
                localization: {
                    timeFormatter: (ts: number) => istTimeFormatter.format(new Date(ts * 1000)),
                }
            });
            chartRef.current = chart;

            const series = chart.addSeries(CandlestickSeries, {
                upColor: '#4caf50',
                downColor: '#f44336',
                borderVisible: false,
                wickUpColor: '#4caf50',
                wickDownColor: '#f44336',
            });
            seriesRef.current = series;

            const handleResize = () => {
                if (chartContainerRef.current && chartRef.current) {
                    chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
                }
            };
            window.addEventListener('resize', handleResize);

            return () => {
                window.removeEventListener('resize', handleResize);
                if (chartRef.current) {
                    chartRef.current.remove();
                    chartRef.current = null;
                }
                seriesRef.current = null;
                isMounted.current = false;
            };
        }
    }, [interval]);

    // Update Series Data & Signals
    useEffect(() => {
        if (!isMounted.current || !chartRef.current || !seriesRef.current || data.length === 0) return;

        seriesRef.current.setData(data as any);
        const timeScale = chartRef.current.timeScale();
        timeScale.fitContent();

        const strategy = new MasterSignalEngine();

        // Signal Generation Logic
        try {
            const lookback = 45;
            const newVisualSignals: VisualSignal[] = [];

            if (showSignals && data.length > lookback) {
                let lastDir = '';

                for (let i = lookback; i < data.length; i++) {
                    const windowData = data.slice(i - lookback, i + 1);
                    try {
                        const signal: MasterSignal | null = strategy.analyze(windowData as any);

                        // Match User Request: "Clean and Neat" high conviction signals
                        if (signal && signal.isCleanSignal && signal.direction !== 'NEUTRAL') {
                            // Spacing logic: Only allow bubbles when trend direction flips
                            if (signal.direction !== lastDir) {
                                const isBull = signal.direction === 'BULLISH';

                                newVisualSignals.push({
                                    time: data[i].time,
                                    type: isBull ? 'BUY' : 'SELL',
                                    price: isBull ? data[i].low : data[i].high,
                                    tp: signal.targetPrice || (isBull ? data[i].close * 1.01 : data[i].close * 0.99),
                                    sl: signal.stopLossPrice || (isBull ? data[i].close * 0.99 : data[i].close * 1.01)
                                });

                                lastDir = signal.direction;
                            }
                        }
                    } catch (err) { /* ignore */ }
                }
            }
            setVisualSignals(newVisualSignals);

            // Clear standard markers if using custom renderer
            if (seriesRef.current) {
                (seriesRef.current as any).setMarkers([]);
            }
        } catch (e) {
            console.error("Signal generation error", e);
        }

        // Draw Price Lines (Targets / SL)
        try {
            if (priceLinesRef.current.length > 0 && seriesRef.current) {
                priceLinesRef.current.forEach(line => {
                    try { (seriesRef.current as any).removePriceLine(line); } catch (e) { }
                });
                priceLinesRef.current = [];
            }

            const latestSignal: MasterSignal | null = strategy.analyze(data as any);
            if (latestSignal) {
                setLatestInsight(latestSignal.insight);

                if (seriesRef.current) {
                    if (latestSignal.direction !== 'NEUTRAL' && latestSignal.targets && latestSignal.targets.length > 0) {
                        latestSignal.targets.forEach((target: number, idx: number) => {
                            const line = (seriesRef.current as any).createPriceLine({
                                price: target,
                                color: latestSignal.direction === 'BULLISH' ? '#00FF88' : '#FF3366',
                                lineWidth: 2,
                                lineStyle: 0,
                                axisLabelVisible: true,
                                title: `T${idx + 1}`,
                            });
                            priceLinesRef.current.push(line);
                        });

                        const slLine = (seriesRef.current as any).createPriceLine({
                            price: latestSignal.stopLossPrice,
                            color: '#FFA500',
                            lineWidth: 2,
                            lineStyle: 1,
                            axisLabelVisible: true,
                            title: 'SL',
                        });
                        priceLinesRef.current.push(slLine);
                    }

                    if (latestSignal.supports) {
                        latestSignal.supports.forEach((level: number) => {
                            const line = (seriesRef.current as any).createPriceLine({
                                price: level,
                                color: '#00E676',
                                lineWidth: 1,
                                lineStyle: 2,
                                axisLabelVisible: true,
                                title: 'SUP',
                            });
                            priceLinesRef.current.push(line);
                        });
                    }
                    if (latestSignal.resistances) {
                        latestSignal.resistances.forEach((level: number) => {
                            const line = (seriesRef.current as any).createPriceLine({
                                price: level,
                                color: '#FF1744',
                                lineWidth: 1,
                                lineStyle: 2,
                                axisLabelVisible: true,
                                title: 'RES',
                            });
                            priceLinesRef.current.push(line);
                        });
                    }
                }
            }
        } catch (e) {
            console.warn("Error drawing levels", e);
        }

        const logicalRange = timeScale.getVisibleLogicalRange();
        if (logicalRange) {
            timeScale.setVisibleLogicalRange({
                from: logicalRange.to - 120,
                to: logicalRange.to
            });
        }
    }, [data, showSignals]);

    return (
        <div className="prediction-chart-container" style={{ position: 'relative' }}>
            <IntradayInsightWidget insight={latestInsight} loading={loading} />
            <div className="pred-header" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '5px', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#b0bec5', fontSize: '11px', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={showSignals}
                        onChange={(e) => setShowSignals(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                    />
                    Signals
                </label>
                <select value={interval} onChange={(e) => setIntervalState(Number(e.target.value))} style={{ background: '#1e1e2d', color: '#eee', border: '1px solid #444', borderRadius: '4px', fontSize: '11px', padding: '2px' }}>
                    <option value={1}>1 min</option>
                    <option value={3}>3 min</option>
                    <option value={5}>5 min</option>
                    <option value={15}>15 min</option>
                </select>
            </div>
            <div ref={chartContainerRef} className="chart-wrapper" style={{ width: '100%', height: '350px', position: 'relative' }}>
                {showSignals && <SignalRenderer chart={chartRef.current} series={seriesRef.current} signals={visualSignals} />}
                {showSignals && latestInsight && (
                    <div className="chart-signal-overlay" style={{
                        position: 'absolute',
                        top: '15px',
                        left: '15px',
                        zIndex: 100,
                        background: 'rgba(15, 15, 25, 0.85)',
                        backdropFilter: 'blur(12px)',
                        padding: '12px 18px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        pointerEvents: 'none',
                        minWidth: '180px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ fontSize: '9px', color: '#4c6fff', textTransform: 'uppercase', fontWeight: '900', letterSpacing: '1.5px' }}>PRO SIGNAL CORE V3</div>
                            <div className="turbo-badge" style={{
                                fontSize: '8px',
                                background: 'rgba(76, 111, 255, 0.2)',
                                color: '#fff',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontWeight: '700'
                            }}>PRO</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                            <div style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%',
                                background: latestInsight.nextLikelyTrend.includes('Bullish') ? '#00E676' : (latestInsight.nextLikelyTrend.includes('Bearish') ? '#FF1744' : '#FFD740'),
                                boxShadow: `0 0 15px ${latestInsight.nextLikelyTrend.includes('Bullish') ? '#00E676' : (latestInsight.nextLikelyTrend.includes('Bearish') ? '#FF1744' : '#FFD740')}`
                            }}></div>
                            <div style={{ fontSize: '18px', fontWeight: '900', color: '#fff', letterSpacing: '0.8px', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                                {latestInsight.nextLikelyTrend.toUpperCase()}
                            </div>
                        </div>

                        <div className="overlay-metrics" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', display: 'grid', gap: '4px' }}>
                            <div className="detail-row" style={{
                                fontSize: '10px',
                                padding: '5px 8px',
                                background: 'rgba(76, 111, 255, 0.1)',
                                borderRadius: '4px',
                                borderLeft: '2px solid #4c6fff',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '4px'
                            }}>
                                <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>SIGNAL PRICE:</span>
                                <span style={{ color: '#fff', fontWeight: '900', fontSize: '12px' }}>
                                    {visualSignals.length > 0 ? visualSignals[visualSignals.length - 1].price.toFixed(2) : '-'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
                                <span style={{ fontSize: '11px', color: '#aaa' }}>Structure:</span>
                                <span style={{ fontSize: '11px', color: '#fff', fontWeight: '600' }}>{latestInsight.candlestickStructure}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
                                <span style={{ fontSize: '11px', color: '#aaa' }}>Signal Purity:</span>
                                <span style={{ fontSize: '11px', color: latestInsight.marketSentimentScore! > 60 ? '#00E676' : '#ffd740' }}>{latestInsight.marketSentimentScore}%</span>
                            </div>
                        </div>
                    </div>
                )}
                {error && <div className="pred-chart-error" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#ff5252', textAlign: 'center', background: 'rgba(0,0,0,0.7)', padding: '10px', borderRadius: '4px', zIndex: 10 }}>{error}</div>}
                {loading && <div className="pred-chart-loading" style={{ position: 'absolute', bottom: '10px', right: '10px', zIndex: 10, background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px' }}>Updating...</div>}
            </div>
        </div>
    );
};

export default PredictionChart;
