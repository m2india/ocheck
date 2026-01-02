const https = require('https');

https.get('https://api.dhan.co', (res) => {
    console.log('Status:', res.statusCode);
    res.on('data', (d) => {
        // console.log(d.toString());
    });
}).on('error', (e) => {
    console.error('Error:', e.message);
});
