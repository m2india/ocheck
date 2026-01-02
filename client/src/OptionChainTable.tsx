import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import './OptionChainTable.css';

interface OptionDetail {
    openInterest?: number;
    changeinOpenInterest?: number;
    changeinOpenInterestPct?: number;
    lastPrice?: number;
    lastPricePct?: number;
    bidPrice?: number;
    askPrice?: number;
    volume?: number;
    impliedVolatility?: number;
    // Greeks
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
    rho?: number;
    changePct?: number;
    previousPrice?: number;
}

interface Option {
    strikePrice: number;
    call: OptionDetail;
    put: OptionDetail;
}

interface Props {
    data: any;
    isOffline?: boolean;
    scripName?: string;
    selectedStrikes: { strike: number, side: 'CE' | 'PE', entryPrice?: number }[];
    onSelectionChange: (strikes: { strike: number, side: 'CE' | 'PE', entryPrice?: number }[]) => void;
    strategy?: any;
    onRefresh?: () => void;
    liveData?: Record<string, any>;
}

const formatNumber = (value: number | undefined | null, fraction = 2) => {
    if (value === undefined || value === null || Number.isNaN(Number(value))) return '-';
    return Number(value).toLocaleString('en-IN', {
        minimumFractionDigits: fraction,
        maximumFractionDigits: fraction,
    });
};

const formatPct = (value: number | undefined | null, fraction = 2) => {
    if (value === undefined || value === null || Number.isNaN(Number(value))) return '';
    const num = Number(value);
    const sign = num > 0 ? '+' : '';
    return `${sign}${num.toFixed(fraction)}%`;
};



const getChangeClass = (value: number | undefined | null) => {
    if (value === undefined || value === null || Number.isNaN(Number(value))) return '';
    if (Number(value) < 0) return 'text-red';
    if (Number(value) > 0) return 'text-green';
    return '';
};

// Helper Component for Flashing Price Box (Restored)
const FlashPriceBox = ({ price, changePct, formatNum, formatPct, className = "" }: { price: number | undefined, changePct: number | undefined, formatNum: (v: number | undefined) => string, formatPct: (v: number | undefined) => string, className?: string }) => {
    const prevPriceRef = useRef<number | undefined>(price);
    const [flashClass, setFlashClass] = useState('');

    useEffect(() => {
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

const OptionChainTable: React.FC<Props> = ({ data, isOffline, scripName = 'NIFTY', selectedStrikes, onSelectionChange, strategy, liveData }) => {
    const [showGreeks, setShowGreeks] = useState(true);
    const [autoCenterATM, setAutoCenterATM] = useState(true);
    const [hoveredStrike, setHoveredStrike] = useState<number | null>(null);
    const atmRef = useRef<HTMLTableRowElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastScrolledScrip = useRef<string | null>(null);
    const lastScrolledStrike = useRef<number | null>(null);

    // Helper to toggle selection
    const toggleSelection = useCallback((strike: number, side: 'CE' | 'PE', ltp: number | undefined) => {
        const exists = selectedStrikes.find(s => s.strike === strike && s.side === side);
        if (exists) {
            console.log(`Deselected ${strike} ${side}`);
            onSelectionChange(selectedStrikes.filter(s => !(s.strike === strike && s.side === side)));
        } else {
            console.log(`Selected ${strike} ${side} @ ₹${ltp}`);
            onSelectionChange([...selectedStrikes, { strike, side, entryPrice: ltp }]);
        }
    }, [selectedStrikes, onSelectionChange]);

    const safeData: any = data || {};

    const rawOptions = useMemo((): Option[] => {
        if (!safeData) return [];
        if (safeData?.oc || safeData?.data?.oc) {
            const oc = safeData.oc || safeData.data.oc;
            let strikesList: any[] = [];
            if (Array.isArray(oc)) {
                strikesList = oc.map(strikeData => {
                    const strikePrice = parseFloat(strikeData.strike_price || strikeData.strikePrice || strikeData.StrikePrice || 0);
                    return { strikeKey: strikePrice.toString(), strikeData, strikePrice };
                });
            } else {
                strikesList = Object.keys(oc).map(strikeKey => {
                    const strikeData = oc[strikeKey];
                    const strikePrice = parseFloat(strikeKey);
                    return { strikeKey, strikeData, strikePrice };
                });
            }

            return strikesList.map(({ strikeData, strikePrice }) => {
                if (!strikePrice) return null;
                const ce = strikeData.ce || {};
                const pe = strikeData.pe || {};

                // LIVE DATA OVERRIDE
                let ceLtp = ce.lastPrice ?? ce.last_price;
                let ceChg = ce.changePct;
                let peLtp = pe.lastPrice ?? pe.last_price;
                let peChg = pe.changePct;

                const isAnomalous = (val: number | undefined) => {
                    if (scripName !== 'NATURALGAS') return false;
                    if (!val) return false;
                    // Hard Block 392.20 to match App.tsx strictly
                    if (Math.abs(val - 392.2) < 1.0) {
                        return true;
                    }
                    const spot = safeData?.underlyingPrice || 0;
                    // General extreme deviation check
                    if (spot > 0 && Math.abs(val - spot) / spot > 0.2) {
                        return true;
                    }
                    return false;
                };

                if (liveData) {
                    if (ce.security_id && liveData[ce.security_id] && liveData[ce.security_id].ltp) {
                        const liveLtp = liveData[ce.security_id].ltp;
                        if (!isAnomalous(liveLtp)) {
                            ceLtp = liveLtp || ceLtp;
                        }
                    }
                    if (pe.security_id && liveData[pe.security_id] && liveData[pe.security_id].ltp) {
                        const liveLtp = liveData[pe.security_id].ltp;
                        if (!isAnomalous(liveLtp)) {
                            peLtp = liveLtp || peLtp;
                        }
                    }
                }

                return {
                    strikePrice,
                    call: {
                        ...ce,
                        ...ce.greeks,
                        lastPrice: ceLtp,
                        changePct: ceChg, // Ideally calculate this dynamically: (ltp - close) / close
                        openInterest: ce.oi ?? ce.openInterest,
                        volume: ce.volume,
                        impliedVolatility: ce.implied_volatility ?? ce.impliedVolatility,
                    },
                    put: {
                        ...pe,
                        ...pe.greeks,
                        lastPrice: peLtp,
                        changePct: peChg,
                        openInterest: pe.oi ?? pe.openInterest,
                        volume: pe.volume,
                        impliedVolatility: pe.implied_volatility ?? pe.impliedVolatility,
                    }
                };
            }).filter(item => item !== null).sort((a: any, b: any) => a.strikePrice - b.strikePrice) as Option[];
        }
        return [];
    }, [safeData, liveData]);

    const [anchorPrice, setAnchorPrice] = useState<number | null>(null);

    // Reset anchor when scrip changes
    useEffect(() => {
        setAnchorPrice(null);
    }, [scripName]);

    // Initialize anchor price once underlying price is available and anchor is null
    useEffect(() => {
        const underlyingPrice = safeData?.underlyingPrice || safeData?.data?.last_price || safeData?.underlyingValue || 0;
        if (underlyingPrice > 0 && anchorPrice === null) {
            setAnchorPrice(underlyingPrice);
        }
    }, [safeData, anchorPrice]);

    // Reset scroll tracking when scrip changes so we can re-center
    useEffect(() => {
        lastScrolledScrip.current = null;
        lastScrolledStrike.current = null;
    }, [scripName]);

    const underlyingPrice = safeData?.underlyingPrice || safeData?.data?.last_price || safeData?.underlyingValue || 0;
    const underlyingChange = safeData?.underlyingChange || 0;
    const underlyingChangePct = safeData?.underlyingChangePct || 0;

    const displayedOptions = useMemo(() => {
        // User requested NO static values/limits. Showing full chain from API.
        return rawOptions;
    }, [rawOptions]);

    const atmStrike = useMemo(() => {
        if (displayedOptions.length === 0) return null;
        return displayedOptions.reduce((prev, curr) => {
            return Math.abs(curr.strikePrice - underlyingPrice) < Math.abs(prev.strikePrice - underlyingPrice) ? curr : prev;
        }).strikePrice;
    }, [displayedOptions, underlyingPrice]);



    const scrollToATM = useCallback(() => {
        if (atmRef.current && containerRef.current) {
            const container = containerRef.current;
            const row = atmRef.current;
            const rowOffset = row.offsetTop;
            const containerHeight = container.clientHeight;
            const rowHeight = row.offsetHeight;
            container.scrollTo({
                top: rowOffset - (containerHeight / 2) + (rowHeight / 2),
                behavior: 'smooth'
            });
            lastScrolledScrip.current = scripName;
            lastScrolledStrike.current = atmStrike;
        }
    }, [atmStrike, scripName]);

    useEffect(() => {
        const scripChanged = lastScrolledScrip.current !== scripName;
        // const strikeChanged = lastScrolledStrike.current !== atmStrike; 
        // Only scroll on scrip change to prevent jumping during live updates
        if (scripChanged) {
            // Delay slightly to allow render
            setTimeout(scrollToATM, 100);
        }
    }, [scripName, scrollToATM]);

    // No-data handling
    if (rawOptions.length === 0) {
        return (
            <div className="no-data-centered" style={{ padding: '40px' }}>
                <i className="fa fa-database" style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.5 }}></i>
                <div>No data available for this selection.</div>
            </div>
        );
    }

    return (
        <div className={`option-chain-outer ${isOffline ? 'is-offline' : ''}`}>
            <div className="table-container symmetric-view" ref={containerRef}>
                <table className="symmetric-table">
                    <thead>
                        <tr className="main-header">
                            {showGreeks && <><th className="greek-header" colSpan={1}>Rho</th><th className="greek-header" colSpan={1}>Vega</th><th className="greek-header" colSpan={1}>Gamma</th><th className="greek-header" colSpan={1}>Theta</th><th className="greek-header" colSpan={1}>Delta</th></>}
                            <th>Prob %</th>
                            <th>IV</th>
                            <th>Volume</th>
                            <th>Chng in OI</th>
                            <th>OI</th>
                            <th>LTP</th>
                            <th className="strike-header-cell">
                                <div className="symbol-info">
                                    <span className="scrip-name">{scripName}</span>
                                    {isOffline && <span className="offline-badge">OFFLINE</span>}
                                    <div className="scrip-price-box">
                                        <span className="scrip-price">
                                            {formatNumber(underlyingPrice)}
                                            {scripName === 'NATURALGAS' && <span style={{ fontSize: '10px', opacity: 0.8, marginLeft: '4px' }}>(LTP Feed)</span>}
                                        </span>
                                        <span className={`scrip-change ${getChangeClass(underlyingChange)}`}>
                                            {formatPct(underlyingChangePct)}
                                        </span>
                                    </div>
                                </div>
                            </th>
                            <th>LTP</th>
                            <th>OI</th>
                            <th>Chng in OI</th>
                            <th>Volume</th>
                            <th>IV</th>
                            <th>Prob %</th>
                            {showGreeks && <><th className="greek-header" colSpan={1}>Delta</th><th className="greek-header" colSpan={1}>Theta</th><th className="greek-header" colSpan={1}>Gamma</th><th className="greek-header" colSpan={1}>Vega</th><th className="greek-header" colSpan={1}>Rho</th></>}
                        </tr>
                    </thead>
                    <tbody>
                        {displayedOptions.map((opt, index) => {
                            const ce = opt.call || {};
                            const pe = opt.put || {};
                            const isClosest = opt.strikePrice === atmStrike;

                            return (
                                <React.Fragment key={opt.strikePrice}>
                                    <tr
                                        ref={isClosest ? atmRef : null}
                                        className={`${selectedStrikes.some(s => s.strike === opt.strikePrice) ? 'selected-row-highlight' : ''}`}
                                        onMouseEnter={() => setHoveredStrike(opt.strikePrice)}
                                        onMouseLeave={() => setHoveredStrike(null)}
                                        title={`Strike: ${opt.strikePrice}`}
                                    >
                                        {showGreeks && (
                                            <>
                                                <td className="greek-cell" onClick={() => toggleSelection(opt.strikePrice, 'CE', ce.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(ce.rho, 4)}</td>
                                                <td className="greek-cell" onClick={() => toggleSelection(opt.strikePrice, 'CE', ce.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(ce.vega, 4)}</td>
                                                <td className="greek-cell" onClick={() => toggleSelection(opt.strikePrice, 'CE', ce.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(ce.gamma, 4)}</td>
                                                <td className="greek-cell" onClick={() => toggleSelection(opt.strikePrice, 'CE', ce.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(ce.theta, 4)}</td>
                                                <td className="greek-cell" onClick={() => toggleSelection(opt.strikePrice, 'CE', ce.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(ce.delta, 4)}</td>
                                            </>
                                        )}
                                        <td className="prob-cell" onClick={() => toggleSelection(opt.strikePrice, 'CE', ce.lastPrice)} style={{ cursor: 'pointer' }}>{formatPct(ce.changePct)}</td>
                                        <td className="iv-cell" onClick={() => toggleSelection(opt.strikePrice, 'CE', ce.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(ce.impliedVolatility)}</td>
                                        <td className="vol-cell" onClick={() => toggleSelection(opt.strikePrice, 'CE', ce.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(ce.volume, 0)}</td>
                                        <td className={`oi-chg-cell ${getChangeClass(ce.changeinOpenInterest)}`} onClick={() => toggleSelection(opt.strikePrice, 'CE', ce.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(ce.changeinOpenInterest, 0)}</td>
                                        <td className="oi-cell" onClick={() => toggleSelection(opt.strikePrice, 'CE', ce.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(ce.openInterest, 0)}</td>
                                        <td
                                            className={`ltp-cell ${getChangeClass(ce.changePct)} side-selection-cell`}
                                            onClick={() => toggleSelection(opt.strikePrice, 'CE', ce.lastPrice)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <FlashPriceBox
                                                price={ce.lastPrice}
                                                changePct={ce.changePct}
                                                formatNum={formatNumber}
                                                formatPct={formatPct}
                                            />
                                            {hoveredStrike === opt.strikePrice && !isClosest && (
                                                <div className="selection-popup side-popup left-popup">
                                                    <button
                                                        className="select-btn ce-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleSelection(opt.strikePrice, 'CE', ce.lastPrice);
                                                        }}
                                                    >
                                                        BUY {opt.strikePrice} CE
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td className="strike-cell" title={`Strike Price: ${opt.strikePrice}`}>
                                            <div className="strike-wrapper">
                                                <div className="badge-container">
                                                    {/* AI Recommendation Badges (New Style) */}
                                                    {(() => {
                                                        const ceRecIndex = strategy?.bullishRecs?.findIndex((r: any) => Math.abs(r.strike - opt.strikePrice) < 0.01 && r.action === 'CALL');
                                                        const isCeRec = ceRecIndex !== undefined && ceRecIndex !== -1;

                                                        // Only show top 4
                                                        if (isCeRec && ceRecIndex < 4) {
                                                            return (
                                                                <div className="ai-rec-badge ai-ce">
                                                                    <span>{ceRecIndex + 1}</span>
                                                                    <i className="fa fa-bolt"></i>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}

                                                    {(() => {
                                                        const peRecIndex = strategy?.bearishRecs?.findIndex((r: any) => Math.abs(r.strike - opt.strikePrice) < 0.01 && r.action === 'PUT');
                                                        const isPeRec = peRecIndex !== undefined && peRecIndex !== -1;

                                                        // Only show top 4
                                                        if (isPeRec && peRecIndex < 4) {
                                                            return (
                                                                <div className="ai-rec-badge ai-pe">
                                                                    <span>{peRecIndex + 1}</span>
                                                                    <i className="fa fa-bolt"></i>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                                <span className={`strike-val`}>{opt.strikePrice}</span>

                                                {/* Selection Indicators (Static Flow) */}
                                                <div className="selection-container">
                                                    {selectedStrikes
                                                        .filter(s => s.strike === opt.strikePrice)
                                                        .sort((a, _b) => a.side === 'CE' ? -1 : 1) // Force CE (Left) then PE (Right)
                                                        .map(s => (
                                                            <div key={`${s.strike}-${s.side}`} className={`selected-indicator side-${s.side}`}>
                                                                <span>{s.side}</span>
                                                                <i className="fa fa-check-circle"></i>
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        </td>
                                        <td
                                            className={`ltp-cell ${getChangeClass(pe.changePct)} side-selection-cell`}
                                            onClick={() => toggleSelection(opt.strikePrice, 'PE', pe.lastPrice)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <FlashPriceBox
                                                price={pe.lastPrice}
                                                changePct={pe.changePct}
                                                formatNum={formatNumber}
                                                formatPct={formatPct}
                                            />
                                            {hoveredStrike === opt.strikePrice && !isClosest && (
                                                <div className="selection-popup side-popup right-popup">
                                                    <button
                                                        className="select-btn pe-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleSelection(opt.strikePrice, 'PE', pe.lastPrice);
                                                        }}
                                                    >
                                                        BUY {opt.strikePrice} PE
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td className="oi-cell" onClick={() => toggleSelection(opt.strikePrice, 'PE', pe.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(pe.openInterest, 0)}</td>
                                        <td className={`oi-chg-cell ${getChangeClass(pe.changeinOpenInterest)}`} onClick={() => toggleSelection(opt.strikePrice, 'PE', pe.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(pe.changeinOpenInterest, 0)}</td>
                                        <td className="vol-cell" onClick={() => toggleSelection(opt.strikePrice, 'PE', pe.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(pe.volume, 0)}</td>
                                        <td className="iv-cell" onClick={() => toggleSelection(opt.strikePrice, 'PE', pe.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(pe.impliedVolatility)}</td>
                                        <td className="prob-cell" onClick={() => toggleSelection(opt.strikePrice, 'PE', pe.lastPrice)} style={{ cursor: 'pointer' }}>{formatPct(pe.changePct)}</td>
                                        {showGreeks && (
                                            <>
                                                <td className="greek-cell" onClick={() => toggleSelection(opt.strikePrice, 'PE', pe.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(pe.delta, 4)}</td>
                                                <td className="greek-cell" onClick={() => toggleSelection(opt.strikePrice, 'PE', pe.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(pe.theta, 4)}</td>
                                                <td className="greek-cell" onClick={() => toggleSelection(opt.strikePrice, 'PE', pe.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(pe.gamma, 4)}</td>
                                                <td className="greek-cell" onClick={() => toggleSelection(opt.strikePrice, 'PE', pe.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(pe.vega, 4)}</td>
                                                <td className="greek-cell" onClick={() => toggleSelection(opt.strikePrice, 'PE', pe.lastPrice)} style={{ cursor: 'pointer' }}>{formatNumber(pe.rho, 4)}</td>
                                            </>
                                        )}
                                    </tr>
                                    {/* Spot Price Line Injection */}
                                    {(() => {
                                        const spotPrice = data?.underlyingPrice || 0;
                                        // Check if spot price is between this strike and the next (or effectively at this strike but logically after for ascending sort)
                                        // Standard Assumption: Strikes are ascending.
                                        // Spot line should appear AFTER this row if:
                                        // currentStrike <= spotPrice < nextStrike
                                        // OR if it's the very last row and spotPrice > currentStrike

                                        // Note: If exact match (spot == strike), we display it after the row to avoid overlaying the strike row heavily, 
                                        // or we can decide based on preference. '3.295' (Spot) vs '3.30' (Strike). 
                                        // If Spot < Strike, it should be BEFORE this row. 
                                        // But we assume the loop iterates ascending.
                                        // So we only ever render "After" the current row if appropriate.

                                        const nextOpt = displayedOptions[index + 1];
                                        const currentStrike = opt.strikePrice;
                                        const nextStrike = nextOpt ? nextOpt.strikePrice : Infinity;

                                        if (spotPrice >= currentStrike && spotPrice < nextStrike) {
                                            return (
                                                <tr className="spot-price-row" key={`spot-line-${currentStrike}`}>
                                                    <td colSpan={25} className="spot-price-cell">
                                                        <div className="spot-line-container">
                                                            <div className="spot-line-graphic"></div>
                                                            <div className="spot-pill">
                                                                {scripName || 'SPOT'} {spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        }
                                        return null;
                                    })()}
                                </React.Fragment>
                            );
                        })}


                    </tbody>
                </table>
            </div>

            <div className="controls-footer" >
                <div className="toggle-group">
                    <div style={{ display: 'none' }}>
                        <label className="toggle-label" htmlFor="auto-center-toggle">Auto-Center ATM</label>
                        <label className="toggle-switch">
                            <input
                                id="auto-center-toggle"
                                type="checkbox"
                                checked={autoCenterATM}
                                onChange={(e) => setAutoCenterATM(e.target.checked)}
                            />
                            <span className="slider"></span>
                        </label>
                    </div>
                    <button
                        className="center-btn"
                        onClick={() => {
                            setAnchorPrice(underlyingPrice);
                            scrollToATM();
                        }}
                        style={{ marginLeft: '10px', fontSize: '11px', padding: '4px 8px' }}
                        title="Jump to ATM"
                    >
                        🎯 Center
                    </button>
                    <span style={{ width: '20px' }}></span>
                    <label className="toggle-label" htmlFor="show-greeks-toggle">Show Greeks</label>
                    <label className="toggle-switch">
                        <input
                            id="show-greeks-toggle"
                            type="checkbox"
                            checked={showGreeks}
                            onChange={(e) => setShowGreeks(e.target.checked)}
                        />
                        <span className="slider"></span>
                    </label>


                </div>
            </div>
        </div>
    );
};

export default OptionChainTable;
