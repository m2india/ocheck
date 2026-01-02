import axios from 'axios';
import { BASE_URL } from './config';

export type OptionChainPayload = {
  UnderlyingScrip: number;
  UnderlyingSeg: string;
  Expiry: string;
};

export async function fetchOptionChainApi(
  payload: OptionChainPayload,
  baseUrl = BASE_URL
) {
  const url = `${baseUrl}/option-chain`;
  const response = await axios.post(url, payload);
  return response.data;
}

