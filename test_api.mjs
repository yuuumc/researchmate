import handler from './api/chat.js';

const mockReq = {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  socket: { remoteAddress: '127.0.0.1' },
  body: { prompt: 'You are a study assistant', userInput: 'What is MOS threshold voltage?', options: { max_tokens: 80, stream: false } }
};
const mockRes = {
  statusCode: 200,
  headersSent: false,
  _headers: {},
  setHeader(k, v) { this._headers[k] = v; },
  status(code) { this.statusCode = code; return this; },
  json(data) { console.log('STATUS:', this.statusCode); console.log('RESPONSE:', JSON.stringify(data).slice(0, 800)); },
  end(d) { console.log('END:', String(d).slice(0, 800)); },
  write(c) { process.stdout.write(String(c)); },
  get writableEnded() { return false; },
  get destroyed() { return false; }
};

try {
  await handler(mockReq, mockRes);
} catch (e) {
  console.error('HANDLER ERROR:', e);
}
