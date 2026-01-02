import React, { useMemo } from 'react';
import { analyzeQuoteData } from './utils/quoteAnalysis';
import './QuoteAnalysisWidget.css';

interface Props {
    quote: any;
    scripName: string;
    scrip?: any;
}

const QuoteAnalysisWidget: React.FC<Props> = ({ quote, scripName }) => {
    const analysis = useMemo(() => {
        try {
            return analyzeQuoteData(quote);
        } catch (e) {
            console.error("Analysis calculation failed:", e);
            return null;
        }
    }, [quote]);

    const getSentimentColor = (sentiment: string) => {
        if (!sentiment) return '#ffa726';
        if (sentiment.includes('BULLISH')) return '#26a69a';
        if (sentiment.includes('BEARISH')) return '#ef5350';
        return '#ffa726';
    };

    if (!quote) {
        return (
            <div className="quote-analysis-card card loading-state">
                <div className="analysis-header">
                    <div className="title-group">
                        <h3 className="analysis-title">Market Insight Analysis</h3>
                        <div className="live-badge skeleton">
                            <span className="live-dot"></span>
                            WAITING FOR DATA
                        </div>
                    </div>
                </div>
                <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                    Fetching deep market insights for {scripName}...
                </div>
            </div>
        );
    }

    if (!analysis) return null;

    return (
        <div className="quote-analysis-card card">
            <div className="analysis-header">
                <div className="title-group">
                    <h3 className="analysis-title">Market Insight Analysis</h3>
                    <div className="live-badge">
                        <span className="live-dot"></span>
                        LIVE
                    </div>
                </div>
                <div className="scrip-badge">{scripName}</div>
            </div>

            <div className="bias-badge" style={{ backgroundColor: getSentimentColor(analysis.bias.sentiment) }}>
                {analysis.bias.sentiment.replace('_', ' ')}
            </div>

            <div className="analysis-grid">
                {/* Bias Section */}
                <div className="analysis-item bias-item">
                    <div className="item-header">
                        <i className="fa fa-compass"></i>
                        <span>Intraday Bias</span>
                    </div>
                    <div className="item-content">
                        <div className="score-meter">
                            <div className="meter-bg">
                                <div
                                    className="meter-fill"
                                    style={{
                                        width: `${analysis.bias.score}%`,
                                        backgroundColor: getSentimentColor(analysis.bias.sentiment)
                                    }}
                                ></div>
                            </div>
                            <span className="score-val">{analysis.bias.score}%</span>
                        </div>
                        <p className="interpretation">{analysis.bias.interpretation}</p>
                    </div>
                </div>

                {/* Depth Section */}
                <div className="analysis-item depth-item">
                    <div className="item-header">
                        <i className="fa fa-layer-group"></i>
                        <span>Order Book Depth</span>
                    </div>
                    <div className="item-content">
                        {analysis.depth.supportZone.price > 0 ? (
                            <div className="zones">
                                <div className="zone support">
                                    <span className="label">Support</span>
                                    <span className="val">₹{analysis.depth.supportZone.price}</span>
                                    <span className="qty">({analysis.depth.supportZone.quantity} qty)</span>
                                </div>
                                <div className="zone resistance">
                                    <span className="label">Resistance</span>
                                    <span className="val">₹{analysis.depth.resistanceZone.price}</span>
                                    <span className="qty">({analysis.depth.resistanceZone.quantity} qty)</span>
                                </div>
                            </div>
                        ) : (
                            <div className="no-depth-msg">
                                <i className="fa fa-info-circle"></i>
                                <span>Support/Resistance unavailable for Spot Index</span>
                            </div>
                        )}

                        <div className="strength-bar">
                            <div className="bar-labels">
                                <span>Buyers {analysis.depth.buyerStrength}%</span>
                                <span>Sellers {100 - analysis.depth.buyerStrength}%</span>
                            </div>
                            <div className="bar-container">
                                <div className="bar-buy" style={{ width: `${analysis.depth.buyerStrength}%` }}></div>
                                <div className="bar-sell" style={{ width: `${100 - analysis.depth.buyerStrength}%` }}></div>
                            </div>
                        </div>
                        <p className="conclusion">{analysis.depth.conclusion}</p>
                    </div>
                </div>

            </div>
        </div >
    );
};

export default QuoteAnalysisWidget;
