import dotenv from 'dotenv';

dotenv.config();

const config = {
  apiKey: process.env.ACCESS_TOKEN || process.env.API_KEY || '',
  clientId: process.env.CLIENT_ID || '',
  baseUrl: process.env.BASE_URL || 'https://api.dhan.co',
  // Optional: JSON string that will be used to prefetch option chain data on server start.
  // Example: {"exchangeSegment":"NSE","securityId":"BANKNIFTY","expiryDate":"2025-12-30"}
  defaultOptionChainPayload: (() => {
    if (!process.env.DEFAULT_OPTIONCHAIN_PAYLOAD) return undefined;
    try {
      return JSON.parse(process.env.DEFAULT_OPTIONCHAIN_PAYLOAD);
    } catch (error) {
      console.warn('DEFAULT_OPTIONCHAIN_PAYLOAD is not valid JSON.');
      return undefined;
    }
  })(),
};

export default config;