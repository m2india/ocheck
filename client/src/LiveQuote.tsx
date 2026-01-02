import React, { useEffect, useState } from 'react';
import './LiveQuote.css';

interface LiveQuoteProps {
    scrip: any;
    baseUrl: string;
    data?: any;
}

const LiveQuote: React.FC<LiveQuoteProps> = ({ scrip, data }) => {
    const [prevPrice, setPrevPrice] = useState<number | null>(null);
    const [priceClassName, setPriceClassName] = useState('');

    const displayData = data || {};
    const currentPrice = displayData.last_price || displayData.lastPrice || displayData.ltp || displayData.lp || 0;

    useEffect(() => {
        if (currentPrice && prevPrice !== null && currentPrice !== prevPrice) {
            setPriceClassName(currentPrice > prevPrice ? 'price-up-flash' : 'price-down-flash');
            const timer = setTimeout(() => setPriceClassName(''), 1000);
            return () => clearTimeout(timer);
        }
        setPrevPrice(currentPrice);
    }, [currentPrice]);

    return (
        <div className="card live-quote-card" style={{
            padding: '12px 16px',
            marginBottom: '10px',
            background: 'linear-gradient(135deg, rgba(30, 37, 64, 0.9) 0%, rgba(44, 49, 96, 0.9) 100%)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            border: '1px solid rgba(255,255,255,0.1)',
            position: 'relative',
            overflow: 'hidden'
        }}>
            <div className="live-indicator-mini">
                <span className="dot"></span>
                LIVE
            </div>

            <div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', textTransform: 'uppercase' }}>Symbol</span>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>
                    {scrip.name}
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginLeft: '6px', fontWeight: 400 }}>[{scrip.segment}]</span>
                </div>
            </div>
            <div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', textTransform: 'uppercase' }}>Last Price</span>
                <div className={`price-val ${priceClassName}`} style={{ color: '#4c6fff', fontWeight: 700, fontSize: '14px' }}>
                    {currentPrice || '...'}
                </div>
            </div>
            <div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', textTransform: 'uppercase' }}>Volume</span>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: '14px' }}>
                    {displayData.volume || displayData.v || displayData.vol || '0'}
                </div>
            </div>
            <div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', textTransform: 'uppercase' }}>Open Interest</span>
                <div style={{ color: '#ffa726', fontWeight: 600, fontSize: '14px' }}>
                    {displayData.oi || displayData.open_interest || displayData.openInterest || '0'}
                </div>
            </div>
            <div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', textTransform: 'uppercase' }}>Change</span>
                <div style={{
                    color: (displayData.net_change || displayData.change || 0) >= 0 ? '#26a69a' : '#ef5350',
                    fontWeight: 600,
                    fontSize: '14px'
                }}>
                    {(displayData.net_change || displayData.change || 0) > 0 ? '+' : ''}
                    {displayData.net_change || displayData.change || 0} ({(displayData.percentage_change || displayData.pct_change || displayData.pChange || 0).toFixed(2)}%)
                </div>
            </div>
        </div>
    );
};

export default LiveQuote;
