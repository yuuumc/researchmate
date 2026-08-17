// ============================================================
// 变式题生成 - 前端 API 客户端（B3）
// B5: 完成后写 agent_traces（fire-and-forget）
// ============================================================

import { recordAgentTrace } from '@/services/agentTrace'

import { extractVariants, validateVariant, normalizeVariant, generateVariantId } from '@/utils/variantNormalize'

/**
 * 生成变式题
 * @param {object} params - { original_stem, knowledge_point, question_type, correct_answer, variant_count }
 * @returns {Promise<Array<object>>} 变式题数组
 */
export async function generateVariant(params) {
  const {
    original_stem,
    knowledge_point,
    question_type,
    correct_answer,
    variant_count = 1,
  } = params

  if (!original_stem || !knowledge_point || !question_type || !correct_answer) {
    throw new Error('VARIANT_ERROR: missing_params')
  }

  let response
  try {
    response = await fetch('/api/variant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        original_stem,
        knowledge_point,
        question_type,
        correct_answer,
        variant_count,
      }),
    })
  } catch (e) {
    console.error('[variant] fetch failed:', e.message)
    throw new Error(`VARIANT_ERROR: ${e.message}`)
  }

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`
    try {
      const errJson = await response.json()
      errMsg = errJson.error || errMsg
    } catch (_) {}
    throw new Error(`VARIANT_ERROR: ${errMsg}`)
  }

  const data = await response.json()

  if (data.error && data.variants.length === 0) {
    throw new Error(`VARIANT_ERROR: ${data.error} - ${data.message || ''}`)
  }

  // 校验 + 归一化 + 加 ID
  const variants = (data.variants || []).map(v => {
    const normalized = normalizeVariant(v) || v
    const validation = validateVariant(normalized, question_type)
    return {
      ...normalized,
      id: generateVariantId(),
      _valid: validation.valid,
      _errors: validation.errors,
    }
  })

  recordAgentTrace({
    agent_role: 'practice',
    action: 'variant',
    input: { knowledge_point, question_type, variant_count },
    output: { content: `Generated ${variants.length} variants for ${knowledge_point}` },
    status: 'done'
  })
  return variants
}
