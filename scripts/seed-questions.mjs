// ============================================================
// 题库导入脚本：读 generate-questions 产物 → upsert 到 Supabase
// W2 第一步后半段
// ============================================================
// 用法：
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-questions.mjs /tmp/questions.json
//
// 注意：
//   - 用 service_role key 绕过 RLS（status='draft' 写入不需要 user 鉴权）
//   - content_hash 唯一约束：重复则自动跳过（on_conflict=content_hash）
//   - 默认 status='draft'，管理员审核后改为 'reviewed' 或 'published'
// ============================================================

import fs from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Usage: node seed-questions.mjs <questions.json>');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
const rows = data.rows || [];

if (rows.length === 0) {
  console.log('No rows to insert');
  process.exit(0);
}

console.log(`Importing ${rows.length} questions to ${SUPABASE_URL}`);

let success = 0;
let failed = 0;
let duplicates = 0;

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/questions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=minimal,resolution=ignore-duplicates',
    },
    body: JSON.stringify(row),
  });
  if (resp.status === 201 || resp.status === 200) {
    success++;
  } else if (resp.status === 409) {
    duplicates++;
  } else {
    failed++;
    const errText = await resp.text();
    console.error(`[${i + 1}] FAILED (${resp.status}): ${errText.slice(0, 200)}`);
  }
  if ((i + 1) % 10 === 0) {
    process.stdout.write(`Progress: ${i + 1}/${rows.length}\n`);
  }
}

console.log('\n=== Import Summary ===');
console.log(`Success: ${success}`);
console.log(`Duplicates (skipped): ${duplicates}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${rows.length}`);
