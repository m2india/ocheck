import { OptionChainResponse, OptionDetail } from '../api/dhan/types';
import config from '../config';

type OptionChainTableRow = {
    strikePrice: number;
    call: OptionDetail;
    put: OptionDetail;
};

type OptionChainTable = {
    underlying: string;
    underlyingPrice: number;
    underlyingChange: number;
    underlyingChangePct: number;
    underlyingPrevClose: number;
    expiryDate: string;
    rows: OptionChainTableRow[];
    tableHtml: string;
    data: any;
    oc?: any; // Explicitly allowed optional OC
};

export class DhanService {
    private dhanClient: any; // Replace 'any' with the actual type of DhanClient once imported
    private prefetchPayload?: any;
    private requestCache: Map<string, { data: OptionChainResponse; expiry: number }> = new Map();

    constructor(dhanClient: any, prefetchPayload?: any) {
        this.dhanClient = dhanClient;
        this.prefetchPayload = prefetchPayload || config.defaultOptionChainPayload;
    }

    async getOptionChain(payload?: any): Promise<OptionChainResponse> { // Replace 'any' with the actual return type
        const effectivePayload =
            payload && Object.keys(payload).length > 0
                ? payload
                : this.prefetchPayload || undefined;

        if (!effectivePayload) {
            throw new Error('No payload provided and no DEFAULT_OPTIONCHAIN_PAYLOAD configured');
        }

        const cacheKey = JSON.stringify(effectivePayload);
        const now = Date.now();
        const cached = this.requestCache.get(cacheKey);

        if (cached && cached.expiry > now) {
            console.log("Serving from backend cache (respecting Dhan rate limits)");
            return cached.data;
        }

        try {
            const optionChainData = await this.dhanClient.getOptionChain(effectivePayload);

            // Cache for 3 seconds to overlap with React multiple triggers
            this.requestCache.set(cacheKey, {
                data: optionChainData,
                expiry: now + 3000
            });

            return optionChainData;
        } catch (error) {
            throw new Error(`Failed to fetch option chain: ${(error as any).message}`);
        }
    }

    async getOptionChainTable(payload?: any): Promise<OptionChainTable> {
        const optionChain = await this.getOptionChain(payload);

        const data = (optionChain as any)?.data || optionChain;
        const oc = data?.oc || data?.options;

        const normalizeOption = (opt: any): OptionDetail => ({
            security_id: opt?.security_id ?? opt?.SecurityId ?? opt?.sem ?? 0,
            openInterest: opt?.oi ?? opt?.openInterest ?? 0,
            changeinOpenInterest: opt?.changeinOpenInterest ?? ((opt?.oi || 0) - (opt?.previous_oi || opt?.oi || 0)),
            changeinOpenInterestPct: opt?.changeinOpenInterestPct ?? (((opt?.oi || 0) - (opt?.previous_oi || opt?.oi || 0)) / (opt?.previous_oi || opt?.oi || 1)) * 100,
            lastPrice: opt?.last_price ?? opt?.lastPrice ?? 0,
            previousPrice: opt?.previous_close ?? opt?.prev_close ?? opt?.close_price ?? ((opt?.last_price || 0) - (opt?.price_change || opt?.change || 0)),
            bidPrice: opt?.top_bid_price ?? opt?.bidPrice ?? 0,
            askPrice: opt?.top_ask_price ?? opt?.askPrice ?? 0,
            volume: opt?.volume ?? 0,
            impliedVolatility: opt?.implied_volatility ?? opt?.impliedVolatility ?? 0,
            // Greeks
            delta: opt?.greeks?.delta,
            gamma: opt?.greeks?.gamma,
            theta: opt?.greeks?.theta,
            vega: opt?.greeks?.vega,
            rho: opt?.greeks?.rho,
        });

        let rows: OptionChainTableRow[] = [];

        if (Array.isArray(oc)) {
            rows = oc.map((option: any) => ({
                strikePrice: option?.strikePrice ?? option?.strike_price ?? '-',
                call: normalizeOption(option?.call ?? option?.ce ?? {}),
                put: normalizeOption(option?.put ?? option?.pe ?? {}),
            }));
        } else if (oc && typeof oc === 'object') {
            rows = Object.keys(oc).map((strike) => {
                const strikeData = oc[strike];
                // Inject security_id if not present for frontend live updates
                if (strikeData.pe && !strikeData.pe.security_id) (strikeData.pe as any).security_id = (strikeData.pe as any).security_id || (strikeData.pe as any).SecurityId || (strikeData.pe as any).sem || 0;
                if (strikeData.ce && !strikeData.ce.security_id) (strikeData.ce as any).security_id = (strikeData.ce as any).security_id || (strikeData.ce as any).SecurityId || (strikeData.ce as any).sem || 0;

                return {
                    strikePrice: parseFloat(strike),
                    call: normalizeOption(strikeData?.ce || strikeData?.call || {}),
                    put: normalizeOption(strikeData?.pe || strikeData?.put || {}),
                };
            });
            rows.sort((a, b) => a.strikePrice - b.strikePrice);
        }

        const tableHtml = this.buildHtmlTable(optionChain, rows);

        const underlyingPrice = (data as any)?.last_price || (data as any)?.underlyingPrice || (data as any)?.underlyingValue || 0;
        const underlyingPrevClose = (data as any)?.previous_close_price ||
            (data as any)?.prev_close ||
            (data as any)?.close_price ||
            (underlyingPrice - ((data as any)?.price_change ?? (data as any)?.change ?? (data as any)?.underlyingChange ?? 0));

        const underlyingChange = underlyingPrice - underlyingPrevClose;
        const underlyingChangePct = underlyingPrevClose !== 0 ? (underlyingChange / underlyingPrevClose) * 100 : 0;

        // Harden ID detection: Prefer payload ID if response ID is generic or missing
        const underlyingId = (data as any)?.underlying_id || (data as any)?.underlying_scrip_id || (data as any)?.underlying_security_id || payload?.UnderlyingScrip || '';

        return {
            underlying: (optionChain as any)?.underlying ?? underlyingId.toString() ?? '',
            underlyingPrice,
            underlyingChange,
            underlyingChangePct,
            underlyingPrevClose,
            expiryDate: (optionChain as any)?.expiryDate || (data as any)?.expiry_date || payload?.Expiry || '',
            rows,
            tableHtml,
            oc: oc, // Explicitly return the normalized 'oc' object for frontend use
            data: {
                ...data,
                oc: oc, // Ensure it's in data as well
                underlying_id: (data as any)?.underlying_id || (data as any)?.underlying_scrip_id || (data as any)?.underlying_security_id
            },
        };
    }

    async getIntradayChart(payload: object): Promise<any> {
        try {
            return await this.dhanClient.getIntradayData(payload);
        } catch (error) {
            throw new Error(`Failed to fetch intraday chart: ${(error as any).message}`);
        }
    }

    async getHistoricalChart(payload: object): Promise<any> {
        try {
            return await this.dhanClient.getHistoricalData(payload);
        } catch (error) {
            throw new Error(`Failed to fetch historical chart: ${(error as any).message}`);
        }
    }

    async getQuote(payload: object): Promise<any> {
        try {
            return await this.dhanClient.getQuote(payload);
        } catch (error) {
            throw new Error(`Failed to fetch quote: ${(error as any).message}`);
        }
    }

    async getLtp(payload: object): Promise<any> {
        try {
            return await this.dhanClient.getLtp(payload);
        } catch (error) {
            throw new Error(`Failed to fetch ltp: ${(error as any).message}`);
        }
    }

    private buildHtmlTable(optionChain: OptionChainResponse, rows: OptionChainTableRow[]): string {
        const header = `
            <table border="1" cellspacing="0" cellpadding="6">
              <caption>Option Chain ${(optionChain as any)?.underlying ?? ''} · Exp ${(optionChain as any)?.expiryDate ?? ''}</caption>
              <thead>
                <tr>
                  <th>Strike</th>
                  <th>CE Last</th>
                  <th>CE OI</th>
                  <th>CE Chg OI</th>
                  <th>CE Bid</th>
                  <th>CE Ask</th>
                  <th>CE Vol</th>
                  <th>CE IV</th>
                  <th>PE Last</th>
                  <th>PE OI</th>
                  <th>PE Chg OI</th>
                  <th>PE Bid</th>
                  <th>PE Ask</th>
                  <th>PE Vol</th>
                  <th>PE IV</th>
                </tr>
              </thead>
              <tbody>
        `;

        const body = rows
            .map((row) => {
                const cells = [
                    row.strikePrice,
                    row.call.lastPrice,
                    row.call.openInterest,
                    row.call.changeinOpenInterest,
                    row.call.bidPrice,
                    row.call.askPrice,
                    row.call.volume,
                    row.call.impliedVolatility,
                    row.put.lastPrice,
                    row.put.openInterest,
                    row.put.changeinOpenInterest,
                    row.put.bidPrice,
                    row.put.askPrice,
                    row.put.volume,
                    row.put.impliedVolatility,
                ];

                return `<tr>${cells.map((cell) => `<td>${cell ?? '-'}</td>`).join('')}</tr>`;
            })
            .join('');

        const footer = `
              </tbody>
            </table>
        `;

        return `${header}${body}${footer}`;
    }
}