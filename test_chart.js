const fetch = require('node-fetch');
const dotenv = require('dotenv');
dotenv.config();

const ACCESS_TOKEN = process.env.ACCESS_TOKEN || process.env.API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;

const testChart = async () => {
    const url = 'https://api.dhan.co/v2/charts/intraday';
    const payload = {
        securityId: "13",
        exchangeSegment: "NSE_IDX",
        instrument: "INDEX",
        interval: "1",
        oi: false,
        fromDate: "2025-12-26 09:15:00",
        toDate: "2025-12-26 13:50:00"
    };

    console.log("Testing Dhan Chart API with NIFTY...");
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'access-token': ACCESS_TOKEN,
            'client-id': CLIENT_ID,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log("Status:", response.status);
    console.log("Result:", JSON.stringify(result, null, 2));
};

testChart();
