// ============================================================
// DeepSeek API 前端封装（v2.0 SSE 流式版）
// ============================================================
// 模式：
//   - callDeepSeek(prompt, userInput, options) → Promise<string>（v1.5 JSON 模式，向后兼容）
//   - callDeepSeekStream(prompt, userInput, options, onToken) → Promise<string>（v2.0 SSE 模式）
//   - callDeepSeekReasoner(...) → reasoner 模型（用于 4 层根因）
//   - callDeepSeekReasonerStream(...) → reasoner 流式
//
// 安全：前端只调 /api/chat 同源代理，不持有 API Key
// ============================================================

import axios from 'axios'

/**
 * v2.5.1 defensive: .env 里把 SUPABASE_ANON_KEY 误填到 VITE_API_BASE 是经典坑——
 * anon key 是 JWT（eyJ 开头），拼到 URL 路径上 Vite 中间件会 404。
 * 这里统一检测：发现 JWT 就 warn + 当成空串处理。
 */
function resolveBaseURL() {
  const raw = (import.meta.env.VITE_API_BASE || '').trim()
  if (raw.startsWith('eyJ')) {
    console.warn('[deepseek] VITE_API_BASE 看起来像 JWT（可能是 SUPABASE_ANON_KEY 错填到这一行），已忽略。请清空 VITE_API_BASE。')
    return ''
  }
  return raw
}

const client = axios.create({
  baseURL: resolveBaseURL(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000
})

/**
 * JSON 模式（v1.5 兼容路径）
 * @returns {Promise<string>} 模型回复内容
 */
export async function callDeepSeek(prompt, userInput, options = {}, history = []) {
  const {
    model = 'deepseek-chat',
    temperature = 0.7,
    max_tokens = 2000
  } = options

  try {
    const { data } = await client.post('/api/chat', {
      prompt,
      userInput,
      options: { model, temperature, max_tokens },
      history
    })
    return data.content
  } catch (e) {
    const msg = e.response?.data?.error || e.message || 'unknown_error'
    console.error('[deepseek] call failed:', msg)
    throw new Error(`AI_SERVICE_ERROR: ${msg}`)
  }
}

/**
 * Reasoner 模型（JSON 模式）
 */
export async function callDeepSeekReasoner(prompt, userInput, options = {}, history = []) {
  return callDeepSeek(prompt, userInput, { ...options, model: 'deepseek-reasoner' }, history)
}

// ============================================================
// SSE 流式（v2.0 新增）
// ============================================================

/**
 * SSE 流式调用（v2.0 新增）
 * @param {string} prompt - system prompt
 * @param {string} userInput - 用户输入
 * @param {object} options - { model, temperature, max_tokens }
 * @param {(chunk: {delta: string, latencyMs: number}) => void} onToken - 每个 token 片段回调
 * @param {object} signal - AbortController.signal（用于取消）
 * @returns {Promise<string>} 完整内容
 */
export async function callDeepSeekStream(prompt, userInput, options = {}, onToken = null, signal = null, history = []) {
  const {
    model = 'deepseek-chat',
    temperature = 0.7,
    max_tokens = 2000
  } = options

  // 基础 URL：与 JSON 模式一致（同源 /api/chat 代理）
  // v2.5.2 defensive: 走 resolveBaseURL() 避免 .env 把 anon key 误填到这里导致 404
  const baseURL = resolveBaseURL()
  const url = `${baseURL}/api/chat`

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        userInput,
        options: { model, temperature, max_tokens, stream: true },
        history
      }),
      signal
    })
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('AI_SERVICE_ERROR: aborted_by_caller')
    }
    console.error('[deepseek] stream fetch failed:', e.message)
    // 降级：非流式
    console.warn('[deepseek] stream 降级为非流式')
    return await callDeepSeek(prompt, userInput, options, history)
  }

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`
    try {
      const errJson = await response.json()
      errMsg = errJson.error || errMsg
    } catch (_) { /* noop */ }
    console.error('[deepseek] stream HTTP error:', errMsg)
    throw new Error(`AI_SERVICE_ERROR: ${errMsg}`)
  }

  if (!response.body) {
    console.warn('[deepseek] 无 response.body，降级为非流式')
    return await callDeepSeek(prompt, userInput, options, history)
  }

  // 解析 SSE 流
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let totalContent = ''
  let firstTokenAt = null

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
          if (payload === '[DONE]') {
            return totalContent
          }
          try {
            const parsed = JSON.parse(payload)
            // 错误事件
            if (parsed.error) {
              throw new Error(`AI_SERVICE_ERROR: ${parsed.error} - ${parsed.message || ''}`)
            }
            // token 增量
            const delta = parsed.choices?.[0]?.delta?.content || ''
            if (delta) {
              if (firstTokenAt === null) firstTokenAt = Date.now()
              totalContent += delta
              if (typeof onToken === 'function') {
                try {
                  onToken({ delta, latencyMs: Date.now() - (firstTokenAt || Date.now()) })
                } catch (cbErr) {
                  console.error('[deepseek] onToken 回调异常:', cbErr.message)
                }
              }
            }
          } catch (parseErr) {
            if (parseErr.message?.startsWith('AI_SERVICE_ERROR:')) {
              throw parseErr
            }
            // 忽略心跳等非 JSON 行
          }
        }
      }
    }
    return totalContent
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('AI_SERVICE_ERROR: aborted_by_caller')
    }
    throw e
  } finally {
    try { reader.releaseLock() } catch (_) { /* noop */ }
  }
}

/**
 * Reasoner 模型（流式）
 */
export async function callDeepSeekReasonerStream(prompt, userInput, options = {}, onToken = null, signal = null, history = []) {
  return callDeepSeekStream(prompt, userInput, { ...options, model: 'deepseek-reasoner' }, onToken, signal, history)
}
