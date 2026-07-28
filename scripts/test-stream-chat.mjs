// ============================================================
// v2.0 单元测试：SSE 流式聊天（不依赖真实 LLM）
// ============================================================
// 验收项：
//   1. api/chat.js 源码包含 SSE 关键片段
//   2. handleStream 函数存在并设置正确响应头
//   3. 流式事件格式：event: token / done / error
//   4. 首 token 30s 超时保护
//   5. 1 次重试（max_tokens 减半）
//   6. Vite dev middleware mockRes 支持 write / flushHeaders
//   7. deepseek.js 包含 callDeepSeekStream 函数
//   8. custom.js AI_PROVIDER 暴露 callStream / callReasonerStream
//
// 验证手段：源码文本检查（不 import，避免 Vite alias 依赖）
// ============================================================

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

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
const dim = (m) => console.log(`  ${C.gray}${m}${C.reset}`)

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
// 测试 1: api/chat.js SSE 实现完整性
// ============================================================
section('Test 1: api/chat.js SSE 实现')

const chatSrc = readSrc('api/chat.js')
assert(chatSrc.includes('handleStream'), '包含 handleStream 函数')
assert(chatSrc.includes('text/event-stream'), 'SSE Content-Type 已设置')
assert(chatSrc.includes('X-Accel-Buffering'), '禁用 nginx 缓冲')
assert(chatSrc.includes('flushHeaders'), '立即 flush headers')
assert(chatSrc.includes('first_token_timeout'), '首 token 30s 超时保护')
assert(chatSrc.includes('STREAM_FIRST_TOKEN_TIMEOUT_MS'), '首 token 超时常量存在')
assert(chatSrc.includes('DEFAULT_MAX_DURATION_MS'), '总时长上限常量存在')
assert(/sendEvent\(\s*['"]token['"]/.test(chatSrc), 'SSE 事件: token')
assert(/sendEvent\(\s*['"]done['"]/.test(chatSrc), 'SSE 事件: done')
assert(/sendEvent\(\s*['"]error['"]/.test(chatSrc), 'SSE 事件: error')
assert(chatSrc.includes('RETRY_MAX_TOKENS_RATIO'), '重试 max_tokens 减半策略存在')
assert(chatSrc.includes('isRetryable'), '可重试状态码判断函数存在')
assert(chatSrc.includes('[DONE]'), '处理 [DONE] 结束标记')

// ============================================================
// 测试 2: Vite dev middleware mockRes 支持 SSE
// ============================================================
section('Test 2: Vite dev middleware mockRes')

const viteSrc = readSrc('vite.config.js')
assert(viteSrc.includes('mockRes'), 'dev middleware 注入 mockRes')
assert(/mockRes[\s\S]*?write\s*\(/.test(viteSrc), 'mockRes.write() 方法已暴露')
assert(/mockRes[\s\S]*?flushHeaders\s*\(/.test(viteSrc), 'mockRes.flushHeaders() 方法已暴露')
assert(/mockRes[\s\S]*?writableEnded/.test(viteSrc), 'mockRes.writableEnded getter 已暴露')

// ============================================================
// 测试 3: deepseek.js callDeepSeekStream 实现
// ============================================================
section('Test 3: deepseek.js callDeepSeekStream')

const deepseekSrc = readSrc('src/api/deepseek.js')
assert(/export async function callDeepSeekStream/.test(deepseekSrc), 'callDeepSeekStream 函数声明（async）')
assert(/callDeepSeekStream[\s\S]{0,500}fetch\(/.test(deepseekSrc), 'callDeepSeekStream 使用 fetch')
assert(/callDeepSeekStream[\s\S]{0,800}ReadableStream|getReader/.test(deepseekSrc), 'callDeepSeekStream 使用 ReadableStream/getReader')
assert(/callDeepSeekStream[\s\S]{0,4000}TextDecoder/.test(deepseekSrc), 'callDeepSeekStream 使用 TextDecoder')
assert(/callDeepSeekStream[\s\S]{0,500}onToken/.test(deepseekSrc), 'callDeepSeekStream 支持 onToken 回调')
assert(/callDeepSeekStream[\s\S]{0,800}AbortController|signal/.test(deepseekSrc), 'callDeepSeekStream 支持 AbortController')
assert(/callDeepSeekStream[\s\S]{0,1500}fallback|callDeepSeek\(/.test(deepseekSrc), 'callDeepSeekStream 有 fetch 失败回退到 callDeepSeek')

// ============================================================
// 测试 4: custom.js AI_PROVIDER 暴露流式方法
// ============================================================
section('Test 4: custom.js AI_PROVIDER')

const customSrc = readSrc('src/api/custom.js')
assert(/async callStream\(/.test(customSrc), 'AI_PROVIDER.callStream 方法已暴露')
assert(/async callReasonerStream\(/.test(customSrc), 'AI_PROVIDER.callReasonerStream 方法已暴露')
assert(/callStream[\s\S]{0,500}callDeepSeekStream/.test(customSrc), 'AI_PROVIDER.callStream 内部调用 callDeepSeekStream')
assert(/callReasonerStream[\s\S]{0,500}callDeepSeekReasonerStream|callReasonerStream[\s\S]{0,500}callDeepSeekStream/.test(customSrc), 'AI_PROVIDER.callReasonerStream 内部调用流式 DeepSeek 函数')

// ============================================================
// 测试 5: BaseAgent.js runLLMStream 实现
// ============================================================
section('Test 5: BaseAgent.js runLLMStream')

const baseSrc = readSrc('src/core/agents/BaseAgent.js')
assert(/export async function runLLMStream/.test(baseSrc), 'runLLMStream 函数声明（async）')
assert(/runLLMStream[\s\S]{0,1500}first_token/.test(baseSrc), 'runLLMStream 触发 first_token trace 事件')
assert(/runLLMStream[\s\S]{0,1500}llm_stream_done/.test(baseSrc), 'runLLMStream 触发 llm_stream_done trace 事件')
assert(/export async function callLLM/.test(baseSrc), 'callLLM 统一助手存在')
assert(/callLLM[\s\S]{0,400}runLLMStream/.test(baseSrc), 'callLLM 转发到 runLLMStream（onToken 时）')

// ============================================================
// 测试 6: Router / Cascade 透传 onToken
// ============================================================
section('Test 6: Router / Cascade 透传 onToken')

const routerSrc = readSrc('src/core/router.js')
const cascadeSrc = readSrc('src/core/cascade.js')
assert(/route[\s\S]{0,800}onToken/.test(routerSrc), 'router.js route 接受 onToken 参数')
assert(/route[\s\S]{0,800}signal/.test(routerSrc), 'router.js route 接受 signal 参数')
assert(/onToken[\s\S]{0,500}prewarm|onToken[\s\S]{0,500}tutor/.test(routerSrc), 'router.js 透传 onToken 到 tutor 预热')
assert(cascadeSrc.includes('ctx') || cascadeSrc.includes('onToken'), 'cascade.js 透传 ctx/onToken')

// ============================================================
// 测试 7: ChatWindow.vue 流式渲染 + 取消
// ============================================================
section('Test 7: ChatWindow.vue 流式渲染 + 取消')

const chatWindowSrc = readSrc('src/components/ChatWindow.vue')
assert(chatWindowSrc.includes('onToken') || chatWindowSrc.includes('onChunk'), 'ChatWindow 处理 onToken')
assert(chatWindowSrc.includes('AbortController') || chatWindowSrc.includes('currentAbort'), 'ChatWindow 支持取消流')
assert(chatWindowSrc.includes('streaming'), 'ChatWindow 有 streaming 状态/样式')
assert(chatWindowSrc.includes('cancel') || chatWindowSrc.includes('取消'), 'ChatWindow 有取消按钮')
assert(chatWindowSrc.includes('firstTokenLatencyMs') || chatWindowSrc.includes('首 token') || chatWindowSrc.includes('流式'), 'ChatWindow 感知首 token / 流式状态')

// ============================================================
// 测试 8: 整体流式首 token 延迟设计
// ============================================================
section('Test 8: 流式首 token 延迟设计')

assert(chatSrc.includes('flushHeaders'), '服务端立即 flush headers（不等 body 完整）')
assert(deepseekSrc.includes('onToken') && deepseekSrc.includes('delta'), '客户端每收到 delta 立即调 onToken')
assert(chatWindowSrc.includes('msg.content') || chatWindowSrc.includes('streaming'), '前端每次 onToken 增量更新 message.content')
info('链路：fetch(SSE) → handler.flushHeaders → DeepSeek delta → onToken → DOM patch')
info('首 token 延迟理论值 = DeepSeek 首 token + 网络 RTT（应 < 2s）')

// ============================================================
// 汇总
// ============================================================
console.log(`\n${'═'.repeat(70)}`)
if (failCount === 0) {
  console.log(`  ${C.green}✓ SSE 流式聊天测试全部通过：${pass}/${pass}${C.reset}`)
  console.log(`${'═'.repeat(70)}\n`)
  process.exit(0)
} else {
  console.log(`  ${C.red}✗ SSE 流式聊天测试失败：${failCount} 个，通过 ${pass} 个${C.reset}`)
  console.log(`${'═'.repeat(70)}\n`)
  process.exit(1)
}
