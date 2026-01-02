import { fetchOptionChain } from '../src/api/dhan/optionChain';
import { OptionChainResponse } from '../src/api/dhan/types';

describe('Option Chain API', () => {
    it('should fetch option chain data successfully', async () => {
        const response: OptionChainResponse = await fetchOptionChain('NSE', 'RELIANCE', '2023-10-26');
        expect(response).toHaveProperty('data');
        expect(response.data).toBeInstanceOf(Array);
    });

    it('should handle errors when fetching option chain data', async () => {
        await expect(fetchOptionChain('INVALID_EXCHANGE', 'INVALID_SYMBOL', 'INVALID_DATE')).rejects.toThrow();
    });
});