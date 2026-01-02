// DhanClient.ts

interface OptionChainPayload {
    UnderlyingScrip: number;
    UnderlyingSeg: string;
    Expiry: string; // YYYY-MM-DD
}

import axios from 'axios';

// ... (interface remains)

class DhanClient {
    private baseUrl: string;
    private accessToken: string;
    private clientId: string;

    constructor(baseUrl: string, accessToken: string, clientId: string) {
        this.baseUrl = baseUrl;
        this.accessToken = accessToken;
        this.clientId = clientId;
    }

    /**
     * Core HTTP request handler
     */
    private async request(
        endpoint: string,
        method: "GET" | "POST" = "GET",
        body?: object,
        retries = 5,
        backoff = 2000
    ): Promise<any> {
        const url = `${this.baseUrl}${endpoint}`;

        const headers = {
            "access-token": this.accessToken,
            "client-id": this.clientId,
            "Content-Type": "application/json",
            "Accept": "application/json"
        };

        if (endpoint.includes('charts')) {
            console.log("CHART REQUEST:", { url, method, payload: body });
        }

        try {
            const response = await axios({
                url,
                method,
                headers,
                data: body
            });

            const result = response.data;
            if (endpoint.includes('charts')) {
                console.log("CHART RESPONSE:", result.status || 'Success');
            }
            return result;
        } catch (error: any) {
            // Handle 429 Rate Limiting with Backoff
            if (error.response && error.response.status === 429 && retries > 0) {
                console.warn(`[API] Rate limit hit (429). Retrying in ${backoff}ms... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, backoff));
                return this.request(endpoint, method, body, retries - 1, backoff * 2);
            }

            console.error("Dhan API Detailed Error:", error.message);
            console.error("Request Context:", { url, method, payload: JSON.stringify(body || {}) });

            if (error.response) {
                console.error("Status:", error.response.status);
                console.error("Data:", JSON.stringify(error.response.data));
                throw new Error(`Dhan API Error ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /**
     * Build & validate index option chain payload
     * Enforces exact valid format
     */
    private buildIndexOptionChainPayload(expiry: string, scripId: number, segment: string = "IDX_I"): OptionChainPayload {
        if (!expiry) {
            throw new Error("Expiry is required");
        }

        const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(expiry);
        if (!isValidDate) {
            throw new Error("Expiry must be in YYYY-MM-DD format");
        }

        return {
            UnderlyingScrip: scripId,
            UnderlyingSeg: segment,
            Expiry: expiry,
        };
    }

    /**
     * Public API: Get Index Option Chain (NIFTY / BANKNIFTY / FINNIFTY / SENSEX)
     */
    public async getIndexOptionChain(expiry: string, scripId: number = 13, segment: string = "IDX_I") {
        const payload = this.buildIndexOptionChainPayload(expiry, scripId, segment);
        return this.request("/v2/optionchain", "POST", payload);
    }

    /**
     * (Optional) Raw access if needed later
     */
    public async getOptionChain(payload: OptionChainPayload) {
        return this.request("/v2/optionchain", "POST", payload);
    }

    /**
     * Public API: Get Intraday Historical Data for Charts
     */
    public async getIntradayData(payload: object) {
        return this.request("/v2/charts/intraday", "POST", payload);
    }

    /**
     * Public API: Get Historical Data for Charts
     */
    public async getHistoricalData(payload: object) {
        return this.request("/v2/charts/historical", "POST", payload);
    }

    /**
     * Public API: Get Market Feed Quote
     */
    public async getQuote(payload: object) {
        return this.request("/v2/marketfeed/quote", "POST", payload);
    }

    /**
     * Public API: Get Market Feed LTP
     */
    public async getLtp(payload: object) {
        return this.request("/v2/marketfeed/ltp", "POST", payload);
    }
}

export default DhanClient;
