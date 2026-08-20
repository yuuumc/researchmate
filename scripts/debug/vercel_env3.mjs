import { execSync } from 'child_process';
process.chdir('C:\\Users\\Administrator\\Desktop\\yanxintong');

const KEY = '01d5892c3fef79a393a27f086d7b4155:NmZlZGNlNjQ0NDRlYmYzOTdhM2E5YWNi';
const BASE = 'https://maas-api.cn-huabei-1.xf-yun.com/v2';
const MODEL = 'xopdeepseekv4flash0731';

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 60000 }).trim();
  } catch (e) {
    return `ERR: ${(e.stderr || e.message || '').split('\n').slice(0, 3).join(' | ')}`;
  }
}

// Helper: use node to write value without trailing newline
function setEnv(name, value) {
  run(`vercel env rm ${name} production -y 2>nul`);
  const nodeCmd = `node -e "process.stdout.write('${value}')"`;
  const result = run(`${nodeCmd} | vercel env add ${name} production 2>&1`);
  console.log(`${name}: ${result.includes('Added') ? 'OK' : result.slice(0, 100)}`);
}

console.log('=== Re-setting env vars without trailing CR ===');
setEnv('LLM_API_KEY', KEY);
setEnv('DEEPSEEK_API_KEY', KEY);
setEnv('LLM_BASE_URL', BASE);
setEnv('LLM_MODEL', MODEL);

console.log('\n=== Verifying ===');
console.log(run('vercel env ls 2>&1'));
