import DhanClient from './client';
import { OptionChainResponse } from './types';
import config from '../../config';

export const fetchOptionChain = async (payload: any): Promise<OptionChainResponse> => {
    const client = new DhanClient(config.baseUrl, config.apiKey, config.clientId);
    const response = await client.getOptionChain(payload);
    return response.data;
};