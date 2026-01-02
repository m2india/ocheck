const axios = require('axios');

async function testQuote() {
    const url = 'https://api.dhan.co/v2/marketfeed/quote';
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'access-token': 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpc3MiOiJkaGFuIiwicGFydG5lcklkIjoiIiwiZXhwIjoxNzY3MDgxODI0LCJpYXQiOjE3NjY5OTU0MjQsInRva2VuQ29uc3VtZXJUeXBlIjoiU0VMRiIsIndlYmhvb2tVcmwiOiIiLCJkaGFuQ2xpZW50SWQiOiIxMTA3ODc5MjEyIn0.D2EBEotTW3e8PtsCaDDDBEKxjGcOyvZhTZr0rUwfERqLKp22T2BNHEvJef-3jNFTtJOQKkjsuPgPcEnY-Zt5jw',
        'client-id': '1107879212'
    };

    const body = {
        "MCX_COMM": [463007, 465849]
    };

    try {
        console.log('Fetching Quote Data...');
        const response = await axios.post(url, body, { headers });
        console.log('Response Status:', response.status);
        console.log('Response Data:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error fetching quote:', error.message);
        if (error.response) {
            console.error('API Error Response:', error.response.status, error.response.data);
        }
    }
}

testQuote();
