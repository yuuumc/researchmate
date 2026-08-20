// ============================================================
// _runner.test.mjs — vitest 编排器：运行 tests/test-*.mjs 自定义断言脚本
// ============================================================
// 既有测试文件使用自定义 assert() + pass/fail 计数（非 vitest test()/it() API），
// 且通过 process.exit(1) 诚实报告失败。本编排器以子进程逐个执行，
// 捕获 stdout + exit code，解析 pass/fail 计数，汇总后由 vitest 统一报告。
// alias-loader.mjs 解析 @/ 别名 + 桩 supabase 等重依赖。
// ============================================================

import { test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const files = readdirSync(__dirname)
  .filter(f => /^test-.*\.mjs$/.test(f))
  .sort()

for (const file of files) {
  test(file, () => {
    let stdout = ''
    let stderr = ''
    let exitCode = 0

    try {
      stdout = execFileSync('node', [
        '--loader', './tests/alias-loader.mjs',
        `tests/${file}`,
      ], {
        encoding: 'utf-8',
        cwd: ROOT,
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (e) {
      stdout = e.stdout ? e.stdout.toString() : ''
      stderr = e.stderr ? e.stderr.toString() : ''
      exitCode = e.status ?? 1
    }

    // 解析 pass/fail 计数（兼容多种格式）
    // 格式 A: PASS=N FAIL=N Total=N（f4 等）—— 优先匹配，避免 "19 FAIL" 被通用正则误配
    // 格式 B: N pass / N fail 或 N passed, N failed（b1/f1 等）
    let passed = 0, failed = 0
    const altMatch = stdout.match(/PASS=(\d+).*?FAIL=(\d+)/i)
    if (altMatch) {
      passed = parseInt(altMatch[1])
      failed = parseInt(altMatch[2])
    } else {
      const passMatch = stdout.match(/(\d+)[ \t]*(?:pass|passed)/i)
      const failMatch = stdout.match(/(\d+)[ \t]*(?:fail|failed)/i)
      passed = passMatch ? parseInt(passMatch[1]) : 0
      failed = failMatch ? parseInt(failMatch[1]) : 0
    }

    if (exitCode !== 0 || failed > 0) {
      const failLines = stdout.split('\n').filter(l =>
        l.includes('✗') || l.includes('❌') || l.includes('FAIL') ||
        l.includes('SyntaxError') || l.includes('Error') || l.includes('failed')
      )
      const detail = stderr || failLines.join('\n') || stdout.slice(-800)
      throw new Error(
        `${file}: ${passed} passed, ${failed} failed, exit ${exitCode}\n${detail}`
      )
    }
  })
}
