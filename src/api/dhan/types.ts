export interface OptionChainResponse {
    underlying: string;
    expiryDate: string;
    strikePrices: number[];
    options: Option[];
}

export interface Option {
    strikePrice: number;
    call: OptionDetail;
    put: OptionDetail;
}

export interface OptionDetail {
    security_id: number;
    openInterest: number;
    changeinOpenInterest: number;
    changeinOpenInterestPct: number;
    lastPrice: number;
    bidPrice: number;
    askPrice: number;
    volume: number;
    impliedVolatility: number;
    // Greeks
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
    rho?: number;

    // Additional Derived/Mapped Fields
    previousPrice?: number;
    changePct?: number;
}