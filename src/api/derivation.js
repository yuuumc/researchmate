// ============================================================
// AI 白板推导 - 前端 API 客户端（B2 v1.0 · 一次性 JSON）
// ============================================================
// 调用 /api/derivation 同源代理，一次性获取结构化 JSON
// 返回 { ok, steps, model, provider }
// ============================================================

/**
 * 获取推导（一次性 JSON）
 * @param {string} knowledgePoint - 知识点
 * @param {object} options - { tier, context, signal }
 * @param {string} options.tier - foundational / intermediate / advanced
 * @param {string} options.context - 薄弱上下文
 * @param {AbortSignal} options.signal - 取消信号
 * @returns {Promise<{ ok: boolean, steps: Array, error?: string }>}
 */
export async function fetchDerivation(knowledgePoint, options = {}) {
  const { tier, context, signal } = options

  let response
  try {
    response = await fetch('/api/derivation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledge_point: knowledgePoint, tier, context }),
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

  const data = await response.json()

  if (!data.ok) {
    throw new Error(`DERIVATION_ERROR: ${data.error || 'unknown'}`)
  }

  return data
}
