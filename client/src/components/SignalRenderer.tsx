import React, { useEffect, useState, useCallback } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';

export interface VisualSignal {
    time: number;
    type: 'BUY' | 'SELL';
    price: number;
    tp: number;
    sl: number;
}

interface Zone {
    top: number;
    bottom: number;
}

interface SignalRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    signals: VisualSignal[];
    zones?: { supply: Zone[]; demand: Zone[] };
}

interface Coord {
    x: number;
    y: number;
}

interface ZoneCoords {
    supply: { top: number; bottom: number; }[];
    demand: { top: number; bottom: number; }[];
}

const SignalRenderer: React.FC<SignalRendererProps> = ({ chart, series, signals, zones }) => {
    const [coords, setCoords] = useState<Record<string, Coord>>({});
    const [zoneCoords, setZoneCoords] = useState<ZoneCoords>({ supply: [], demand: [] });

    const updateCoords = useCallback(() => {
        if (!chart || !series) return;

        // 1. Update Signal Coordinates
        const next: Record<string, Coord> = {};
        for (const sig of signals) {
            const x = chart.timeScale().timeToCoordinate(sig.time as any);
            const y = series.priceToCoordinate(sig.price);
            if (x == null || y == null) continue;
            next[`${sig.time}-${sig.type}`] = { x, y };
        }
        setCoords(next);

        // 2. Update Zone Coordinates
        if (zones) {
            const sCoords = zones.supply.map(z => ({
                top: series.priceToCoordinate(z.top) || 0,
                bottom: series.priceToCoordinate(z.bottom) || 0
            })).filter(z => z.top !== 0 && z.bottom !== 0);

            const dCoords = zones.demand.map(z => ({
                top: series.priceToCoordinate(z.top) || 0,
                bottom: series.priceToCoordinate(z.bottom) || 0
            })).filter(z => z.top !== 0 && z.bottom !== 0);

            setZoneCoords({ supply: sCoords, demand: dCoords });
        }

    }, [chart, series, signals, zones]);

    useEffect(() => {
        if (!chart) return;

        const ts = chart.timeScale();

        ts.subscribeVisibleTimeRangeChange(updateCoords);
        chart.subscribeCrosshairMove(updateCoords);

        updateCoords();

        return () => {
            ts.unsubscribeVisibleTimeRangeChange(updateCoords);
            chart.unsubscribeCrosshairMove(updateCoords);
        };
    }, [chart, updateCoords]);

    if (!chart || !series) return null;

    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 50,
            }}
        >
            {/* RENDER SUPPLY ZONES (RED) */}
            {zoneCoords.supply.map((z, i) => (
                <div key={`sup-${i}`} style={{
                    position: 'absolute',
                    right: 0, // Anchor to right side for "extension" effect
                    left: 0,  // Spanning full width (or we could anchor left if we had time coord)
                    top: Math.min(z.top, z.bottom),
                    height: Math.abs(z.bottom - z.top),
                    background: 'rgba(255, 23, 68, 0.15)', // Transparent Red
                    borderTop: '1px solid rgba(255, 23, 68, 0.4)',
                    borderBottom: '1px solid rgba(255, 23, 68, 0.4)',
                    zIndex: 1
                }} />
            ))}

            {/* RENDER DEMAND ZONES (GREEN) */}
            {zoneCoords.demand.map((z, i) => (
                <div key={`dem-${i}`} style={{
                    position: 'absolute',
                    right: 0,
                    left: 0,
                    top: Math.min(z.top, z.bottom),
                    height: Math.abs(z.bottom - z.top),
                    background: 'rgba(0, 230, 118, 0.15)', // Transparent Green
                    borderTop: '1px solid rgba(0, 230, 118, 0.4)',
                    borderBottom: '1px solid rgba(0, 230, 118, 0.4)',
                    zIndex: 1
                }} />
            ))}

            {/* SIGNALS */}
            {signals.map(sig => {
                const key = `${sig.time}-${sig.type}`;
                const c = coords[key];
                if (!c) return null;

                const isBuy = sig.type === 'BUY';

                return (
                    <div
                        key={key}
                        style={{
                            position: 'absolute',
                            left: c.x,
                            top: c.y,
                            transform: isBuy
                                ? 'translate(-50%, 8px)'
                                : 'translate(-50%, -120%)',
                            fontSize: 14,
                            fontWeight: 900,
                            color: isBuy ? '#00e676' : '#ff1744',
                            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                            userSelect: 'none',
                        }}
                    >
                        {isBuy ? '▲' : '▼'}
                    </div>
                );
            })}
        </div>
    );
};

export default SignalRenderer;
