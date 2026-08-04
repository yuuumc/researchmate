// ============================================================
// check-prompt-version.mjs — Prompt 版本一致性校验（test:unit 前置门禁）
// ============================================================
// 规则：
//   1. 扫描 prompts/*.md（忽略 .compact.md），每个 prompt 必须含 `> **版本**: X.Y.Z` 声明行
//   2. 版本号须满足 semver-like \d+\.\d+\.\d+
//   3. 任一 prompt 缺失 / 畸形 → exit 1（阻止 test:unit 跑过旧 prompt 回归）
// 用途：CI 前置门禁，防止「改了 prompt 内容但忘 bump 版本」的回归漏网。
// ============================================================

import { readdirSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const PROMPTS_DIR = resolve(process.cwd(), 'prompts')
const VERSION_RE = /\*\*版本\*\*:\s*(\d+\.\d+\.\d+)/

let errors = 0
const report = []

try {
  const files = readdirSync(PROMPTS_DIR).filter(
    (f) => f.endsWith('.md') && !f.endsWith('.compact.md'),
  )

  if (files.length === 0) {
    console.error('[check-prompt-version] prompts/ 目录为空或不存在')
    process.exit(1)
  }

  for (const file of files) {
    const content = readFileSync(join(PROMPTS_DIR, file), 'utf-8')
    const match = content.match(VERSION_RE)
    if (!match) {
      report.push(`✗ ${file}: 缺少 \`> **版本**: X.Y.Z\` 声明行`)
      errors += 1
      continue
    }
    report.push(`✓ ${file}: v${match[1]}`)
  }
} catch (e) {
  console.error(`[check-prompt-version] 无法读取 prompts/ 目录: ${e.message}`)
  process.exit(1)
}

console.log('[check-prompt-version] Prompt 版本校验：')
for (const line of report) console.log(`  ${line}`)

if (errors > 0) {
  console.error(`\n[check-prompt-version] ${errors} 个 prompt 版本声明缺失或畸形，已阻止 test:unit。`)
  process.exit(1)
}

console.log(`\n[check-prompt-version] ${report.length} 个 prompt 全部通过版本校验。`)
