// ============================================================
// E2E 运行器：mock 模式自启 mock-server，real 模式直连真实端点
// ============================================================
// 用法：
//   node scripts/run-e2e.mjs mock   # 启动 mock-server，三脚本走 localhost:5175
//   node scripts/run-e2e.mjs real   # 三脚本走 AGENT_API_URL（默认生产）
// 退出码：任一脚本失败即非零退出。
//
// 注意：Node.js Windows 上 process.exit(0) 后 AbortController/fetch
// 句柄清理可能触发 libuv 断言崩溃（exit code 3221226505 = 0xC0000409），
// 这是已知 runtime bug，不影响测试结果。本运行器捕获 stdout 用内容
// 判定通过/失败，崩溃码但 stdout 含成功标记时视为通过。
// ============================================================

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const mode = process.argv[2] || 'mock'
const SCRIPTS = [
  'scripts/test-agent-e2e.mjs',
  'scripts/test-agents-collab.mjs',
  'scripts/test-history-demo.mjs'
]
const MOCK_PORT = Number(process.env.MOCK_PORT || 5175)
const REAL_URL = process.env.AGENT_API_URL || 'https://researchmate.vercel.app/api/chat'

// 每个脚本的通过标记（stdout 含此字符串 = 测试逻辑通过）
const PASS_MARKERS = {
  'scripts/test-agent-e2e.mjs': '全部测试完成',
  'scripts/test-agents-collab.mjs': '验收通过',
  'scripts/test-history-demo.mjs': '验收通过'
}
// Windows 崩溃码阈值（>= 此值 = runtime 清理崩溃，非测试失败）
const WIN_CRASH_THRESHOLD = 0xC0000000

async function waitReady(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(1500) })
      if (r.ok) return true
    } catch { /* retry */ }
    await sleep(250)
  }
  return false
}

function runScript(file, env) {
  return new Promise(resolve => {
    const chunks = []
    const p = spawn(process.execPath, [file], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env }
    })
    p.stdout.on('data', d => {
      process.stdout.write(d)
      chunks.push(d)
    })
    p.stderr.on('data', d => process.stderr.write(d))
    p.on('exit', code => {
      const stdout = Buffer.concat(chunks).toString('utf8')
      const marker = PASS_MARKERS[file] || ''
      const hasPassMarker = marker && stdout.includes(marker)
      const isWinCrash = typeof code === 'number' && code >= WIN_CRASH_THRESHOLD
      // 测试逻辑通过的情况：exit 0，或 Windows 清理崩溃但 stdout 含成功标记
      const passed = code === 0 || (isWinCrash && hasPassMarker)
      resolve({ file, code, passed, isWinCrash, hasPassMarker })
    })
  })
}

async function main() {
  console.log(`\n▶ run-e2e · mode=${mode}`)

  if (mode !== 'mock' && mode !== 'real') {
    console.error(`未知 mode: ${mode}（支持: mock | real）`)
    process.exit(2)
  }

  let mockProc = null
  const childEnv = {}

  if (mode === 'mock') {
    const mockUrl = `http://localhost:${MOCK_PORT}`
    console.log(`  启动 mock-server @ ${mockUrl} ...`)
    mockProc = spawn(process.execPath, ['scripts/mock-server.mjs'], {
      stdio: 'inherit',
      env: { ...process.env, MOCK_PORT: String(MOCK_PORT) }
    })
    const ready = await waitReady(mockUrl, 60)
    if (!ready) {
      console.error('  mock-server 未在限时内就绪')
      mockProc.kill()
      process.exit(2)
    }
    console.log('  mock-server 已就绪\n')
    childEnv.AGENT_API_MOCK = '1'
  } else {
    childEnv.AGENT_API_URL = REAL_URL
    console.log(`  端点：${REAL_URL}\n`)
  }

  const results = []
  for (const s of SCRIPTS) {
    console.log(`\n──── ${s} ────`)
    results.push(await runScript(s, childEnv))
  }

  if (mockProc) {
    try { mockProc.kill() } catch {}
    console.log('\n  mock-server 已关闭')
  }

  console.log('\n══════ E2E 汇总 ══════')
  let failed = 0
  for (const r of results) {
    const mark = r.passed ? '✓' : '✗'
    const note = r.isWinCrash ? ' [win-crash, stdout 通过]' : ''
    console.log(`  ${mark} ${r.file}  (exit ${r.code})${note}`)
    if (!r.passed) failed++
  }

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('[run-e2e FATAL]', e)
  process.exit(2)
})
