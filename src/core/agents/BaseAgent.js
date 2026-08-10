// ============================================================
// BaseAgent 基类 + trace 装饰器（v2.0 升级版）
// ============================================================
// v1.5 → v2.0 增量：
//   1. runLLMStream — 配合 /api/chat SSE，首 token 延迟 < 2s
//   2. withRetry / withTimeout 装饰器 — 提升稳定性
//   3. onTrace 订阅 — 结构化 trace 事件，可对接 Sentry / Vercel Analytics
//   4. createAgent 工厂 — 新增 Agent 控制在 100 行内（v2.0 验收）
//   5. callLLM 统一助手 — 内部封装 runLLM / runLLMStream 选择
//
// 设计：BaseAgent 是"逻辑容器"（不是 class），5 个 Agent 用函数形态
//       调 traceAgent(name, fn) 装饰，自动获得 trace 埋点
// ============================================================

import { AI_PROVIDER } from '@/api/custom'
import { safeParseJSON } from '@/utils/validator'

// P0-2: Tool calling support (re-export from tools framework)
export { registerTool, callTool, getToolSchemas, setKnowledgeBaseForTools, setKnowledgeGraphForTools } from '../tools/index'

// ============================================================
// Trace 事件订阅（v2.0 新增）
// ============================================================
const _traceSubscribers = new Set()

/**
 * 订阅 trace 事件（agent 启动/完成/错误/重试）
 * @param {(event: TraceEvent) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onTrace(fn) {
  if (typeof fn !== 'function') return () => {}
  _traceSubscribers.add(fn)
  return () => _traceSubscribers.delete(fn)
}

function emitTrace(event) {
  if (_traceSubscribers.size === 0) return
  for (const fn of _traceSubscribers) {
    try {
      fn(event)
    } catch (e) {
      console.error('[BaseAgent] onTrace 回调异常:', e.message)
    }
  }
}

// ============================================================
// 1. 统一 LLM 调用（非流式，沿用 v1.5）
// ============================================================
export async function runLLM(agentName, prompt, userInput, options = {}, useReasoner = false, history = []) {
  const t0 = performance.now()
  let content
  try {
    content = useReasoner
      ? await AI_PROVIDER.callReasoner(prompt, userInput, options, history)
      : await AI_PROVIDER.call(prompt, userInput, options, history)
  } catch (e) {
    const latencyMs = Math.round(performance.now() - t0)
    emitTrace({ agentName, event: 'error', latencyMs, error: e.message, ts: Date.now() })
    console.error(`[${agentName}] LLM call failed after ${latencyMs}ms:`, e.message)
    const err = new Error(`[${agentName}] LLM call failed: ${e.message}`)
    err.agentName = agentName
    err.latencyMs = latencyMs
    err.cause = e
    throw err
  }
  const latencyMs = Math.round(performance.now() - t0)
  emitTrace({ agentName, event: 'llm_done', latencyMs, contentLen: content?.length || 0, ts: Date.now() })
  return { content, latencyMs }
}

// ============================================================
// 2. 统一 LLM 流式调用（v2.0 新增）
// ============================================================
export async function runLLMStream(agentName, prompt, userInput, options = {}, onToken = null, useReasoner = false, signal = null, history = []) {
  const t0 = performance.now()
  let firstTokenLatencyMs = null
  let content = ''
  const wrappedOnToken = (chunk) => {
    if (firstTokenLatencyMs === null) {
      firstTokenLatencyMs = Math.round(performance.now() - t0)
      emitTrace({ agentName, event: 'first_token', latencyMs: firstTokenLatencyMs, ts: Date.now() })
    }
    content += chunk.delta
    if (typeof onToken === 'function') {
      try { onToken(chunk) } catch (e) {
        console.error(`[${agentName}] onToken callback error:`, e.message)
      }
    }
  }

  try {
    const fullContent = useReasoner
      ? await AI_PROVIDER.callReasonerStream(prompt, userInput, options, wrappedOnToken, signal, history)
      : await AI_PROVIDER.callStream(prompt, userInput, options, wrappedOnToken, signal, history)
    const latencyMs = Math.round(performance.now() - t0)
    emitTrace({ agentName, event: 'llm_stream_done', latencyMs, contentLen: fullContent.length, firstTokenLatencyMs, ts: Date.now() })
    return { content: fullContent, latencyMs, firstTokenLatencyMs }
  } catch (e) {
    const latencyMs = Math.round(performance.now() - t0)
    emitTrace({ agentName, event: 'error', latencyMs, error: e.message, ts: Date.now() })
    console.error(`[${agentName}] LLM stream failed after ${latencyMs}ms:`, e.message)
    const err = new Error(`[${agentName}] LLM stream failed: ${e.message}`)
    err.agentName = agentName
    err.latencyMs = latencyMs
    err.cause = e
    throw err
  }
}

// ============================================================
// 3. callLLM 统一助手（v2.0 新增）—— 简化 Agent 内调用
// ============================================================
/**
 * 统一 LLM 调用入口：自动选择流式 / 非流式
 * @param {string} agentName
 * @param {string} prompt
 * @param {string} userInput
 * @param {object} options
 * @param {boolean} useReasoner
 * @param {Function|null} onToken - 若提供则走流式
 * @param {AbortSignal|null} signal
 * @returns {Promise<{content, latencyMs, firstTokenLatencyMs?}>}
 */
export async function callLLM(agentName, prompt, userInput, options = {}, useReasoner = false, onToken = null, signal = null, history = []) {
  if (onToken) {
    return await runLLMStream(agentName, prompt, userInput, options, onToken, useReasoner, signal, history)
  }
  return await runLLM(agentName, prompt, userInput, options, useReasoner, history)
}

// ============================================================
// 4. JSON 抽取（沿用 v1.5）
// ============================================================
export function parseStructured(raw, fallback) {
  if (!raw || typeof raw !== 'string') return { ...fallback }
  const jsonMatch = raw.match(/```json\s*([\s\S]+?)```/) || raw.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    const parsed = safeParseJSON(jsonMatch[1] || jsonMatch[0], null)
    if (parsed) return parsed
  }
  return { ...fallback }
}

// ============================================================
// 5. traceAgent 装饰器（v1.5 + 透传 ctx，v2.0）
// ============================================================
export function traceAgent(agentName, fn) {
  return async function tracedAgent(userInput, profile, ctx) {
    const t0 = performance.now()
    const inputPreview = String(userInput || '').slice(0, 60).replace(/\s+/g, ' ')
    console.log(`[agent.${agentName}] input="${inputPreview}…"`)

    let result
    try {
      result = await fn(userInput, profile, ctx)
      const latencyMs = Math.round(performance.now() - t0)
      const outputLen = (result && result.content) ? String(result.content).length : 0
      console.log(`[agent.${agentName}] output_len=${outputLen} latency=${latencyMs}ms`)
      emitTrace({ agentName, event: 'agent_done', latencyMs, outputLen, ts: Date.now() })
    } catch (e) {
      const latencyMs = Math.round(performance.now() - t0)
      console.error(`[agent.${agentName}] error after ${latencyMs}ms:`, e.message)
      emitTrace({ agentName, event: 'agent_error', latencyMs, error: e.message, ts: Date.now() })
      throw e
    }
    return result
  }
}

// ============================================================
// 6. withRetry 装饰器（v2.0 新增）
// ============================================================
export function withRetry(fn, options = {}) {
  const {
    retries = 1,
    backoff = 500,
    retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'upstream_error', 'first_token_timeout', 'fetch failed'],
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
        if (typeof onRetry === 'function') {
          try { onRetry(attempt + 1, e, delayMs) } catch (_) { /* noop */ }
        }
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
    throw lastErr
  }
}

// ============================================================
// 7. withTimeout 装饰器（v2.0 新增）
// ============================================================
export function withTimeout(fn, ms = 60000, label = 'operation') {
  return async function timedFn(...args) {
    return Promise.race([
      fn(...args),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`AI_SERVICE_ERROR: ${label}_timeout_${ms}ms`)), ms)
      })
    ])
  }
}

// ============================================================
// 8. createAgent 工厂（v2.0 新增）—— 新增 Agent 控制在 100 行内
// ============================================================
/**
 * 创建一个具备 trace + 重试 + 超时 的 Agent
 *
 * @param {object} config
 * @param {string} config.name - agent 标识
 * @param {Function} config.run - 核心逻辑 (userInput, profile, ctx) => Promise<result>
 *        ctx = { onToken, signal, llm, llmStream, llmReasoner, llmReasonerStream, parseStructured, callLLM }
 * @param {object} [config.options]
 * @param {number} [config.options.retries=1]
 * @param {number} [config.options.timeoutMs=60000]
 * @param {number} [config.options.backoff=500]
 *
 * @example
 *   export const myAgent = BaseAgent.create({
 *     name: 'myAgent',
 *     options: { retries: 1, timeoutMs: 60000 },
 *     run: async (userInput, profile, ctx) => {
 *       const { content } = await ctx.callLLM('my prompt', userInput, { temperature: 0.5 })
 *       return { intent: 'my', content }
 *     }
 *   })
 */
function createAgent({ name, run, options = {} } = {}) {
  if (!name || typeof name !== 'string') throw new Error('createAgent: name 必填')
  if (typeof run !== 'function') throw new Error('createAgent: run 必填')
  const {
    retries = 1,
    timeoutMs = 60000,
    backoff = 500
  } = options

  // 组装 ctx 工具方法
  const llm = async (prompt, userInput, opts = {}) =>
    runLLM(name, prompt, userInput, opts, false)
  const llmReasoner = async (prompt, userInput, opts = {}) =>
    runLLM(name, prompt, userInput, opts, true)
  const llmStream = async (prompt, userInput, opts = {}, onToken = null, signal = null) =>
    runLLMStream(name, prompt, userInput, opts, onToken, false, signal)
  const llmReasonerStream = async (prompt, userInput, opts = {}, onToken = null, signal = null) =>
    runLLMStream(name, prompt, userInput, opts, onToken, true, signal)

  // 核心：跑 run，外面包 trace + retry + timeout
  const core = async (userInput, profile, ctx = {}) => {
    const mergedCtx = {
      ...ctx,
      llm, llmReasoner, llmStream, llmReasonerStream,
      parseStructured, callLLM
    }
    return await run(userInput, profile, mergedCtx)
  }

  // 装饰：trace → retry → timeout
  const timed = withTimeout(core, timeoutMs, `agent_${name}`)
  const retried = withRetry(timed, { retries, backoff, onRetry: (a, e, d) => {
    emitTrace({ agentName: name, event: 'retry', attempt: a, error: e.message, delayMs: d, ts: Date.now() })
  } })
  const traced = traceAgent(name, retried)

  // 对外：保留原签名 (userInput, profile)，ctx 通过第 3 参透传
  return async function agentEntry(userInput, profile, ctx) {
    return traced(userInput, profile, ctx)
  }
}

// ============================================================
// BaseAgent 命名空间（v1.5 兼容 + v2.0 增强）
// ============================================================
export const BaseAgent = {
  // v1.5 已有
  runLLM,
  parseStructured,
  traceAgent,
  // v2.0 新增
  runLLMStream,
  callLLM,
  onTrace,
  withRetry,
  withTimeout,
  create: createAgent
}

export default BaseAgent
