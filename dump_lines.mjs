import fs from 'fs';
const lines = fs.readFileSync('api/chat.js', 'utf-8').split(/\r?\n/);
for (let i = 23; i < 35; i++) {
  console.log(`L${i+1}>>>${JSON.stringify(lines[i])}`);
}
