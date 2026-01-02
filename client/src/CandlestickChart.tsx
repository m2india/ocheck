import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, type IChartApi, type ISeriesApi, CandlestickSeries } from 'lightweight-charts';

interface CandlestickChartProps {
    scrip: any;
    baseUrl: string;
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ scrip, baseUrl }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<any> | null>(null);
    const [interval, setIntervalVal] = useState('1'); // 1, 5, 15, 30, 60, D
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: 'rgba(255, 255, 255, 0.9)',
            },
            grid: {
                vertLines: { color: 'rgba(197, 203, 206, 0.1)' },
                horzLines: { color: 'rgba(197, 203, 206, 0.1)' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 400,
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
            },
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, []);

    const fetchHistoricalData = async () => {
        if (!scrip) return;
        setLoading(true);
        setError(null);

        try {
            const now = new Date();
            const today = now.toISOString().split('T')[0];

            // For historical, fromDate should be like 30 days ago
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
            const fromDate = startDate.toISOString().split('T')[0];

            const payload = {
                securityId: scrip.id.toString(),
                exchangeSegment: scrip.segment === 'IDX_I'
                    ? 'IDX_I'
                    : (scrip.segment === 'MCX_COMM' ? 'MCX_COMM' : 'NSE_EQ'),
                instrument: scrip.segment === 'IDX_I' ? 'INDEX' : (scrip.segment === 'MCX_COMM' ? 'FUTURES' : 'EQUITY'),
                interval: interval === 'D' ? 1440 : parseInt(interval, 10),
                fromDate: fromDate,
                toDate: today
            };

            const response = await fetch(`${baseUrl}/historical-chart`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to fetch historical data');
            }

            const result = await response.json();
            console.log('[DEBUG] Historical Data Response:', result);

            if (result.status === 'success' && result.data && result.data.timestamp) {
                const formatted = result.data.timestamp.map((ts: number, i: number) => ({
                    time: ts, // lightweight-charts accepts unix timestamp (seconds)
                    open: result.data.open[i],
                    high: result.data.high[i],
                    low: result.data.low[i],
                    close: result.data.close[i],
                }));

                // Sort by time just in case
                formatted.sort((a: any, b: any) => a.time - b.time);

                if (candleSeriesRef.current) {
                    candleSeriesRef.current.setData(formatted);
                }

                if (chartRef.current) {
                    chartRef.current.timeScale().fitContent();
                }
                const overlay = document.getElementById('no-data-overlay');
                if (overlay) overlay.style.display = 'none';
            } else {
                if (candleSeriesRef.current) candleSeriesRef.current.setData([]);
                const overlay = document.getElementById('no-data-overlay');
                if (overlay) overlay.style.display = 'block';
            }
        } catch (err: any) {
            console.error('Historical Chart fetch error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistoricalData();
    }, [scrip?.id, interval]);

    return (
        <div className="card" style={{ padding: '20px', marginBottom: '20px', background: 'rgba(30, 37, 64, 0.8)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#fff' }}>
                        {scrip.name} {interval === 'D' ? 'Daily' : `${interval}m`} Chart
                    </h3>
                </div>
                <div className="chart-controls" style={{ display: 'flex', gap: '8px' }}>
                    {['1', '5', '15', '30', '60', 'D'].map((t) => (
                        <button
                            key={t}
                            onClick={() => setIntervalVal(t)}
                            style={{
                                background: interval === t ? '#4c6fff' : 'rgba(255, 255, 255, 0.05)',
                                color: '#fff',
                                border: 'none',
                                padding: '4px 10px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                transition: 'all 0.2s'
                            }}
                        >
                            {t === 'D' ? 'Daily' : `${t}m`}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ position: 'relative' }}>
                {loading && (
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10, color: '#4c6fff' }}>
                        Loading Historical Data...
                    </div>
                )}
                {error && (
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10, color: '#ef5350' }}>
                        {error}
                    </div>
                )}
                <div ref={chartContainerRef} style={{ width: '100%', height: '400px' }} />
                {!loading && !error && (
                    <div id="no-data-overlay" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 5, color: 'rgba(255,255,255,0.5)', display: 'none' }}>
                        No Historical Data
                    </div>
                )}
            </div>
        </div>
    );
};

export default CandlestickChart;
