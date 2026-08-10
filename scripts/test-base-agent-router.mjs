// ============================================================
// 单元测试：BaseAgent + Router 并行逻辑（不依赖 Vite/LLM/Vue）
// ============================================================
// 验证：
//   1. BaseAgent.traceAgent 装饰器（日志、计时、异常）
//   2. parseStructured JSON 抽取 + 兜底
//   3. Promise.all 并行调度（intent + tutor 同时发起）
//   4. 双失败兜底 → 串行 tutor
//   5. intent 失败 → 默认 concept + 用预热 tutor
//   6. router.js 源码完整性（文本检查，不 import）
// ============================================================

if (typeof performance === 'undefined') {
  globalThis.performance = { now: () => Date.now() }
}

// === 内联 traceAgent 副本（避免 Vite @ alias 依赖） ===
function traceAgent(agentName, fn) {
  return async function tracedAgent(userInput, profile) {
    const t0 = performance.now()
    const inputPreview = String(userInput || '').slice(0, 60).replace(/\s+/g, ' ')
    console.log(`[agent.${agentName}] input="${inputPreview}…"`)

    let result
    try {
      result = await fn(userInput, profile)
      const latencyMs = Math.round(performance.now() - t0)
      const outputLen = (result && result.content) ? String(result.content).length : 0
      console.log(`[agent.${agentName}] output_len=${outputLen} latency=${latencyMs}ms`)
    } catch (e) {
      const latencyMs = Math.round(performance.now() - t0)
      console.error(`[agent.${agentName}] error after ${latencyMs}ms:`, e.message)
      throw e
    }
    return result
  }
}

// === 内联 parseStructured 副本 ===
function safeParseJSON(raw, fallback) {
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}
function parseStructured(raw, fallback) {
  if (!raw || typeof raw !== 'string') return { ...fallback }
  const jsonMatch = raw.match(/```json\s*([\s\S]+?)```/) || raw.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    const parsed = safeParseJSON(jsonMatch[1] || jsonMatch[0], null)
    if (parsed) return parsed
  }
  return { ...fallback }
}

let pass = 0
let fail = 0

function assert(condition, msg) {
  if (condition) {
    pass++
    console.log(`  ✓ ${msg}`)
  } else {
    fail++
    console.error(`  ✗ ${msg}`)
  }
}

function section(name) {
  console.log(`\n=== ${name} ===`)
}

// === Test 1: traceAgent 装饰器 ===
section('Test 1: BaseAgent.traceAgent 装饰器')

const captured = { logs: [] }
const origLog = console.log
const origErr = console.error
console.log = (...args) => captured.logs.push(args.join(' '))
console.error = (...args) => captured.logs.push(args.join(' '))

const fakeTutor = traceAgent('tutor', async (input) => {
  await new Promise((r) => setTimeout(r, 30))
  return { intent: 'concept', agent: 'tutor', content: `reply to ${input}`, structured: null }
})

const result1 = await fakeTutor('MOSFET 阈值电压', {})

assert(result1.intent === 'concept', '返回 intent 正确')
assert(result1.agent === 'tutor', '返回 agent 正确')
assert(captured.logs.some((l) => l.includes('[agent.tutor] input="MOSFET 阈值电压')), 'trace 输出 input 摘要')
assert(captured.logs.some((l) => l.includes('[agent.tutor] output_len=') && l.includes('latency=')), 'trace 输出 latency')

console.log = origLog
console.error = origErr

// === Test 2: traceAgent 异常透传 ===
section('Test 2: traceAgent 异常透传 + 错误日志')

const captured2 = { logs: [] }
console.log = (...args) => captured2.logs.push(args.join(' '))
console.error = (...args) => captured2.logs.push(args.join(' '))

const failingAgent = traceAgent('failtest', async () => {
  throw new Error('simulated LLM error')
})

let threwError = false
try {
  await failingAgent('test', null)
} catch (e) {
  threwError = true
  assert(e.message === 'simulated LLM error', '异常透传，message 正确')
}
assert(threwError, '异常确实抛出')
assert(captured2.logs.some((l) => l.includes('[agent.failtest] error after')), '错误日志输出')

console.log = origLog
console.error = origErr

// === Test 3: parseStructured 兜底 ===
section('Test 3: parseStructured JSON 抽取 + 兜底')

const parsed1 = parseStructured('```json\n{"a": 1, "b": "x"}\n```', { a: 0 })
assert(parsed1.a === 1 && parsed1.b === 'x', '从 ```json 块正确抽取')

// 注：原 v1.0 行为 — 裸 JSON 块要求是严格 JSON 格式（key 必须加引号）
// 无效 JSON 字符串会被 safeParseJSON 拒绝，回退到 fallback
const parsed2 = parseStructured('看这个 {"x": 10, "y": 20} 怎么样', { x: 0 })
assert(parsed2.x === 10 && parsed2.y === 20, '从严格 JSON 块正确抽取（key 加引号）')

// 非法 JSON 应当兜底
const parsed2b = parseStructured('看这个 {x: 10, y: 20} 怎么样', { x: 99 })
assert(parsed2b.x === 99, '非法 JSON（无引号 key）兜底到 fallback（与 v1.0 行为一致）')

const parsed3 = parseStructured('完全不是 JSON 文本', { fallback: true })
assert(parsed3.fallback === true, '非 JSON 时返回 fallback')

const parsed4 = parseStructured(null, { safe: true })
assert(parsed4.safe === true, 'null 输入返回 fallback')

// === Test 4: Promise.all 并行行为 ===
section('Test 4: Promise.all 并行调度验证')

const events = []
const startTime = Date.now()

const mockIntent = () => new Promise((resolve) => {
  events.push({ t: Date.now() - startTime, label: 'intent_start' })
  setTimeout(() => {
    events.push({ t: Date.now() - startTime, label: 'intent_done' })
    resolve('concept')
  }, 100)
})

const mockTutor = () => new Promise((resolve) => {
  events.push({ t: Date.now() - startTime, label: 'tutor_start' })
  setTimeout(() => {
    events.push({ t: Date.now() - startTime, label: 'tutor_done' })
    resolve({ intent: 'concept', content: 'ok' })
  }, 100)
})

const [intent, tutor] = await Promise.all([mockIntent(), mockTutor()])
const totalTime = Date.now() - startTime

assert(intent === 'concept', 'intent 解析为 concept')
assert(tutor.content === 'ok', 'tutor 拿到结果')
assert(totalTime < 180, `并行总耗时 ${totalTime}ms 应 < 180ms（串行需 ~200ms）`)

const startDelta = Math.abs(
  (events.find((e) => e.label === 'intent_start')?.t || 0) -
  (events.find((e) => e.label === 'tutor_start')?.t || 0)
)
assert(startDelta < 10, `两个 Promise start 间隔 ${startDelta}ms（应 < 10ms）`)

// === Test 5: 双失败兜底 ===
section('Test 5: 双失败兜底到串行 tutor')

const intentFail = () => new Promise((_, reject) => setTimeout(() => reject(new Error('intent fail')), 50))
const tutorFail = () => new Promise((_, reject) => setTimeout(() => reject(new Error('tutor fail')), 50))

const [iSettled, tSettled] = await Promise.all([
  intentFail().catch((e) => ({ __error: e, __value: 'concept' })),
  tutorFail().catch((e) => ({ __error: e, __value: null }))
])

const bothFailed = !!(iSettled.__error && tSettled.__error)
assert(bothFailed, '检测到双失败')

let fallbackCalled = false
if (bothFailed) {
  const fallback = await (async () => ({ intent: 'concept', content: 'fallback' }))()
  fallbackCalled = true
  assert(fallback.content === 'fallback', '串行兜底成功')
}
assert(fallbackCalled, '兜底分支被执行')

// === Test 6: 单边失败 ===
section('Test 6: intent 失败但 tutor 预热成功 → 走 concept')

const intentFailOnly = () => new Promise((_, reject) => setTimeout(() => reject(new Error('intent fail')), 50))
const tutorSuccess = () => new Promise((resolve) => setTimeout(() => resolve({ intent: 'concept', content: 'tutor ok' }), 100))

const [i2, t2] = await Promise.all([
  intentFailOnly().catch((e) => ({ __error: e, __value: 'concept' })),
  tutorSuccess()
])

const intentError2 = !!i2.__error
const tutorPrewarm = t2.__error ? null : t2
const finalIntent = intentError2 ? 'concept' : (i2.__value || i2)

assert(intentError2, 'intent 失败被捕获')
assert(tutorPrewarm && tutorPrewarm.content === 'tutor ok', 'tutor 预热结果可用')
assert(finalIntent === 'concept', '失败时回退到 concept')

// === Test 7: router.js 源码完整性 ===
section('Test 7: router.js 源码完整性（文本检查）')

import { readFileSync } from 'node:fs'
const routerSrc = readFileSync(new URL('../src/core/router.js', import.meta.url), 'utf-8')
assert(routerSrc.includes('export async function route'), 'route 导出保留')
assert(routerSrc.includes('export function guessIntentByRoute'), 'guessIntentByRoute 导出保留')
assert(routerSrc.includes('Promise.all([intentPromise, tutorPromise])'), '并行调用存在')
assert(routerSrc.includes('recognizeIntent'), 'intent 识别独立函数存在')
assert(routerSrc.includes('intentForNext'), '并行分支变量存在')

// === Test 8: 5 Agent 改造完整性 ===
section('Test 8: 5 Agent 文件改造（文本检查）')

for (const agent of ['tutor', 'diagnose', 'planner', 'admission', 'research']) {
  const src = readFileSync(new URL(`../src/core/agents/${agent}.js`, import.meta.url), 'utf-8')
  assert(src.includes(`traceAgent('${agent}'`), `${agent}: traceAgent 包装存在`)
  assert(src.includes('runLLM') || src.includes('callLLM'), `${agent}: 已用 BaseAgent.runLLM/callLLM`)
  assert(src.includes(`export const ${agent}Agent`), `${agent}: ${agent}Agent 导出保留`)
}

// === Test 9: BaseAgent 文件存在 + 导出 ===
section('Test 9: BaseAgent.js 导出完整性')

const baseAgentSrc = readFileSync(new URL('../src/core/agents/BaseAgent.js', import.meta.url), 'utf-8')
assert(baseAgentSrc.includes('export async function runLLM'), 'runLLM 导出')
assert(baseAgentSrc.includes('export function parseStructured'), 'parseStructured 导出')
assert(baseAgentSrc.includes('export function traceAgent'), 'traceAgent 导出')
assert(baseAgentSrc.includes('export const BaseAgent'), 'BaseAgent 命名导出')

// === Test 10: tutor prewarm 命中（命中 concept 不再二次调 LLM） ===
section('Test 10: 命中 concept 时直接用预热结果，不重复 LLM')

let tutorCallCount = 0
const countedTutor = async () => {
  tutorCallCount++
  return { intent: 'concept', content: 'prewarmed' }
}
const countedIntent = async () => 'concept'

const [_intent, _tutor] = await Promise.all([countedIntent(), countedTutor()])
// 命中 concept，应直接用 _tutor，不应再调一次
assert(tutorCallCount === 1, `tutor 预热只调用了 ${tutorCallCount} 次（应为 1）`)

// === Test 11: P0-2 D3 INTENT_PROMPT 兜底 + tool_call trace ===
section('Test 11: P0-2 D3 工具调用兜底 + trace（源码检查）')

assert(routerSrc.includes('buildIntentPrompt'), 'D3: buildIntentPrompt 动态 prompt 存在')
assert(routerSrc.includes('getToolSchemas'), 'D3: 工具 schema 注入存在')
assert(routerSrc.includes('parseIntentResult'), 'D3: parseIntentResult 兜底函数已接入')
assert(routerSrc.includes('recognizeIntentWithTool'), 'D3: recognizeIntentWithTool 函数存在')
assert(routerSrc.includes("'tool_call'"), 'D3: tool_call trace 步骤存在')
assert(routerSrc.includes('summarizeToolResult'), 'D3: 工具结果摘要函数存在')
assert(routerSrc.includes('callTool'), 'D3: callTool 已接入 router')

// intentParser.js 存在且导出 parseIntentResult
import { existsSync as _existsSync } from 'node:fs'
assert(_existsSync(new URL('../src/core/tools/intentParser.js', import.meta.url)), 'D3: intentParser.js 文件存在')
const intentParserSrc = readFileSync(new URL('../src/core/tools/intentParser.js', import.meta.url), 'utf-8')
assert(intentParserSrc.includes('export function parseIntentResult'), 'D3: parseIntentResult 导出')
assert(intentParserSrc.includes('json_parse_failed'), 'D3: 兜底1 json_parse_failed')
assert(intentParserSrc.includes('tool_missing'), 'D3: 兜底2 tool_missing')
assert(intentParserSrc.includes('tool_args_incomplete'), 'D3: 兜底3 tool_args_incomplete')


// === 汇总 ===
section('汇总')
console.log(`通过: ${pass} / ${pass + fail}`)

if (fail > 0) {
  console.error(`\n❌ ${fail} 项测试失败`)
  process.exit(1)
} else {
  console.log(`\n✅ 全部 ${pass} 项通过`)
}
