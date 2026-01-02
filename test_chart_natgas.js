const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const ACCESS_TOKEN = process.env.ACCESS_TOKEN || process.env.API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;

const testChart = async () => {
    const url = 'https://api.dhan.co/v2/charts/intraday';

    // Matches Frontend IntradayChart.tsx EXACTLY
    // securityId: scrip.id.toString() -> "465849"
    // interval: 1 (number)
    // oi: true (boolean)

    const payload = {
        securityId: "465849",
        exchangeSegment: "MCX_COMM",
        instrument: "FUTCOM",
        interval: 1,  // Number, not string
        oi: true,     // True, not false
        fromDate: "2025-12-26 09:00:00",
        toDate: "2025-12-26 16:20:00"
    };

    console.log("Testing Dhan Chart API - EXACT Frontend Payload Match");
    console.log("Payload:", JSON.stringify(payload, null, 2));

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'access-token': ACCESS_TOKEN,
                'client-id': CLIENT_ID,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        console.log("Status:", response.status);
        const data = response.data;
        console.log("Response Status Field:", data.status);
        if (data.data && data.data.timestamp) {
            console.log("Data Points Received:", data.data.timestamp.length);
        } else {
            console.log("No data points in response");
            console.log("Full Response:", JSON.stringify(data, null, 2));
        }

    } catch (error) {
        if (error.response) {
            console.error("API Error Status:", error.response.status);
            console.error("API Error Data:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("Error:", error.message);
        }
    }
};

testChart();
