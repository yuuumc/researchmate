// ============================================================
// AI 白板推导 - 前端 API 客户端（B2 · SSE 流式）
// ============================================================
// 调用 /api/derivation 同源代理，解析 SSE 流
// 与 deepseek.js 的 callDeepSeekStream 模式一致
// B5: 完成后写 agent_traces（fire-and-forget）
// ============================================================

import { recordAgentTrace } from '@/services/agentTrace'

/**
 * 流式推导
 * @param {string} knowledgePoint - 知识点
 * @param {object} options - { onToken, onStep, signal }
 * @param {(chunk:{delta:string}) => void} options.onToken - 每个 token 回调
 * @param {(stepCount:number, currentStep:object|null) => void} options.onStep - 步骤变化回调
 * @param {AbortSignal} options.signal - 取消信号
 * @returns {Promise<string>} 完整推导文本
 */
export async function streamDerivation(knowledgePoint, options = {}) {
  const { onToken, onStep, signal } = options

  const url = '/api/derivation'

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledge_point: knowledgePoint }),
      signal,
    })
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('DERIVATION_ERROR: aborted_by_caller')
    }
    console.error('[derivation] fetch failed:', e.message)
    throw new Error(`DERIVATION_ERROR: ${e.message}`)
  }

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`
    try {
      const errJson = await response.json()
      errMsg = errJson.error || errMsg
    } catch (_) {}
    console.error('[derivation] HTTP error:', errMsg)
    throw new Error(`DERIVATION_ERROR: ${errMsg}`)
  }

  if (!response.body) {
    throw new Error('DERIVATION_ERROR: no_response_body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let totalContent = ''
  let lastStepCount = 0

  // 动态导入解析函数（避免 Vite 预打包问题）
  const { countSteps, getCurrentStep } = await import('@/utils/derivationNormalize')

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
            recordAgentTrace({ agent_role: 'tutor', action: 'derivation', input: { knowledge_point: knowledgePoint }, output: { content: totalContent.slice(0, 800) }, status: 'done' })
            return totalContent
          }
          try {
            const parsed = JSON.parse(payload)
            if (parsed.error) {
              throw new Error(`DERIVATION_ERROR: ${parsed.error} - ${parsed.message || ''}`)
            }
            const delta = parsed.choices?.[0]?.delta?.content || ''
            if (delta) {
              totalContent += delta
              if (typeof onToken === 'function') {
                try { onToken({ delta }) } catch (_) {}
              }
              // 检测步骤变化
              const stepCount = countSteps(totalContent)
              if (stepCount !== lastStepCount) {
                lastStepCount = stepCount
                if (typeof onStep === 'function') {
                  try {
                    onStep(stepCount, getCurrentStep(totalContent))
                  } catch (_) {}
                }
              }
            }
          } catch (parseErr) {
            if (parseErr.message?.startsWith('DERIVATION_ERROR:')) {
              throw parseErr
            }
          }
        }
      }
    }
    recordAgentTrace({ agent_role: 'tutor', action: 'derivation', input: { knowledge_point: knowledgePoint }, output: { content: totalContent.slice(0, 800) }, status: 'done' })
    return totalContent
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('DERIVATION_ERROR: aborted_by_caller')
    }
    throw e
  } finally {
    try { reader.releaseLock() } catch (_) {}
  }
}
