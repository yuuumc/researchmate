import { execSync } from 'child_process';
process.chdir('C:\\Users\\Administrator\\Desktop\\yanxintong');

function run(cmd, timeout = 180000) {
  try {
    const out = execSync(cmd, { encoding: 'utf-8', timeout });
    return out.trim();
  } catch (e) {
    return `ERR: ${(e.stderr || e.message || '').split('\n').slice(0, 5).join('\n')}`;
  }
}

console.log('=== Deploying to Vercel production ===');
const result = run('vercel --prod --yes 2>&1');
console.log(result);
console.log('\n=== Deployment complete ===');
