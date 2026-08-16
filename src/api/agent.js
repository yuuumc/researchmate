// ============================================================
// Agent API 客户端（v3.1 前端集成 + B5 trace 落库）
// ============================================================
// 统一封装 POST /api/agent 调用，供 stores 和组件使用
// 响应体结构：{ status, agent, content, structured, provider, usage }
//   content: Markdown 文本
//   structured: JSON 对象（可能为 null）
//
// B5：每次 Agent 调用返回后，客户端落 trace 到 agent_traces 表（RLS owner），
//   供 /architecture 架构看板只读展示。fire-and-forget，不影响主流程。
// ============================================================

import axios from 'axios'
import { recordAgentTrace, fetchAgentTraces as fetchTracesFromDB } from '@/services/agentTrace'

const client = axios.create({
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000
})

/**
 * 调用 Agent API
 * @param {string} action - diagnose|plan|practice|tutor|career|peer|research
 * @param {object} input - 对应 agent 的输入参数
 * @returns {Promise<{ status, agent, content, structured, provider, usage }>}
 */
export async function callAgent(action, input = {}) {
  try {
    const { data } = await client.post('/api/agent', { action, input })
    if (data.error) {
      // 落 error trace（不阻塞抛错）
      recordAgentTrace({
        agent_role: action, action, input,
        output: { error: data.error },
        status: 'error',
      })
      throw new Error('AGENT_ERROR: ' + data.error)
    }
    // 落 done trace（fire-and-forget）
    recordAgentTrace({
      agent_role: action,
      action,
      input,
      output: { content: data.content, structured: data.structured },
      usage: data.usage,
      status: 'done',
    })
    return data
  } catch (e) {
    // 非业务错误（网络/超时）也落一条 error trace
    if (e?.message && !e.message.startsWith('AGENT_ERROR')) {
      recordAgentTrace({
        agent_role: action, action, input,
        output: { error: e.message },
        status: 'error',
      })
    }
    throw e
  }
}

/**
 * 流式聊天（带 mode 支持）
 * 直接调 /api/chat，绕过前端 intent 路由（mode 已明确指定 Agent）
 * @param {string} userInput
 * @param {object} opts - { mode, profile, onToken, signal }
 * @returns {Promise<string>} 完整回复
 */
export async function callChatWithMode(userInput, opts = {}) {
  const { mode, profile = {}, onToken = null, signal = null, history = [] } = opts

  const body = { userInput, options: { stream: true } }
  if (mode) {
    body.mode = mode
    body.profile = profile
  }
  if (Array.isArray(history) && history.length > 0) {
    body.history = history
  }

  // 默认 60s 超时，外部 signal 可覆盖
  const controller = signal ? null : new AbortController()
  const timeoutId = controller ? setTimeout(() => controller.abort(), 60000) : null
  const fetchSignal = signal || (controller ? controller.signal : undefined)

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: fetchSignal
    })

    if (!response.ok) {
      let errMsg = 'HTTP ' + response.status
      try {
        const errJson = await response.json()
        errMsg = errJson.error || errMsg
      } catch (_) { /* noop */ }
      throw new Error('AI_SERVICE_ERROR: ' + errMsg)
    }

    if (!response.body) {
      // 降级：非流式
      const data = await response.json()
      return data.content || ''
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let totalContent = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''

        for (const evt of events) {
          const lines = evt.split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data:')) continue
            const payload = trimmed.slice(5).trim()
            if (payload === '[DONE]') return totalContent
            try {
              const parsed = JSON.parse(payload)
              if (parsed.error) {
                throw new Error('AI_SERVICE_ERROR: ' + parsed.error)
              }
              const delta = parsed.choices?.[0]?.delta?.content || ''
              if (delta) {
                totalContent += delta
                if (typeof onToken === 'function') {
                  try { onToken({ delta }) } catch (e) { console.warn('[callChatWithMode] onToken error:', e) }
                }
              }
            } catch (parseErr) {
              if (parseErr.message?.startsWith('AI_SERVICE_ERROR:')) throw parseErr
            }
          }
        }
      }
      return totalContent
    } finally {
      try { reader.releaseLock() } catch (_) { /* noop */ }
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}


// ============================================================
// B5 架构看板：真实 Agent trace 只读查询
// 数据源：agent_traces 表（前端 callAgent / callResearchAgent 落库，RLS owner）
// 返回结构：{ traces: [{ id, agent_role, action, input_summary,
//   output_summary, tool_calls_trace, usage, status, created_at }] }
// 鉴权：RLS — supabase 客户端用当前用户 session，auth.uid() = user_id 自动过滤。
// ============================================================

/**
 * 拉取真实 Agent 调用记录（只读，仅本人）
 * @param {object} opts - { limit = 50 }
 * @returns {Promise<{ traces: Array }>}
 */
export async function fetchAgentTraces(opts = {}) {
  const { limit = 50 } = opts
  const result = await fetchTracesFromDB(limit)
  if (result.error) {
    throw new Error('AGENT_TRACES_ERROR: ' + result.error)
  }
  return result
}
