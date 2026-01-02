
const axios = require('axios');
require('dotenv').config();

const accessToken = process.env.ACCESS_TOKEN;
const clientId = process.env.CLIENT_ID;

async function getNaturalGasData() {
    try {
        // Search for Natural Gas security ID
        const searchResponse = await axios.post('https://api.dhan.co/v2/marketfeed/quote', {
            instruments: [
                { exchangeSegment: 'MCX_COMM', securityId: '465849' }
            ]
        }, {
            headers: {
                'access-token': accessToken,
                'client-id': clientId,
                'Content-Type': 'application/json'
            }
        });

        console.log('NG Data:', JSON.stringify(searchResponse.data, null, 2));

        // Get Intraday Chart for the last few candles
        const chartResponse = await axios.post('https://api.dhan.co/v2/charts/intraday', {
            securityId: '465849',
            exchangeSegment: 'MCX_COMM',
            instrument: 'FUTCOM',
            interval: '5',
            oi: true,
            fromDate: '2025-12-30 09:00:00',
            toDate: '2025-12-30 23:30:00'
        }, {
            headers: {
                'access-token': accessToken,
                'client-id': clientId,
                'Content-Type': 'application/json'
            }
        });

        if (chartResponse.data && chartResponse.data.data && chartResponse.data.data.timestamp) {
            const ts = chartResponse.data.data.timestamp;
            const open = chartResponse.data.data.open;
            const high = chartResponse.data.data.high;
            const low = chartResponse.data.data.low;
            const close = chartResponse.data.data.close;
            const volume = chartResponse.data.data.volume;

            console.log('Chart Data Length:', ts.length);
            const lastIndex = ts.length - 1;
            const lastCandle = {
                time: new Date(ts[lastIndex] * 1000).toLocaleString(),
                open: open[lastIndex],
                high: high[lastIndex],
                low: low[lastIndex],
                close: close[lastIndex],
                volume: volume[lastIndex]
            };
            console.log('Last Candle:', lastCandle);

            const prevIndex = lastIndex - 1;
            const prevCandle = {
                time: new Date(ts[prevIndex] * 1000).toLocaleString(),
                open: open[prevIndex],
                high: high[prevIndex],
                low: low[prevIndex],
                close: close[prevIndex],
                volume: volume[prevIndex]
            };
            console.log('Previous Candle:', prevCandle);
        } else {
            console.log('No chart data found:', JSON.stringify(chartResponse.data, null, 2));
        }

    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
    }
}

getNaturalGasData();
