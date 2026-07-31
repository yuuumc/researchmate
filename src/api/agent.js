// ============================================================
// Agent API 客户端（v3.1 前端集成）
// ============================================================
// 统一封装 POST /api/agent 调用，供 stores 和组件使用
// 响应体结构：{ status, agent, content, structured, provider, usage }
//   content: Markdown 文本
//   structured: JSON 对象（可能为 null）
// ============================================================

import axios from 'axios'

const client = axios.create({
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000
})

/**
 * 调用 Agent API
 * @param {string} action - diagnose|plan|practice|tutor|career|peer
 * @param {object} input - 对应 agent 的输入参数
 * @returns {Promise<{ status, agent, content, structured, provider, usage }>}
 */
export async function callAgent(action, input = {}) {
  const { data } = await client.post('/api/agent', { action, input })
  if (data.error) {
    throw new Error('AGENT_ERROR: ' + data.error)
  }
  return data
}

/**
 * 流式聊天（带 mode 支持）
 * 直接调 /api/chat，绕过前端 intent 路由（mode 已明确指定 Agent）
 * @param {string} userInput
 * @param {object} opts - { mode, profile, onToken, signal }
 * @returns {Promise<string>} 完整回复
 */
export async function callChatWithMode(userInput, opts = {}) {
  const { mode, profile = {}, onToken = null, signal = null } = opts

  const body = { userInput, options: { stream: true } }
  if (mode) {
    body.mode = mode
    body.profile = profile
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
