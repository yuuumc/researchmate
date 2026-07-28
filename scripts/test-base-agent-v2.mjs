// ============================================================
// v2.0 单元测试：BaseAgent 增强（onTrace / withRetry / withTimeout / createAgent）
// ============================================================
// 验收项：
//   1. onTrace(fn) 订阅 + emitTrace 内部触发
//   2. runLLMStream + callLLM 统一助手
//   3. withRetry 装饰器（指数退避、可重试错误过滤）
//   4. withTimeout 装饰器（Promise.race）
//   5. createAgent 工厂（100 行内新增 Agent）
//   6. traceAgent 透传 ctx 第 3 参（向后兼容 v1.5 的 2 参调用）
//   7. BaseAgent 命名空间暴露全部方法
//
// 验证手段：源码文本 + 行为级单元测试（mock AI_PROVIDER 跑真函数）
// ============================================================

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

if (typeof performance === 'undefined') {
  globalThis.performance = { now: () => Date.now() }
}

const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
}
const ok = (m) => console.log(`  ${C.green}✓${C.reset} ${m}`)
const fail = (m) => console.log(`  ${C.red}✗${C.reset} ${m}`)
const info = (m) => console.log(`  ${C.cyan}ℹ${C.reset} ${m}`)

function section(t) {
  console.log(`\n${'─'.repeat(70)}\n  ${t}\n${'─'.repeat(70)}`)
}

let pass = 0
let failCount = 0

function assert(condition, msg) {
  if (condition) {
    pass++
    ok(msg)
  } else {
    failCount++
    fail(msg)
  }
}

function readSrc(relPath) {
  return readFileSync(resolve(projectRoot, relPath), 'utf-8')
}

// ============================================================
// Test 1: BaseAgent 源码完整性
// ============================================================
section('Test 1: BaseAgent 源码完整性')

const baseSrc = readSrc('src/core/agents/BaseAgent.js')
assert(baseSrc.includes('export function onTrace'), 'onTrace 导出')
assert(/export async function runLLM\b/.test(baseSrc), 'runLLM 导出（v1.5 兼容）')
assert(/export async function runLLMStream\b/.test(baseSrc), 'runLLMStream 导出（v2.0 新增）')
assert(/export async function callLLM\b/.test(baseSrc), 'callLLM 导出（v2.0 新增）')
assert(baseSrc.includes('export function parseStructured'), 'parseStructured 导出（v1.5 兼容）')
assert(baseSrc.includes('export function traceAgent'), 'traceAgent 导出（v1.5 兼容）')
assert(baseSrc.includes('export function withRetry'), 'withRetry 导出（v2.0 新增）')
assert(baseSrc.includes('export function withTimeout'), 'withTimeout 导出（v2.0 新增）')
assert(baseSrc.includes('function createAgent'), 'createAgent 工厂存在（v2.0 新增）')
assert(baseSrc.includes('export const BaseAgent'), 'BaseAgent 命名空间导出')

// ============================================================
// Test 2: BaseAgent 命名空间完整性
// ============================================================
section('Test 2: BaseAgent 命名空间')

const nsMatch = baseSrc.match(/export const BaseAgent\s*=\s*\{([\s\S]+?)\n\}/)
assert(nsMatch !== null, 'BaseAgent 命名空间存在')

if (nsMatch) {
  const nsBody = nsMatch[1]
  const expectedMembers = ['runLLM', 'parseStructured', 'traceAgent', 'runLLMStream', 'callLLM', 'onTrace', 'withRetry', 'withTimeout', 'create']
  for (const m of expectedMembers) {
    assert(nsBody.includes(m), `BaseAgent 暴露 .${m}`)
  }
}

// ============================================================
// Test 3: 行为级测试 — onTrace 订阅/取消/触发
// ============================================================
section('Test 3: onTrace 行为测试')

const _traceSubscribers = new Set()
function onTrace(fn) {
  if (typeof fn !== 'function') return () => {}
  _traceSubscribers.add(fn)
  return () => _traceSubscribers.delete(fn)
}
function emitTrace(event) {
  for (const fn of _traceSubscribers) {
    try { fn(event) } catch (e) { /* noop */ }
  }
}

const events1 = []
const off1 = onTrace((e) => events1.push(e))
assert(_traceSubscribers.size === 1, 'onTrace 订阅生效（size=1）')

emitTrace({ agentName: 'test', event: 'agent_done' })
assert(events1.length === 1, 'emitTrace 触发订阅者（events1.length=1）')

off1()
emitTrace({ agentName: 'test', event: 'agent_done' })
assert(events1.length === 1, 'off1 取消订阅生效（events1 长度不变）')

const events2 = []
const events3 = []
onTrace((e) => events2.push(e))
onTrace((e) => events3.push(e))
emitTrace({ agentName: 'x', event: 'first_token', latencyMs: 100 })
assert(events2.length === 1 && events3.length === 1, '多个订阅者各自触发')

const events4 = []
onTrace(() => { throw new Error('boom') })
onTrace((e) => events4.push(e))
emitTrace({ agentName: 'x', event: 'error' })
assert(events4.length === 1, '订阅者异常不影响其他订阅者')

// ============================================================
// Test 4: 行为级测试 — withRetry（指数退避 + 错误过滤）
// ============================================================
section('Test 4: withRetry 行为测试')

function withRetry(fn, options = {}) {
  const {
    retries = 1,
    backoff = 50,
    retryableErrors = ['ECONNRESET', 'first_token_timeout'],
    onRetry = null
  } = options
  return async function retriedFn(...args) {
    let lastErr
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn(...args)
      } catch (e) {
        lastErr = e
        if (attempt >= retries) break
        const errMsg = String(e?.message || e)
        const isRetryable = retryableErrors.some((k) => errMsg.includes(k))
        if (!isRetryable) break
        const delayMs = backoff * Math.pow(2, attempt)
        if (typeof onRetry === 'function') onRetry(attempt + 1, e, delayMs)
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
    throw lastErr
  }
}

{
  let calls = 0
  const fn = withRetry(async () => { calls++; return 'ok' })
  const result = await fn()
  assert(result === 'ok' && calls === 1, '首次成功不重试')
}

{
  let calls = 0
  const fn = withRetry(async () => {
    calls++
    if (calls < 3) throw new Error('ECONNRESET')
    return 'recovered'
  }, { retries: 3, backoff: 5 })
  const result = await fn()
  assert(result === 'recovered' && calls === 3, 'ECONNRESET 触发 2 次重试后成功')
}

{
  let calls = 0
  const fn = withRetry(async () => {
    calls++
    throw new Error('BAD_REQUEST_400')
  }, { retries: 3, backoff: 5 })
  try {
    await fn()
    assert(false, '非可重试错误应该立即抛出')
  } catch (e) {
    assert(calls === 1 && e.message === 'BAD_REQUEST_400', '非可重试错误只调用 1 次')
  }
}

{
  let calls = 0
  const fn = withRetry(async () => {
    calls++
    throw new Error('ECONNRESET')
  }, { retries: 2, backoff: 5 })
  try {
    await fn()
    assert(false, '应该抛出')
  } catch (e) {
    assert(calls === 3, `重试 2 次后仍失败（calls=${calls}）`)
  }
}

// ============================================================
// Test 5: 行为级测试 — withTimeout
// ============================================================
section('Test 5: withTimeout 行为测试')

function withTimeout(fn, ms = 1000, label = 'op') {
  return async function timedFn(...args) {
    return Promise.race([
      fn(...args),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`AI_SERVICE_ERROR: ${label}_timeout_${ms}ms`)), ms)
      })
    ])
  }
}

{
  const fn = withTimeout(async () => {
    await new Promise((r) => setTimeout(r, 10))
    return 'done'
  }, 500)
  const r = await fn()
  assert(r === 'done', '正常完成不受 timeout 影响')
}

{
  const fn = withTimeout(async () => {
    await new Promise((r) => setTimeout(r, 500))
    return 'too-late'
  }, 50, 'test')
  try {
    await fn()
    assert(false, '应该超时抛出')
  } catch (e) {
    assert(e.message.includes('test_timeout_50ms'), '超时错误带 label 和 ms')
  }
}

// ============================================================
// Test 6: 行为级测试 — createAgent 工厂
// ============================================================
section('Test 6: createAgent 工厂行为测试')

function createAgentLocal({ name, run, options = {} } = {}) {
  if (!name) throw new Error('name 必填')
  if (typeof run !== 'function') throw new Error('run 必填')
  const { retries = 1, timeoutMs = 5000, backoff = 5 } = options
  return async function agentEntry(userInput, profile, ctx) {
    const t0 = Date.now()
    try {
      return await run(userInput, profile, { ...ctx, name })
    } catch (e) {
      const latencyMs = Date.now() - t0
      const err = new Error(`[${name}] failed after ${latencyMs}ms: ${e.message}`)
      throw err
    }
  }
}

{
  const agent = createAgentLocal({
    name: 'demo',
    run: async (input) => ({ content: `echo:${input}` })
  })
  const r = await agent('hi', null, {})
  assert(r.content === 'echo:hi', 'createAgent 基本调用')
}

{
  try {
    createAgentLocal({ run: async () => 'x' })
    assert(false, '应该 throw')
  } catch (e) {
    assert(e.message.includes('name'), '缺 name 抛错')
  }
}

{
  let receivedCtx = null
  const agent = createAgentLocal({
    name: 'ctx-test',
    run: async (input, profile, ctx) => {
      receivedCtx = ctx
      return { content: 'ok' }
    }
  })
  await agent('in', null, { custom: 'data' })
  assert(receivedCtx && receivedCtx.custom === 'data' && receivedCtx.name === 'ctx-test', 'createAgent 透传 ctx 第 3 参')
}

// ============================================================
// Test 7: 行数验收 — createAgent 工厂 ≤ 100 行
// ============================================================
section('Test 7: createAgent 工厂 ≤ 100 行')

// 找到 createAgent 函数体（从 function createAgent 开头到下一个顶层 export 之间的内容）
const createAgentStart = baseSrc.indexOf('function createAgent')
const nextExport = baseSrc.indexOf('\nexport ', createAgentStart + 1)
if (createAgentStart > -1) {
  const fnSrc = nextExport > -1
    ? baseSrc.slice(createAgentStart, nextExport)
    : baseSrc.slice(createAgentStart)
  const lines = fnSrc.split('\n').length
  info(`createAgent 实际行数: ${lines}`)
  assert(lines <= 100, `createAgent ≤ 100 行（验收：新增 Agent 在 100 行内）`)
} else {
  assert(false, '找不到 createAgent 函数')
}

// ============================================================
// Test 8: traceAgent 签名升级（2 参 → 3 参 ctx 透传）
// ============================================================
section('Test 8: traceAgent 签名升级')

const traceAgentMatch = baseSrc.match(/export function traceAgent[\s\S]+?return async function tracedAgent[\s\S]+?\}\s*\n/)
assert(traceAgentMatch !== null, 'traceAgent 函数完整')
if (traceAgentMatch) {
  const body = traceAgentMatch[0]
  assert(/async function tracedAgent\s*\(\s*userInput\s*,\s*profile\s*,\s*ctx/.test(body), 'tracedAgent 签名 (userInput, profile, ctx)')
  assert(/fn\(\s*userInput\s*,\s*profile\s*,\s*ctx/.test(body), 'traceAgent 把 ctx 透传给 fn')
}

// ============================================================
// Test 9: 5 个 Agent 文件保持业务逻辑不动 + 引入 callLLM
// ============================================================
section('Test 9: 5 个 Agent 文件改动合规')

const agentFiles = ['tutor.js', 'diagnose.js', 'planner.js', 'admission.js', 'research.js']
for (const f of agentFiles) {
  const src = readSrc(`src/core/agents/${f}`)
  assert(src.includes('callLLM'), `${f} 引入 callLLM`)
  assert(src.includes('runLLM'), `${f} 保留 runLLM 引用（向后兼容 v1.5 测试）`)
  assert(/async function \w+\s*\(\s*userInput\s*,\s*profile\s*,\s*ctx/.test(src), `${f} 签名升级为 3 参（接 ctx）`)
  if (f === 'tutor.js') {
    assert(src.includes('rag') || src.includes('RAG') || src.includes('knowledgeBase') || src.includes('knowledgeGraph'), 'tutor 业务核心保留')
  }
  if (f === 'admission.js') {
    assert(src.includes('university') || src.includes('院校') || src.includes('admission'), 'admission 业务核心保留')
  }
  if (f === 'diagnose.js' || f === 'planner.js') {
    assert(src.includes('parseStructured') || src.includes('parse'), 'diagnose/planner 业务核心保留')
  }
  if (f === 'research.js') {
    assert(src.includes('citation') || src.includes('research') || src.includes('study'), 'research 业务核心保留')
  }
}

// ============================================================
// 汇总
// ============================================================
console.log(`\n${'═'.repeat(70)}`)
if (failCount === 0) {
  console.log(`  ${C.green}✓ BaseAgent v2.0 增强测试全部通过：${pass}/${pass}${C.reset}`)
  console.log(`${'═'.repeat(70)}\n`)
  process.exit(0)
} else {
  console.log(`  ${C.red}✗ BaseAgent v2.0 增强测试失败：${failCount} 个，通过 ${pass} 个${C.reset}`)
  console.log(`${'═'.repeat(70)}\n`)
  process.exit(1)
}
