import axios from 'axios';

const BASE_URL = process.env.DHAN_API_BASE_URL;

export const httpGet = async (url: string, headers: Record<string, string> = {}) => {
    try {
        const response = await axios.get(`${BASE_URL}${url}`, { headers });
        return response.data;
    } catch (error) {
        throw new Error(`GET request failed: ${(error as any).message}`);
    }
};

export const httpPost = async (url: string, data: any, headers: Record<string, string> = {}) => {
    try {
        const response = await axios.post(`${BASE_URL}${url}`, data, { headers });
        return response.data;
    } catch (error) {
        throw new Error(`POST request failed: ${(error as any).message}`);
    }
};