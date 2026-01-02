const fs = require('fs');
const content = fs.readFileSync('client/src/utils/CandleDirectionStrategy.ts', 'utf8');
const lines = content.split('\n');
for (let i = 227; i < 232; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
    // Print hex of the line
    console.log(Buffer.from(lines[i]).toString('hex'));
}
