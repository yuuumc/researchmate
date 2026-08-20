import { execSync } from 'child_process';
import fs from 'fs';

const PROJ = 'C:\\Users\\Administrator\\Desktop\\yanxintong';
process.chdir(PROJ);

const log = [];
function run(cmd, timeout = 300000) {
  try {
    const out = execSync(cmd, { encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'pipe'] });
    return out.trim();
  } catch (e) {
    return `ERR: ${(e.stdout || '') + (e.stderr || '') + e.message}`.slice(0, 3000);
  }
}

log.push('=== whoami ===');
log.push(run('vercel whoami'));

log.push('\n=== Deploying to Vercel production ===');
log.push(run('vercel --prod --yes'));

log.push('\n=== Done ===');
fs.writeFileSync('deploy_output.txt', log.join('\n'), 'utf-8');
console.log('Done. See deploy_output.txt');
