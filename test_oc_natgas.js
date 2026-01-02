const axios = require('axios');

async function testOC() {
    try {
        const response = await axios.post('http://localhost:3001/option-chain', {
            UnderlyingScrip: 465849,
            UnderlyingSeg: 'MCX_COMM',
            Expiry: '2026-01-22'
        });
        console.log('Underlying ID:', response.data.data?.underlying_id);
        console.log('Underlying Price:', response.data.underlyingPrice);
        console.log('Sample Strike:', Object.keys(response.data.data?.oc || {})[0]);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testOC();
