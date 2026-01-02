const dotenv = require('dotenv');
dotenv.config();

const apiKey = process.env.ACCESS_TOKEN || process.env.API_KEY;
const clientId = process.env.CLIENT_ID;
const baseUrl = process.env.BASE_URL || 'https://api.dhan.co';

async function testRest() {
    const url = `${baseUrl}/v2/optionchain`;
    const headers = {
        'access-token': apiKey,
        'client-id': clientId,
        'Content-Type': 'application/json'
    };

    // NIFTY 50 (Scrip 13) or similar
    const body = {
        UnderlyingScrip: 13,
        UnderlyingSeg: 'IDX_I',
        Expiry: '2025-12-31' // Just a guess for test
    };

    console.log('Testing REST API:', url);
    console.log('Headers:', { ...headers, 'access-token': 'REDACTED' });

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        console.log('Status:', response.status);
        const data = await response.text();
        console.log('Response:', data.slice(0, 200));
    } catch (err) {
        console.error('REST ERROR:', err.message);
    }
}

testRest();
