import { execSync } from 'child_process';
process.chdir('C:\\Users\\Administrator\\Desktop\\yanxintong');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 60000 }).trim();
  } catch (e) {
    return `ERR: ${e.stderr ? e.stderr.split('\n')[0] : e.message.split('\n')[0]}`;
  }
}

// Update LLM_API_KEY to new iFlytek key (it takes priority over DEEPSEEK_API_KEY)
console.log('=== Updating LLM_API_KEY ===');
run('vercel env rm LLM_API_KEY production -y');
console.log(run('echo "01d5892c3fef79a393a27f086d7b4155:NmZlZGNlNjQ0NDRlYmYzOTdhM2E5YWNi" | vercel env add LLM_API_KEY production'));

// Verify
console.log('\n=== Final env vars ===');
console.log(run('vercel env ls'));
