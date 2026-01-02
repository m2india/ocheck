export const MARKET_TIMINGS = {
    EQUITY: { start: '09:15:00', end: '15:30:00' }, // Nifty, Sensex, NSE Stocks
    MCX: { start: '09:00:00', end: '23:55:00' }      // Natural Gas, Crude Oil, etc.
};

export const isMarketOpen = (segment: string): boolean => {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) return false; // Saturday, Sunday closed

    const currentTime = now.getHours() * 60 + now.getMinutes();

    let startStr = MARKET_TIMINGS.EQUITY.start;
    let endStr = MARKET_TIMINGS.EQUITY.end;

    if (segment === 'MCX_COMM' || segment === 'MCX') {
        startStr = MARKET_TIMINGS.MCX.start;
        endStr = MARKET_TIMINGS.MCX.end;
    }

    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);

    const startTime = startH * 60 + startM;
    const endTime = endH * 60 + endM;

    return currentTime >= startTime && currentTime <= endTime;
};

export const getMarketTimes = (segment: string) => {
    if (segment === 'MCX_COMM' || segment === 'MCX') {
        return MARKET_TIMINGS.MCX;
    }
    return MARKET_TIMINGS.EQUITY;
};
