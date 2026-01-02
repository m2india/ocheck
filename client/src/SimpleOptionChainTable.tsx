
import React, { useMemo, useRef, useEffect, useState } from 'react';
import './SimpleOptionChainTable.css';

interface Props {
    data: any;
    scripName?: string;
    liveData?: Record<string, any>;
    onRefresh?: () => void;
}

const formatNumber = (val: number | undefined) => {
    if (val === undefined || val === null) return '-';
    return val.toLocaleString('en-IN');
};

const formatPrice = (val: number | undefined) => {
    if (val === undefined || val === null) return '-';
    return val.toFixed(2);
};

const FlashCell = ({ value, format }: { value: number | undefined, format: (v: number | undefined) => string }) => {
    const prevValueRef = useRef<number | undefined>(undefined);
    const [flashClass, setFlashClass] = useState('');

    useEffect(() => {
        if (prevValueRef.current !== undefined && value !== undefined) {
            if (value > prevValueRef.current) {
                setFlashClass('flash-up');
            } else if (value < prevValueRef.current) {
                setFlashClass('flash-down');
            }
            // Remove class after animation
            const timer = setTimeout(() => setFlashClass(''), 1000);
            return () => clearTimeout(timer);
        }
        prevValueRef.current = value;
    }, [value]);

    return (
        <td className={`cell-ltp ${flashClass}`}>
            {format(value)}
        </td>
    );
};

const SimpleOptionChainTable: React.FC<Props> = ({ data, scripName = 'NIFTY', liveData }) => {
    const tableRef = useRef<HTMLDivElement>(null);
    const atmRowRef = useRef<HTMLTableRowElement>(null);

    const processedData = useMemo(() => {
        if (!data || (!data.oc && !data.data?.oc)) return [];

        const oc = data.oc || data.data.oc;
        const options: any[] = [];

        // Normalize data structure
        const strikes = Array.isArray(oc)
            ? oc
            : Object.keys(oc).map(k => ({ ...oc[k], strike_price: parseFloat(k) }));

        strikes.forEach((item: any) => {
            const strikePrice = parseFloat(item.strike_price || item.strikePrice || item.StrikePrice);
            const ce = item.ce || {};
            const pe = item.pe || {};

            // Merge Live Data
            const ceLtp = (liveData && ce.security_id && liveData[ce.security_id]?.ltp) || ce.lastPrice || ce.last_price;
            const peLtp = (liveData && pe.security_id && liveData[pe.security_id]?.ltp) || pe.lastPrice || pe.last_price;

            const ceOi = (liveData && ce.security_id && liveData[ce.security_id]?.oi) || ce.openInterest || ce.oi;
            const peOi = (liveData && pe.security_id && liveData[pe.security_id]?.oi) || pe.openInterest || pe.oi;

            options.push({
                strikePrice,
                ce: { ...ce, ltp: ceLtp, oi: ceOi },
                pe: { ...pe, ltp: peLtp, oi: peOi }
            });
        });

        return options.sort((a, b) => a.strikePrice - b.strikePrice);
    }, [data, liveData]);

    const atmStrike = useMemo(() => {
        if (processedData.length === 0) return null;
        const underlyingPrice = data?.underlyingPrice || 0;
        return processedData.reduce((prev, curr) => {
            return Math.abs(curr.strikePrice - underlyingPrice) < Math.abs(prev.strikePrice - underlyingPrice) ? curr : prev;
        }).strikePrice;
    }, [processedData, data]);

    // Auto-scroll to ATM on load
    useEffect(() => {
        if (atmRowRef.current && tableRef.current) {
            atmRowRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }, [atmStrike]); // Triggers when ATM changes or data loads

    return (
        <div className="simple-chain-container" ref={tableRef}>
            <div className="simple-table-header">
                <h3>Simple Option Chain ({scripName})</h3>
            </div>
            <table className="simple-table">
                <thead>
                    <tr>
                        <th>Call OI</th>
                        <th>Call LTP</th>
                        <th className="strike-head">Strike</th>
                        <th>Put LTP</th>
                        <th>Put OI</th>
                    </tr>
                </thead>
                <tbody>
                    {processedData.map((row) => {
                        const isAtm = row.strikePrice === atmStrike;
                        return (
                            <tr key={row.strikePrice} ref={isAtm ? atmRowRef : null} className={isAtm ? 'row-atm' : ''}>
                                <td className="cell-oi">{formatNumber(row.ce.oi)}</td>
                                <FlashCell value={row.ce.ltp} format={formatPrice} />
                                <td className="cell-strike">{row.strikePrice}</td>
                                <FlashCell value={row.pe.ltp} format={formatPrice} />
                                <td className="cell-oi">{formatNumber(row.pe.oi)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default SimpleOptionChainTable;
