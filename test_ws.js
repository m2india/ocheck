const WebSocket = require('ws');
const dotenv = require('dotenv');
dotenv.config();

const apiKey = process.env.ACCESS_TOKEN || process.env.API_KEY;
const clientId = process.env.CLIENT_ID;

const url = `wss://api-feed.dhan.co?version=2&token=${apiKey}&clientId=${clientId}&authType=2`;

console.log('Testing connection to:', url.replace(apiKey, 'REDACTED'));

const ws = new WebSocket(url);

ws.on('open', () => {
    console.log('CONNECTED successfully');
    ws.close();
});

ws.on('error', (err) => {
    console.error('ERROR:', err.message);
    if (err.response) {
        console.error('Response Status:', err.response.status);
    }
});

ws.on('unexpected-response', (req, res) => {
    console.error('UNEXPECTED RESPONSE:', res.statusCode, res.statusMessage);
    res.on('data', (chunk) => console.log('Body:', chunk.toString()));
});

ws.on('close', (code, reason) => {
    console.log('CLOSED:', code, reason);
});
