import React, { useRef, useState, useEffect } from 'react';
import '../OptionChainTable.css';
import '../LiveQuote.css'; // Ensure animations are available

interface FlashPriceBoxProps {
    price: number | undefined;
    changePct: number | undefined;
    formatNum: (v: number | undefined) => string;
    formatPct: (v: number | undefined) => string;
    className?: string;
}

export const FlashPriceBox: React.FC<FlashPriceBoxProps> = ({ price, changePct, formatNum, formatPct, className = "" }) => {
    const prevPriceRef = useRef<number | undefined>(price);
    const [flashClass, setFlashClass] = useState('');

    useEffect(() => {
        // Only flash if we have a valid previous price and current price, and they differ
        if (prevPriceRef.current !== undefined && price !== undefined && price !== prevPriceRef.current) {
            if (price > prevPriceRef.current) {
                setFlashClass('flash-up');
            } else if (price < prevPriceRef.current) {
                setFlashClass('flash-down');
            }

            const timer = setTimeout(() => setFlashClass(''), 300);
            return () => clearTimeout(timer);
        }
        prevPriceRef.current = price;
    }, [price]);

    return (
        <div className={`price-box ${flashClass} ${className}`}>
            <span className="price-val">{formatNum(price)}</span>
            {formatPct && <span className="price-pct" style={{ fontSize: '0.8em', marginLeft: '4px', opacity: 0.8 }}>{formatPct(changePct)}</span>}
        </div>
    );
};
