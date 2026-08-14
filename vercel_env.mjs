import { execSync } from 'child_process';
import fs from 'fs';

const PROJ = 'C:\\Users\\Administrator\\Desktop\\yanxintong';
process.chdir(PROJ);

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 120000, ...opts }).trim();
  } catch (e) {
    return `ERR: ${e.message.split('\n')[0]}`;
  }
}

// 1. List current env vars
console.log('=== Current Vercel env vars ===');
console.log(run('vercel env ls'));

// 2. Remove old DEEPSEEK_API_KEY (if exists) and add new one
console.log('\n=== Updating DEEPSEEK_API_KEY ===');
run('vercel env rm DEEPSEEK_API_KEY production -y');
console.log(run('echo "01d5892c3fef79a393a27f086d7b4155:NmZlZGNlNjQ0NDRlYmYzOTdhM2E5YWNi" | vercel env add DEEPSEEK_API_KEY production'));

// 3. Add LLM_BASE_URL
console.log('\n=== Adding LLM_BASE_URL ===');
run('vercel env rm LLM_BASE_URL production -y');
console.log(run('echo "https://maas-api.cn-huabei-1.xf-yun.com/v2" | vercel env add LLM_BASE_URL production'));

// 4. Add LLM_MODEL
console.log('\n=== Adding LLM_MODEL ===');
run('vercel env rm LLM_MODEL production -y');
console.log(run('echo "xopdeepseekv4flash0731" | vercel env add LLM_MODEL production'));

// 5. Verify
console.log('\n=== Updated env vars ===');
console.log(run('vercel env ls'));

console.log('\n=== DONE: env vars updated ===');
