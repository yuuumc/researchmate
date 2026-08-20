import fs from 'fs';
const file = 'api/chat.js';
let c = fs.readFileSync(file, 'utf-8');
// Replace any ALLOWED_MODELS line with only the iFlytek model
c = c.replace(
  /const ALLOWED_MODELS = \[.*?\]/,
  "const ALLOWED_MODELS = ['xopdeepseekv4flash0731']"
);
fs.writeFileSync(file, c, 'utf-8');
// Verify
const lines = c.split(/\r?\n/);
lines.forEach((l, i) => { if (l.includes('ALLOWED_MODELS')) console.log(`L${i+1}: ${l}`); });
