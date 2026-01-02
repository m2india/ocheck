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
        "MCX_COMM": [465849]
    };

    try {
        const response = await axios.post(url, body, { headers });
        const item = response.data.data["MCX_COMM"]["465849"];
        console.log('NG Jan 2026 Quote:', {
            last_price: item.last_price,
            ohlc: item.ohlc
        });
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testQuote();
