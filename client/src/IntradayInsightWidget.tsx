import React from 'react';
import type { PredictionResult } from './utils/CandleAnalysisStrategy';
import './IntradayInsightWidget.css';

interface InsightProps {
    insight?: PredictionResult['insight'];
    loading?: boolean;
    currentCandleVolume?: number;
}

const IntradayInsightWidget: React.FC<InsightProps> = ({ insight, loading, currentCandleVolume }) => {
    if (loading) {
        return (
            <div className="intraday-insight-card loading">
                <div className="skeleton-line pulse"></div>
                <div className="skeleton-line pulse"></div>
            </div>
        );
    }

    if (!insight) {
        return (
            <div className="intraday-insight-card empty">
                <i className="fa fa-info-circle"></i> Initializing Analysis...
            </div>
        );
    }

    const getStatusColor = (status: string) => {
        if (!status) return '#B0BEC5';
        if (status.includes('Bullish')) return '#00E676';
        if (status.includes('Bearish')) return '#FF1744';
        if (status.includes('breakdown')) return '#FF9100';
        return '#B0BEC5';
    };



    return (
        <div className="intraday-insight-card">
            <div className="insight-header">
                <i className="fa fa-bolt"></i>
                <span>Intraday Signal Analysis</span>
            </div>

            <div className="confidence-gauge-section" style={{ marginBottom: '20px', padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.7, letterSpacing: '1px' }}>Technical Sentiment Score</span>
                    <span style={{ fontSize: '18px', fontWeight: 'bold', color: insight.marketSentimentScore! > 60 ? '#00E676' : (insight.marketSentimentScore! < 40 ? '#FF1744' : '#ffd740') }}>
                        {insight.marketSentimentScore?.toFixed(0)}%
                    </span>
                </div>
                <div style={{ height: '6px', width: '100%', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                        height: '100%',
                        width: `${insight.marketSentimentScore}%`,
                        background: `linear-gradient(90deg, #FF1744, #ffd740, #00E676)`,
                        backgroundSize: '200% 100%',
                        transition: 'width 0.5s ease-out',
                        boxShadow: `0 0 10px ${insight.marketSentimentScore! > 60 ? '#00E67644' : (insight.marketSentimentScore! < 40 ? '#FF174444' : '#ffd74044')}`
                    }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '9px', opacity: 0.5, textTransform: 'uppercase' }}>
                    <span>Extreme Fear</span>
                    <span>Neutral</span>
                    <span>Extreme Greed</span>
                </div>
            </div>

            <div className="insight-grid">
                <div className="insight-item">
                    <div className="insight-label">Candlestick Structure</div>
                    <div className="insight-value" style={{ color: getStatusColor(insight.candlestickStructure) }}>
                        {insight.candlestickStructure}
                        <i className={`fa ${insight.candlestickStructure === 'Bullish' ? 'fa-caret-up' : (insight.candlestickStructure === 'Bearish' ? 'fa-caret-down' : 'fa-minus')}`}></i>
                    </div>
                </div>

                <div className="insight-item">
                    <div className="insight-label">Volume Confirmation</div>
                    <div className="insight-value" style={{ color: getStatusColor(insight.volumeConfirmation) }}>
                        {insight.volumeConfirmation}
                        <i className="fa fa-database"></i>
                    </div>
                </div>

                <div className="insight-item highlight">
                    <div className="insight-label">Next Likely Trend</div>
                    <div className="insight-value trend-badge" style={{ backgroundColor: getStatusColor(insight.nextLikelyTrend) + '33', color: getStatusColor(insight.nextLikelyTrend), border: `1px solid ${getStatusColor(insight.nextLikelyTrend)}` }}>
                        {insight.nextLikelyTrend.toUpperCase()}
                    </div>
                </div>

                <div className="insight-item highlight" style={{ borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                    <div className="insight-label" style={{ opacity: 0.6 }}>Today Market Trend</div>
                    <div className="insight-value trend-badge" style={{
                        backgroundColor: (insight.marketTrend === 'BULLISH' ? '#00e676' : (insight.marketTrend === 'BEARISH' ? '#ff1744' : '#78909c')) + '22',
                        color: (insight.marketTrend === 'BULLISH' ? '#00e676' : (insight.marketTrend === 'BEARISH' ? '#ff1744' : '#78909c')),
                        border: `1px solid ${(insight.marketTrend === 'BULLISH' ? '#00e676' : (insight.marketTrend === 'BEARISH' ? '#ff1744' : '#78909c'))}44`,
                    }}>
                        {insight.marketTrend || 'NEUTRAL'}
                    </div>
                </div>

                <div className="insight-item active-candle">
                    <div className="insight-label">Active Candle Vol</div>
                    <div className="insight-value" style={{ color: '#ffd740', fontFamily: 'JetBrains Mono, monospace' }}>
                        {(() => {
                            if (!currentCandleVolume || currentCandleVolume <= 0) return 'N/A';
                            if (currentCandleVolume >= 1000000) return (currentCandleVolume / 1000000).toFixed(2) + 'M';
                            if (currentCandleVolume >= 1000) return (currentCandleVolume / 1000).toFixed(1) + 'K';
                            return currentCandleVolume.toString();
                        })()}
                        <i className="fa fa-chart-line" style={{ fontSize: '12px', marginLeft: '5px' }}></i>
                    </div>
                </div>

                <div className="insight-item">
                    <div className="insight-label">Volume Activity</div>
                    <div className="insight-value" style={{ color: insight.volumeActivity === 'SURGE' ? '#00E676' : (insight.volumeActivity === 'QUIET' ? '#ff5252' : '#fff') }}>
                        {insight.volumeActivity || 'STABLE'}
                    </div>
                </div>

                <div className="insight-item">
                    <div className="insight-label">Volatility</div>
                    <div className="insight-value" style={{ color: insight.volatilityLabel === 'HIGH' ? '#ff5252' : '#90A4AE' }}>
                        {insight.volatilityLabel || 'NORMAL'}
                    </div>
                </div>

                <div className="insight-item">
                    <div className="insight-label">Liquidity</div>
                    <div className="insight-value" style={{ color: insight.liquidityLabel === 'DEEP' ? '#00E676' : '#fff' }}>
                        {insight.liquidityLabel || 'GOOD'}
                    </div>
                </div>
            </div>

            {(insight.currentPrice && insight.exactTarget) && (
                <div className="projection-section mobile-stack-aware">
                    <div className="projection-header">
                        <div className="insight-label">Goal Achievement Track</div>
                        <div className="achievement-pct" style={{
                            color: getStatusColor(insight.nextLikelyTrend),
                            background: getStatusColor(insight.nextLikelyTrend) + '15',
                            border: `1px solid ${getStatusColor(insight.nextLikelyTrend)}33`
                        }}>
                            {(() => {
                                const dist = Math.abs(insight.exactTarget! - insight.currentPrice!);
                                const total = insight.volatilityLabel === 'HIGH' ? insight.currentPrice! * 0.01 : insight.currentPrice! * 0.005;
                                const pct = Math.max(0, Math.min(100, 100 - (dist / total * 100)));
                                return `${pct.toFixed(1)}% ACHIEVED`;
                            })()}
                        </div>
                    </div>

                    <div className="full-width-range">
                        <div className="range-labels">
                            <div className="price-tag current" style={{ color: '#ffd740' }}>
                                <span>Current LTP</span>
                                ₹{insight.currentPrice.toFixed(2)}
                            </div>
                            <div className="price-tag target" style={{ color: getStatusColor(insight.nextLikelyTrend), textAlign: 'right' }}>
                                <span>Goal Target</span>
                                ₹{insight.exactTarget.toFixed(2)}
                            </div>
                        </div>

                        <div className="progress-track">
                            <div className="comet-flow" style={{
                                background: `linear-gradient(90deg, transparent, ${getStatusColor(insight.nextLikelyTrend)})`,
                                boxShadow: `0 0 20px ${getStatusColor(insight.nextLikelyTrend)}`,
                            }}></div>
                            <div className="progress-fill" style={{
                                width: (() => {
                                    const dist = Math.abs(insight.exactTarget! - insight.currentPrice!);
                                    const total = insight.currentPrice! * 0.01;
                                    return `${Math.max(5, Math.min(100, 100 - (dist / total * 100)))}%`;
                                })(),
                                background: getStatusColor(insight.nextLikelyTrend),
                            }}></div>
                        </div>
                    </div>

                    {insight.targets && insight.targets.length > 0 && (
                        <div className="multi-targets">
                            {insight.targets.map((t: number, idx: number) => (
                                <div key={idx} className="target-pill">
                                    <div className="target-num">T{idx + 1}</div>
                                    <div className="target-price" style={{ color: idx === 0 ? '#fff' : (idx === 1 ? getStatusColor(insight.nextLikelyTrend) : '#ffd740') }}>₹{t.toFixed(2)}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {insight.moveDescription && (
                        <div className="move-desc" style={{ fontStyle: 'italic', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px', fontSize: '12px' }}>
                            <i className="fa fa-info-circle" style={{ marginRight: '6px' }}></i> {insight.moveDescription}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default IntradayInsightWidget;
