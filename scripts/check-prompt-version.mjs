// ============================================================
// check-prompt-version.mjs — Prompt 版本一致性校验（test:unit 前置门禁）
// ============================================================
// 规则：
//   1. 扫描 prompts/*.md 和 src/prompts/**/*.md（忽略 .compact.md），
//      每个 prompt 必须含 `> **版本**: X.Y.Z` 声明行
//   2. 版本号须满足 semver-like \d+\.\d+\.\d+
//   3. 任一 prompt 缺失 / 畸形 → exit 1（阻止 test:unit 跑过旧 prompt 回归）
// 用途：CI 前置门禁，防止「改了 prompt 内容但忘 bump 版本」的回归漏网。
// ============================================================

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

const ROOT = process.cwd()
const SERVER_DIR = resolve(ROOT, 'prompts')
const CLIENT_DIR = resolve(ROOT, 'src/prompts')
const VERSION_RE = /\*\*版本\*\*:\s*(\d+\.\d+\.\d+)/

let errors = 0
const report = []

/**
 * 递归收集目录下所有 .md 文件（排除 .compact.md）
 */
function collectMdFiles(dir, base = dir) {
  const results = []
  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        results.push(...collectMdFiles(fullPath, base))
      } else if (entry.endsWith('.md') && !entry.endsWith('.compact.md')) {
        results.push(fullPath)
      }
    }
  } catch (e) {
    // 目录不存在时静默跳过
  }
  return results
}

const serverFiles = collectMdFiles(SERVER_DIR)
const clientFiles = collectMdFiles(CLIENT_DIR)
const allFiles = [...serverFiles, ...clientFiles]

if (allFiles.length === 0) {
  console.error('[check-prompt-version] prompts/ 和 src/prompts/ 目录均为空或不存在')
  process.exit(1)
}

for (const file of allFiles) {
  const relPath = relative(ROOT, file)
  const content = readFileSync(file, 'utf-8')
  const match = content.match(VERSION_RE)
  if (!match) {
    report.push(`✗ ${relPath}: 缺少 \`> **版本**: X.Y.Z\` 声明行`)
    errors += 1
    continue
  }
  report.push(`✓ ${relPath}: v${match[1]}`)
}

console.log('[check-prompt-version] Prompt 版本校验：')
for (const line of report) console.log(`  ${line}`)

if (errors > 0) {
  console.error(`\n[check-prompt-version] ${errors} 个 prompt 版本声明缺失或畸形，已阻止 test:unit。`)
  process.exit(1)
}

console.log(`\n[check-prompt-version] ${report.length} 个 prompt 全部通过版本校验。`)
