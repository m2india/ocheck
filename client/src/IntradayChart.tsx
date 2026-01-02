import { useEffect, useRef, useState, memo } from 'react';
import './IntradayChart.css';
import { createChart, ColorType, type IChartApi, type ISeriesApi, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { getMarketTimes } from './utils/marketUtils';
import IntradayInsightWidget from './IntradayInsightWidget';
import { MasterSignalEngine } from './utils/MasterSignalEngine';
import { SignalValidator } from './utils/SignalValidator';
import type { PredictionResult } from './utils/CandleAnalysisStrategy';
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

interface IntradayChartProps {
    scrip: any;
    baseUrl: string;
    isAutoRefresh: boolean;
    livePrice?: number;
    liveVolume?: number;
}

function IntradayChart({ scrip, baseUrl, isAutoRefresh, livePrice, liveVolume }: IntradayChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<any> | null>(null);

    // CPR & SNR Series Refs
    const pivotSeriesRef = useRef<ISeriesApi<any> | null>(null);
    const tcSeriesRef = useRef<ISeriesApi<any> | null>(null);
    const bcSeriesRef = useRef<ISeriesApi<any> | null>(null);
    const r1SeriesRef = useRef<ISeriesApi<any> | null>(null);
    const s1SeriesRef = useRef<ISeriesApi<any> | null>(null);
    const r2SeriesRef = useRef<ISeriesApi<any> | null>(null);
    const s2SeriesRef = useRef<ISeriesApi<any> | null>(null);

    // Projected Series Ref (Hidden series just to hold projected price lines non-invasively)
    const projSeriesRef = useRef<ISeriesApi<any> | null>(null);
    const projLinesRef = useRef<any[]>([]);
    const supportPriceLinesRef = useRef<any[]>([]);
    const resistancePriceLinesRef = useRef<any[]>([]);
    const markersPluginRef = useRef<any>(null);
    const cachedMarkersRef = useRef<any[]>([]);
    const lastMarkerUpdateTimeRef = useRef<number>(0);
    const lastLiveAnalysisRef = useRef<number>(0);
    const lastSigIdxRef = useRef<number>(-1);
    const lastDirRef = useRef<string>('');
    const lastSigTextRef = useRef<string>('');

    const isInitialLoad = useRef(true);
    const [isChartReady, setIsChartReady] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [interval, setIntervalVal] = useState(5);
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 50);
        return d.toISOString().split('T')[0];
    });
    const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [latestInsight, setLatestInsight] = useState<PredictionResult['insight'] | undefined>(undefined);
    const [showSignals, setShowSignals] = useState<boolean>(true);
    const [visualSignals, setVisualSignals] = useState<VisualSignal[]>([]);
    const [currentCandleVolume, setCurrentCandleVolume] = useState<number>(0);
    const [zones, setZones] = useState<{ supply: any[], demand: any[] }>({ supply: [], demand: [] });

    const updateStrategyLevels = (data: any[], isLiveUpdate: boolean = false) => {
        if (!data || !candleSeriesRef.current) return;

        // If signals are disabled, clear everything and return
        if (!showSignals) {
            setVisualSignals([]);
            setZones({ supply: [], demand: [] });
            if (candleSeriesRef.current) (candleSeriesRef.current as any).setMarkers([]);
            setLatestInsight(undefined);
            return;
        }

        if (data.length < 30) return;

        // Throttle strategy analysis during live updates (max once per 2 seconds for performance)
        const now = Date.now();
        if (isLiveUpdate && (now - lastLiveAnalysisRef.current < 2000)) return;
        lastLiveAnalysisRef.current = now;

        const strategy = new MasterSignalEngine();
        try {
            const latestSignal = strategy.analyze(data as any);
            if (latestSignal) {
                // Only update insight state if values meaningfully changed to prevent React re-render glitch during drag
                setLatestInsight(prev => {
                    if (!prev ||
                        prev.nextLikelyTrend !== latestSignal.insight?.nextLikelyTrend ||
                        prev.marketTrend !== latestSignal.insight?.marketTrend ||
                        prev.candlestickStructure !== latestSignal.insight?.candlestickStructure) {
                        return latestSignal.insight;
                    }
                    return prev;
                });

                // --- Visual Signals Logic ---
                let vSignals: VisualSignal[] = [];
                if (!isLiveUpdate || visualSignals.length === 0) {
                    lastDirRef.current = '';
                    lastSigTextRef.current = '';
                    const maxLookback = 150;
                    const startIdx = Math.max(30, data.length - maxLookback);

                    for (let i = startIdx; i < data.length; i++) {
                        const windowData = data.slice(0, i + 1);
                        const signal = strategy.analyze(windowData as any);

                        if (signal && signal.isCleanSignal && signal.direction !== 'NEUTRAL') {
                            const lastSig = vSignals.length > 0 ? vSignals[vSignals.length - 1] : null;
                            const barsSinceLast = lastSig ? i - (data.findIndex(d => d.time === lastSig.time)) : 999;
                            const isNewDirection = signal.direction !== lastDirRef.current;

                            // Standard Cooldown: 
                            // 1. 5-bar gap for same direction (Prevents clustering)
                            // 2. 2-bar gap for flips (Prevents minor whipsaws)
                            const isNotClutter = (isNewDirection && barsSinceLast > 2) || (!isNewDirection && barsSinceLast > 5);

                            if (isNotClutter) {
                                const isBull = signal.direction === 'BULLISH';
                                // Only push if direction changed OR it's a significant re-entry
                                if (isNewDirection) {
                                    vSignals.push({
                                        time: data[i].time,
                                        type: isBull ? 'BUY' : 'SELL',
                                        price: isBull ? data[i].low : data[i].high,
                                        tp: signal.targetPrice || (isBull ? data[i].close * 1.01 : data[i].close * 0.99),
                                        sl: signal.stopLossPrice || (isBull ? data[i].close * 0.99 : data[i].close * 1.01)
                                    });
                                    lastDirRef.current = signal.direction;
                                }
                            }
                        }
                    }
                    setVisualSignals(vSignals);

                    // Update Zones from the LATEST COMPLETE signal (to reflect current market structure)
                    // We look at the last analyzed signal for the most up-to-date zones
                    const lastProcessed = strategy.analyze(data as any);
                    if (lastProcessed) {
                        setZones({
                            supply: lastProcessed.supplyZones || [],
                            demand: lastProcessed.demandZones || []
                        });
                    }
                }
                else {
                    // Fast update for live tick
                    if (latestSignal.isCleanSignal && latestSignal.direction !== 'NEUTRAL') {
                        const lastM = visualSignals.length > 0 ? visualSignals[visualSignals.length - 1] : null;
                        const isNewDirection = (latestSignal.direction === 'BULLISH' ? 'BUY' : 'SELL') !== lastM?.type;

                        if (isNewDirection) {
                            const isBull = latestSignal.direction === 'BULLISH';
                            const entry = data[data.length - 1].close;
                            const newSig: VisualSignal = {
                                time: data[data.length - 1].time as number,
                                type: isBull ? 'BUY' : 'SELL',
                                price: isBull ? data[data.length - 1].low : data[data.length - 1].high,
                                tp: latestSignal.targetPrice || (isBull ? entry * 1.01 : entry * 0.99),
                                sl: latestSignal.stopLossPrice || (isBull ? entry * 0.99 : entry * 1.01)
                            };
                            setVisualSignals(prev => [...prev, newSig]);
                            lastSigIdxRef.current = data.length - 1;
                            lastDirRef.current = latestSignal.direction;
                        }
                    }

                    if (latestSignal) {
                        setZones({
                            supply: latestSignal.supplyZones || [],
                            demand: latestSignal.demandZones || []
                        });
                    }
                }

                if (candleSeriesRef.current) {
                    (candleSeriesRef.current as any).setMarkers([]);
                }

                // --- Optimized Dynamic Support/Resistance Lines ---
                if (projSeriesRef.current) {
                    // Sync Support Lines
                    const cPrice = data[data.length - 1].close;
                    const sPrice = (latestSignal.supports || [])
                        .filter(p => p > cPrice * 0.5 && p < cPrice * 1.5);
                    if (sPrice.length !== supportPriceLinesRef.current.length) {
                        supportPriceLinesRef.current.forEach(l => { try { projSeriesRef.current?.removePriceLine(l); } catch (e) { } });
                        supportPriceLinesRef.current = [];
                        sPrice.forEach(p => {
                            const l = projSeriesRef.current?.createPriceLine({
                                price: p, color: 'rgba(0, 230, 118, 0.4)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'SUP'
                            });
                            if (l) supportPriceLinesRef.current.push(l);
                        });
                    } else {
                        sPrice.forEach((p, i) => supportPriceLinesRef.current[i].applyOptions({ price: p }));
                    }

                    // Sync Resistance Lines
                    const rPrice = (latestSignal.resistances || [])
                        .filter(p => p > cPrice * 0.5 && p < cPrice * 1.5);
                    if (rPrice.length !== resistancePriceLinesRef.current.length) {
                        resistancePriceLinesRef.current.forEach(l => { try { projSeriesRef.current?.removePriceLine(l); } catch (e) { } });
                        resistancePriceLinesRef.current = [];
                        rPrice.forEach(p => {
                            const l = projSeriesRef.current?.createPriceLine({
                                price: p, color: 'rgba(255, 23, 68, 0.4)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'RES'
                            });
                            if (l) resistancePriceLinesRef.current.push(l);
                        });
                    } else {
                        rPrice.forEach((p, i) => resistancePriceLinesRef.current[i].applyOptions({ price: p }));
                    }

                    // Primary Target Line
                    if (latestSignal.targetPrice && latestSignal.direction !== 'NEUTRAL' && latestSignal.targetPrice > cPrice * 0.5 && latestSignal.targetPrice < cPrice * 2.0) {
                        if (projLinesRef.current.length === 0) {
                            const tl = projSeriesRef.current.createPriceLine({
                                price: latestSignal.targetPrice, color: '#4c6fff', lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: 'TARGET'
                            });
                            if (tl) projLinesRef.current.push(tl);
                        } else {
                            projLinesRef.current[0].applyOptions({ price: latestSignal.targetPrice });
                        }
                    } else if (projLinesRef.current.length > 0) {
                        projLinesRef.current.forEach(l => { try { projSeriesRef.current?.removePriceLine(l); } catch (e) { } });
                        projLinesRef.current = [];
                    }
                }
            }
        } catch (e) {
            console.error("Analysis helper error:", e);
        }
    };



    // Replay State
    const [isReplaying, setIsReplaying] = useState(false);
    const isReplayingRef = useRef(false);
    const [replayPaused, setReplayPaused] = useState(false);

    const fullDataRef = useRef<any[]>([]);
    const replayIndexRef = useRef(0);
    const replayIntervalRef = useRef<any>(null);
    const isMounted = useRef<boolean>(true);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: '#000000' },
                textColor: 'rgba(255, 255, 255, 0.9)',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 500,
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                barSpacing: 8,
                fixLeftEdge: true,
                shiftVisibleRangeOnNewBar: true,
                tickMarkFormatter: (time: number, tickMarkType: number) => {
                    const date = new Date(time * 1000);
                    // tickMarkType: 0=Year, 1=Month, 2=DayOfMonth, 3=Time, 4=TimeWithSeconds
                    if (tickMarkType < 3) {
                        return istDateFormatter.format(date);
                    }
                    return istTimeFormatter.format(date);
                },
            },
            rightPriceScale: {
                visible: true,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                autoScale: true,
            },
            crosshair: {
                mode: 1,
                vertLine: { labelVisible: true },
                horzLine: { labelVisible: true }
            },
            handleScroll: {
                mouseWheel: true,
                pressedMouseMove: true,
                horzTouchDrag: true,
                vertTouchDrag: true,
            },
            handleScale: {
                axisPressedMouseMove: true,
                mouseWheel: true,
                pinch: true,
            },
            localization: {
                priceFormatter: (p: number) => p.toFixed(2),
                timeFormatter: (ts: number) => {
                    return istTimeFormatter.format(new Date(ts * 1000));
                },
            }
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#00E676',       // Vibrant Green
            downColor: '#FF1744',     // Vibrant Red
            borderVisible: true,
            borderUpColor: '#00E676',
            borderDownColor: '#FF1744',
            wickUpColor: '#00E676',
            wickDownColor: '#FF1744',
            wickVisible: true,
        });

        // Initialize S&R Series (Hidden by default or empty, and ignored by auto-scale)
        const ignoreScale = { autoscaleInfoProvider: () => null };

        pivotSeriesRef.current = chart.addSeries(LineSeries, { color: '#ffeb3b', lineWidth: 1, lineStyle: 0, title: 'Pivot', crosshairMarkerVisible: false, priceLineVisible: false, ...ignoreScale });
        tcSeriesRef.current = chart.addSeries(LineSeries, { color: '#b39ddb', lineWidth: 1, lineStyle: 2, title: 'TC', crosshairMarkerVisible: false, priceLineVisible: false, ...ignoreScale });
        bcSeriesRef.current = chart.addSeries(LineSeries, { color: '#b39ddb', lineWidth: 1, lineStyle: 2, title: 'BC', crosshairMarkerVisible: false, priceLineVisible: false, ...ignoreScale });
        r1SeriesRef.current = chart.addSeries(LineSeries, { color: '#00e676', lineWidth: 1, lineStyle: 0, title: 'R1', crosshairMarkerVisible: false, priceLineVisible: false, ...ignoreScale });
        s1SeriesRef.current = chart.addSeries(LineSeries, { color: '#ff5252', lineWidth: 1, lineStyle: 0, title: 'S1', crosshairMarkerVisible: false, priceLineVisible: false, ...ignoreScale });
        r2SeriesRef.current = chart.addSeries(LineSeries, { color: '#69f0ae', lineWidth: 1, lineStyle: 2, title: 'R2', crosshairMarkerVisible: false, priceLineVisible: false, ...ignoreScale });
        s2SeriesRef.current = chart.addSeries(LineSeries, { color: '#d50000', lineWidth: 1, lineStyle: 2, title: 'S2', crosshairMarkerVisible: false, priceLineVisible: false, ...ignoreScale });

        // This series exists solely to anchor the Projected PriceLines so they don't affect main scale
        projSeriesRef.current = chart.addSeries(LineSeries, {
            lastValueVisible: false,
            priceLineVisible: false,
            visible: true, // Must be visible to show price lines? actually yes usually
            ...ignoreScale
        });




        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;
        setIsChartReady(true);

        chart.subscribeClick((param) => {
            if (!param.time || !param.point || !candleSeriesRef.current) return;

            // Handle Replay Seeking logic (existing)
            if (isReplayingRef.current && fullDataRef.current.length > 0) {
                const clickedTime = param.time as number;
                const index = fullDataRef.current.findIndex(d => d.time === clickedTime);
                if (index !== -1) {
                    replayIndexRef.current = index + 1;
                    const slice = fullDataRef.current.slice(0, index + 1);
                    if (candleSeriesRef.current) {
                        candleSeriesRef.current.setData(slice);
                    }
                    setReplayPaused(true);
                }
                return;
            }


        });

        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                requestAnimationFrame(() => {
                    chartRef.current?.applyOptions({ width: chartContainerRef.current?.clientWidth || 0 });
                });
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);



            try {
                chart.remove();
            } catch (e) {
                // ignore
            }
            chartRef.current = null;
            candleSeriesRef.current = null;
            pivotSeriesRef.current = null;
            tcSeriesRef.current = null;
            bcSeriesRef.current = null;
            r1SeriesRef.current = null;
            s1SeriesRef.current = null;
            r2SeriesRef.current = null;
            s2SeriesRef.current = null;
            projSeriesRef.current = null;
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        if (isReplaying && !replayPaused) {
            replayIntervalRef.current = setInterval(() => {
                if (!fullDataRef.current || replayIndexRef.current >= fullDataRef.current.length) {
                    setReplayPaused(true);
                    return;
                }
                if (replayIndexRef.current === 0 && candleSeriesRef.current) {
                    candleSeriesRef.current.setData([]);
                }
                const nextCandle = fullDataRef.current[replayIndexRef.current];
                if (candleSeriesRef.current) {
                    candleSeriesRef.current.update(nextCandle);
                }

                // Real-time analysis during replay
                const currentData = fullDataRef.current.slice(0, replayIndexRef.current + 1);
                updateStrategyLevels(currentData, true);

                replayIndexRef.current++;
            }, 200);
        } else {
            if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
        }
        return () => {
            if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
        };
    }, [isReplaying, replayPaused]);

    const handleStopReplay = () => {
        setIsReplaying(false);
        isReplayingRef.current = false;
        setReplayPaused(false);
        if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
        if (candleSeriesRef.current && fullDataRef.current.length > 0) {
            candleSeriesRef.current.setData(fullDataRef.current);
            updateStrategyLevels(fullDataRef.current, false); // Full update after replay
        }
    };

    const fetchIntradayData = async (isBackground = false, daysToSubtract = 0, manualFrom?: string, manualTo?: string, fallbackStage: number = 0) => {
        if (!scrip) return;
        if (isReplaying) return;

        if (!isBackground && daysToSubtract === 0 && fallbackStage === 0) setLoading(true);
        if (daysToSubtract === 0 && fallbackStage === 0) setError(null);

        try {
            const now = new Date();
            now.setDate(now.getDate() - daysToSubtract);

            let finalFrom = manualFrom;
            let finalTo = manualTo;
            const isManual = !!manualFrom;

            if (!isManual) {
                const targetDate = now.toISOString().split('T')[0];
                finalFrom = targetDate;
                finalTo = targetDate;

                const times = getMarketTimes(scrip.segment);
                finalFrom += ` ${times.start}`;
                finalTo += ` ${times.end}`;
            } else {
                const times = getMarketTimes(scrip.segment);
                if (finalFrom && !finalFrom.includes(':')) finalFrom += ` ${times.start}`;
                if (finalTo && !finalTo.includes(':')) finalTo += ` ${times.end}`;
            }

            const payload = {
                securityId: scrip.id.toString(),
                exchangeSegment: scrip.segment === 'IDX_I' ? 'IDX_I' : (scrip.segment === 'MCX_COMM' ? 'MCX_COMM' : 'NSE_EQ'),
                instrument: scrip.segment === 'IDX_I' ? 'INDEX' : (scrip.segment === 'MCX_COMM' ? 'FUTCOM' : 'EQUITY'),
                interval: interval,
                oi: true,
                fromDate: finalFrom,
                toDate: finalTo
            };

            const response = await fetch(`${baseUrl}/intraday-chart`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json() as any;
                throw new Error(errData.error || 'Failed to fetch chart data');
            }

            const result = await response.json() as any;
            const sourceData = (result.data?.timestamp ? result.data : (result.timestamp ? result : null)) as any;

            if (sourceData && sourceData.timestamp && sourceData.timestamp.length > 0) {
                const formatted = sourceData.timestamp
                    .map((ts: number, i: number) => ({
                        time: ts,
                        open: sourceData.open[i],
                        high: sourceData.high[i],
                        low: sourceData.low[i],
                        close: sourceData.close[i],
                        volume: sourceData.volume ? sourceData.volume[i] : 0
                    }))
                    .filter((d: any) => d.close > 0 && d.low > 0 && d.high > 0); // Strict sanity check: ignore zero/negative prices

                const uniqueData: any[] = Array.from(new Map(formatted.map((item: any) => [item.time, item])).values())
                    .sort((a: any, b: any) => (a.time as number) - (b.time as number));

                fullDataRef.current = uniqueData;

                if (isMounted.current && candleSeriesRef.current) {
                    candleSeriesRef.current.setData(uniqueData as any);

                    if (uniqueData.length > 0) {
                        const last = uniqueData[uniqueData.length - 1];
                        setCurrentCandleVolume(last.volume || 0);
                    }

                    // --- Analysis & Markers Logic (Now handled correctly in updateStrategyLevels) ---
                    cachedMarkersRef.current = []; // Reset cache on fresh data
                    updateStrategyLevels(uniqueData, false);
                }
            } else {
                // No data found - try fallback stage if not manual
                if (!isManual && fallbackStage < 3) {
                    console.log(`[CHART] No data for stage ${fallbackStage}, retrying with smaller range...`);
                    await fetchIntradayData(isBackground, 0, undefined, undefined, fallbackStage + 1);
                    return;
                }

                if (isManual) {
                    if (candleSeriesRef.current) candleSeriesRef.current.setData([]);
                    setError('No chart data available for the selected range.');
                    return;
                }

                if (daysToSubtract < 5) {
                    await fetchIntradayData(isBackground, daysToSubtract + 1);
                } else {
                    if (daysToSubtract === 0 && candleSeriesRef.current) candleSeriesRef.current.setData([]);
                    if (!isBackground) setError('No chart data available for the last 5 days.');
                }
            }

            if (isMounted.current && chartRef.current && !isBackground && (isInitialLoad.current || isManual)) {
                try {
                    const timeScale = chartRef.current.timeScale();
                    timeScale.fitContent();

                    if (fullDataRef.current.length > 50) {
                        const report = SignalValidator.runBacktest(fullDataRef.current);
                        console.log(`%c [BACKTEST REPORT] ${scrip.name} `, 'background: #222; color: #bada55; font-weight: bold;');
                        console.table({
                            'Win Rate': `${report.winRate.toFixed(2)}%`,
                            'Profit Factor': report.profitFactor.toFixed(2),
                            'Total Trades': report.totalTrades,
                            'Net Points': report.netPoints.toFixed(2)
                        });
                    }

                    const logicalRange = timeScale.getVisibleLogicalRange();
                    if (logicalRange) {
                        timeScale.setVisibleLogicalRange({
                            from: logicalRange.to - 120,
                            to: logicalRange.to
                        });
                    }
                } catch (e) {
                    console.warn("Chart interaction error:", e);
                }
                isInitialLoad.current = false;
            }
        } catch (err: any) {
            console.error('Chart fetch error:', err);
            if (!manualFrom && fallbackStage < 3) {
                await fetchIntradayData(isBackground, 0, undefined, undefined, fallbackStage + 1);
                return;
            }
            let msg = err.message || 'Unknown error';
            if (msg.includes('DH-905') || msg.includes('Input_Exception')) {
                msg = 'No data available.';
            } else if (msg.includes('Failed to fetch')) {
                msg = 'Connection error.';
            }
            if (daysToSubtract === 0) setError(msg);
        } finally {
            if (!isBackground && daysToSubtract === 0 && fallbackStage === 0) setLoading(false);
        }
    };

    const handleTogglePlay = () => {
        if (!fullDataRef.current || fullDataRef.current.length === 0) return;
        if (!isReplaying) {
            setIsReplaying(true);
            isReplayingRef.current = true;
            setReplayPaused(true);
            replayIndexRef.current = 0;
        } else {
            setReplayPaused(prev => !prev);
        }
    };

    const handleZoomIn = () => {
        if (chartRef.current) {
            const timeScale = chartRef.current.timeScale();
            const currentSpacing = timeScale.options().barSpacing || 6;
            timeScale.applyOptions({ barSpacing: currentSpacing * 1.2 });
        }
    };

    const handleZoomOut = () => {
        if (chartRef.current) {
            const timeScale = chartRef.current.timeScale();
            const currentSpacing = timeScale.options().barSpacing || 6;
            timeScale.applyOptions({ barSpacing: currentSpacing * 0.8 });
        }
    };

    const handleReset = () => {
        if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
        }
    };

    const handleResetPrice = () => {
        if (chartRef.current) {
            chartRef.current.priceScale('right').applyOptions({ autoScale: true });
        }
    };

    const handleGo = () => {
        fetchIntradayData(false, 0, fromDate, toDate);
    };

    useEffect(() => {
        if (!isChartReady) return;
        isInitialLoad.current = true;
        handleStopReplay();
        if (candleSeriesRef.current) candleSeriesRef.current.setData([]);
        const f = fromDate;
        const t = toDate;
        fetchIntradayData(false, 0, f, t);
        let intervalId: any;
        if (isAutoRefresh) {
            intervalId = setInterval(() => fetchIntradayData(true, 0, f, t), 60000);
        }
        return () => clearInterval(intervalId);
    }, [isChartReady, scrip?.id, interval, fromDate, toDate, isAutoRefresh]);

    useEffect(() => {
        if (!isChartReady || !livePrice || livePrice <= 0 || !candleSeriesRef.current || isReplaying) return;

        // Find the current candle to update
        if (fullDataRef.current.length === 0) return;

        const lastCandle = fullDataRef.current[fullDataRef.current.length - 1];

        // SYNC FIX: Instead of relying purely on client clock (Date.now), 
        // we use the market time offset based on the last known server candle
        const intervalInSeconds = interval * 60;
        const now = Date.now() / 1000;

        // If the gap is huge (e.g. system wake from sleep), don't update
        if (Math.abs(now - lastCandle.time) > 86400) return;

        const currentCandleTime = Math.floor(now / intervalInSeconds) * intervalInSeconds;

        if (currentCandleTime === lastCandle.time) {
            // Update same candle
            lastCandle.close = livePrice;
            if (livePrice > lastCandle.high) lastCandle.high = livePrice;
            if (livePrice < lastCandle.low) lastCandle.low = livePrice;

            // Handle Volume: liveVolume is cumulative day volume
            if (liveVolume && liveVolume > 0 && lastCandle.volume !== undefined) {
                // Calculate volume of all previous candles
                const previousCandlesVolume = fullDataRef.current
                    .slice(0, -1)
                    .reduce((sum, c) => sum + (c.volume || 0), 0);
                const candleVol = Math.max(0, liveVolume - previousCandlesVolume);

                // Only update if volume actually changed meaningfully
                if (Math.abs(lastCandle.volume - candleVol) > 0) {
                    lastCandle.volume = candleVol;
                    setCurrentCandleVolume(candleVol);
                }
            }

            candleSeriesRef.current.update(lastCandle as any);

            // Optimized live strategy update (throttled)
            updateStrategyLevels(fullDataRef.current, true);
        } else if (currentCandleTime > lastCandle.time) {
            // Start new candle
            const previousTotalVolume = fullDataRef.current.reduce((sum, c) => sum + (c.volume || 0), 0);
            const initialVol = liveVolume ? Math.max(0, liveVolume - previousTotalVolume) : 0;

            const newCandle = {
                time: currentCandleTime as any,
                open: livePrice,
                high: livePrice,
                low: livePrice,
                close: livePrice,
                volume: initialVol
            };
            fullDataRef.current.push(newCandle);
            candleSeriesRef.current.update(newCandle as any);
            setCurrentCandleVolume(initialVol);

            // Re-update strategy for new candle
            cachedMarkersRef.current = []; // Clear cache to allow recalculation including previous closed candle
            updateStrategyLevels(fullDataRef.current, true);
        }
    }, [livePrice, liveVolume, isChartReady, interval, isReplaying]);

    // --- S&R / CPR Logic ---

    useEffect(() => {
        const histRefs = [pivotSeriesRef, tcSeriesRef, bcSeriesRef, r1SeriesRef, s1SeriesRef, r2SeriesRef, s2SeriesRef];

        // Always allow clearing loops to run first to ensure clean state
        histRefs.forEach(r => r.current?.setData([]));

        // CRITICAL FIX: Clear old data immediately to prevent processing old symbol data
        fullDataRef.current = [];

        // Clear projected lines safely
        if (projLinesRef.current.length > 0) {
            projLinesRef.current.forEach(l => {
                if (l) projSeriesRef.current?.removePriceLine(l);
            });
        }
        projLinesRef.current = [];

        if (supportPriceLinesRef.current.length > 0) {
            supportPriceLinesRef.current.forEach(l => {
                if (l) projSeriesRef.current?.removePriceLine(l);
            });
        }
        supportPriceLinesRef.current = [];

        if (resistancePriceLinesRef.current.length > 0) {
            resistancePriceLinesRef.current.forEach(l => {
                if (l) projSeriesRef.current?.removePriceLine(l);
            });
        }
        resistancePriceLinesRef.current = [];

        projSeriesRef.current?.setData([]);

        // Clear markers plugin when scrip changes
        if (markersPluginRef.current) {
            markersPluginRef.current.setMarkers([]);
            markersPluginRef.current = null;
        }
        cachedMarkersRef.current = [];
        lastLiveAnalysisRef.current = 0;
        lastMarkerUpdateTimeRef.current = 0;
    }, [scrip?.id, showSignals]);
    return (
        <div className="intraday-chart-card">
            <IntradayInsightWidget insight={latestInsight} loading={loading} currentCandleVolume={currentCandleVolume} />
            <div className="chart-controls-row">
                <div className="chart-controls-left">
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#fff' }}>{scrip.name} Intraday</h3>

                    <div className="date-range-inputs">
                        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '3px 6px', fontSize: '11px', outline: 'none' }} />
                        <span style={{ color: '#aaa', fontSize: '12px' }}>-</span>
                        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '3px 6px', fontSize: '11px', outline: 'none' }} />
                        <button onClick={handleGo} style={{ background: '#4c6fff', color: '#fff', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>GO</button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#b0bec5', fontSize: '11px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px' }}>
                            <input
                                type="checkbox"
                                checked={showSignals}
                                onChange={(e) => setShowSignals(e.target.checked)}
                                style={{ cursor: 'pointer' }}
                            />
                            Signals
                        </label>


                        <div style={{ display: 'flex', gap: '2px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '2px', alignItems: 'center' }}>
                            <button onClick={handleTogglePlay} title={isReplaying && !replayPaused ? "Pause" : "Play"} style={{ background: isReplaying ? '#4c6fff' : 'transparent', border: 'none', color: isReplaying && !replayPaused ? '#ffeb3b' : '#4caf50', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span>{isReplaying && !replayPaused ? '⏸' : '▶'}</span>
                                <span>Replay</span>
                            </button>
                            {isReplaying && <button onClick={handleStopReplay} title="Stop" style={{ background: 'transparent', border: 'none', color: '#f44336', cursor: 'pointer', fontSize: '14px', padding: '2px 4px' }}>⏹</button>}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {/* Repositioned tool is at the front of this container's parent */}
                        </div>

                        <select value={interval} onChange={(e) => setIntervalVal(Number(e.target.value))} className="chart-interval-select" style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 2px', fontSize: '12px', cursor: 'pointer', outline: 'none', transition: 'all 0.2s' }}>
                            {[1, 3, 5, 10, 15, 30, 60].map((min) => (
                                <option key={min} value={min} style={{ color: '#000' }}>{min}m</option>
                            ))}
                        </select>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={handleResetPrice} style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Reset Price Scale">Price</button>
                            <button onClick={handleZoomIn} style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Zoom In">+</button>
                            <button onClick={handleZoomOut} style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Zoom Out">-</button>
                            <button onClick={handleReset} style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Reset View">⟲</button>
                        </div>
                    </div>
                </div>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Last update: {new Date().toLocaleTimeString()}</span>
            </div>
            {error && <div style={{ color: '#ffffff', fontSize: '10px', marginBottom: '5px' }}>{error}</div>}
            <div style={{ position: 'relative', width: '100%', height: 'calc(100% - 30px)' }}>
                {loading && (
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10, color: '#4c6fff', fontSize: '12px' }}>Loading...</div>
                )}
                <div style={{ position: 'relative', width: '100%', height: '500px' }}>
                    <div ref={chartContainerRef} style={{ width: '100%', height: '100%', cursor: 'default' }} />
                    {showSignals && <SignalRenderer
                        chart={chartRef.current}
                        series={candleSeriesRef.current as any}
                        signals={visualSignals}
                        zones={zones}
                    />}
                </div>
                {showSignals && latestInsight && (
                    <div className="chart-signal-overlay" style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        zIndex: 100,
                        background: 'rgba(0, 0, 0, 0.6)',
                        backdropFilter: 'blur(10px)',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        pointerEvents: 'none',
                        minWidth: '160px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                        transition: 'all 0.3s ease'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ fontSize: '9px', color: '#ffeb3b', textTransform: 'uppercase', fontWeight: '900', letterSpacing: '1.5px' }}>SNIPER REVERSAL V1</div>
                            <div className="turbo-badge" style={{
                                fontSize: '8px',
                                background: 'rgba(255, 235, 59, 0.2)',
                                color: '#ffeb3b',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontWeight: '700'
                            }}>RSI+BB</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <div style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                background: latestInsight.nextLikelyTrend.includes('Bullish') ? '#00E676' : (latestInsight.nextLikelyTrend.includes('Bearish') ? '#FF1744' : '#FFD740'),
                                boxShadow: `0 0 12px ${latestInsight.nextLikelyTrend.includes('Bullish') ? '#00E676' : (latestInsight.nextLikelyTrend.includes('Bearish') ? '#FF1744' : '#FFD740')}`
                            }}></div>
                            <div className="trend-text" style={{ fontSize: '15px', fontWeight: '900', color: '#fff', letterSpacing: '0.8px', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                                {latestInsight.nextLikelyTrend.toUpperCase()}
                            </div>
                        </div>
                        <div style={{ marginTop: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', fontWeight: '700' }}>STRENGTH</span>
                                <span style={{
                                    fontSize: '11px',
                                    fontWeight: '900',
                                    color: (latestInsight.marketSentimentScore || 50) >= 50 ? '#00E676' : '#FF1744'
                                }}>
                                    {(latestInsight.marketSentimentScore || 50) >= 50
                                        ? `${(latestInsight.marketSentimentScore || 50).toFixed(0)}% BULL`
                                        : `${(100 - (latestInsight.marketSentimentScore || 50)).toFixed(0)}% BEAR`}
                                </span>
                            </div>
                            <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{
                                    width: `${latestInsight.marketSentimentScore || 50}%`,
                                    height: '100%',
                                    background: `linear-gradient(90deg, #FF1744, #00E676)`,
                                    transition: 'width 0.5s ease-out'
                                }}></div>
                            </div>
                        </div>

                        <div style={{ marginTop: '8px', padding: '4px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontWeight: '700' }}>LTP CHANGE:</span>
                            <span style={{
                                fontSize: '11px',
                                fontWeight: '900',
                                color: (latestInsight.marketTrendPct || 0) >= 0 ? '#00E676' : '#FF1744'
                            }}>
                                {(latestInsight.marketTrendPct || 0) >= 0 ? '+' : ''}
                                {(latestInsight.marketTrendPct || 0).toFixed(2)}%
                            </span>
                        </div>
                        <div className="overlay-details" style={{ marginTop: '10px', display: 'grid', gap: '4px' }}>
                            <div className="detail-row" style={{
                                fontSize: '10px',
                                padding: '5px 8px',
                                background: 'rgba(76, 111, 255, 0.1)',
                                borderRadius: '4px',
                                borderLeft: '2px solid #4c6fff',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>SIGNAL PRICE:</span>
                                <span style={{ color: '#fff', fontWeight: '900', fontSize: '12px' }}>
                                    {visualSignals.length > 0 ? visualSignals[visualSignals.length - 1].price.toFixed(2) : '-'}
                                </span>
                            </div>
                            <div className="detail-row" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
                                <span>Structure:</span>
                                <span style={{ color: '#fff', fontWeight: '600' }}>{latestInsight.candlestickStructure}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default memo(IntradayChart);
