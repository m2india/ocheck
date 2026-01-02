const axios = require('axios');
const fs = require('fs');

async function debugOC() {
    try {
        console.log("Fetching Option Chain...");
        const response = await axios.post('http://localhost:3001/option-chain', {
            UnderlyingScrip: 465849,
            UnderlyingSeg: 'MCX_COMM',
            Expiry: '2026-01-22' // Ensure this matches user's likely expiry or dynamic
        });

        console.log("Status:", response.status);
        const data = response.data;

        console.log("Keys in root:", Object.keys(data));
        if (data.data) {
            console.log("Keys in data.data:", Object.keys(data.data));
            if (data.data.oc) {
                console.log("OC type:", typeof data.data.oc);
                console.log("OC keys len:", Object.keys(data.data.oc).length);
                const firstKey = Object.keys(data.data.oc)[0];
                console.log("Sample Strike Data:", JSON.stringify(data.data.oc[firstKey], null, 2));
            } else {
                console.log("data.data.oc is MISSING");
            }
        } else {
            console.log("data.data is MISSING");
        }

        console.log("Root UnderlyingPrice:", data.underlyingPrice);

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

debugOC();
