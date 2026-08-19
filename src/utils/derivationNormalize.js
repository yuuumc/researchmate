// ============================================================
// 推导步骤解析纯函数（B2 v1.0 · 结构化 JSON）
// ============================================================
// 将 LLM 返回的结构化 JSON 解析为步骤数组
// 每步含 index / title / text / formulas / figure / key_insight
// 步骤可转为 markdown 喂给 MarkdownRenderer 渲染
// ============================================================

/**
 * 解析 LLM 返回的 JSON 为步骤数组
 * @param {string|object} data - JSON 字符串或已解析对象
 * @returns {Array<{index:number, title:string, text:string, formulas:Array, figure:object|null, key_insight:string}>}
 */
export function parseDerivationJSON(data) {
  let parsed = data
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data)
    } catch {
      return []
    }
  }
  if (!parsed || typeof parsed !== 'object') return []
  if (!Array.isArray(parsed.steps)) return []

  return parsed.steps.map((s, i) => ({
    index: i + 1,
    title: s.title || `步骤 ${i + 1}`,
    text: s.text || '',
    formulas: Array.isArray(s.formulas) ? s.formulas.filter(f => typeof f === 'string' && f.trim()) : [],
    figure: s.figure || null,
    key_insight: s.key_insight || '',
  }))
}

/**
 * 将结构化步骤转为 markdown 字符串（供 MarkdownRenderer 渲染）
 * @param {object} step - { title, text, formulas, figure, key_insight }
 * @returns {string} markdown 字符串
 */
export function stepToMarkdown(step) {
  if (!step) return ''
  const parts = []

  // 标题
  if (step.title) {
    parts.push(`### ${step.title}`)
    parts.push('')
  }

  // 说明文字
  if (step.text) {
    parts.push(step.text)
    parts.push('')
  }

  // 公式（行间 $$...$$）
  if (step.formulas && step.formulas.length > 0) {
    for (const f of step.formulas) {
      const trimmed = (f || '').trim()
      if (trimmed) {
        parts.push(`$$${trimmed}$$`)
        parts.push('')
      }
    }
  }

  // 图件（svg-spec 围栏）
  if (step.figure && typeof step.figure === 'object') {
    try {
      const json = JSON.stringify(step.figure)
      parts.push('```svg-spec')
      parts.push(json)
      parts.push('```')
      parts.push('')
    } catch (_) {
      // JSON 序列化失败，跳过图件
    }
  }

  // 关键洞见
  if (step.key_insight) {
    parts.push(`> **关键洞见**：${step.key_insight}`)
  }

  return parts.join('\n').trim()
}

/**
 * 校验步骤数组是否满足 B2 验收口径
 * @param {Array} steps
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
export function validateStepStructure(steps) {
  const errors = []
  if (!Array.isArray(steps)) {
    return { valid: false, errors: ['steps_not_array'] }
  }
  if (steps.length < 3 || steps.length > 8) {
    errors.push(`step_count_${steps.length}_out_of_range_3_8`)
  }
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (!s.formulas?.length && !s.figure) {
      errors.push(`step_${i + 1}_no_formula_or_figure`)
    }
  }
  return { valid: errors.length === 0, errors }
}

// ============================================================
// 兼容旧版：从 markdown 文本解析步骤（历史数据回放用）
// ============================================================

const STEP_HEADER_RE = /^###\s*步骤\s*(\d+)\s*[:：：]\s*(.+)$/gm

/**
 * 旧版 markdown 解析（兼容历史数据）
 * @param {string} fullText
 * @returns {Array<{index:number, title:string, text:string, formulas:[], figure:null, key_insight:''}>}
 */
export function parseSteps(fullText) {
  if (!fullText || typeof fullText !== 'string') return []
  const text = fullText.trim()
  if (!text) return []

  const headers = []
  let match
  const re = new RegExp(STEP_HEADER_RE.source, 'gm')
  while ((match = re.exec(text)) !== null) {
    headers.push({
      index: parseInt(match[1], 10),
      title: match[2].trim(),
      start: match.index,
      headerEnd: match.index + match[0].length,
    })
  }

  if (headers.length === 0) {
    return [{
      index: 1,
      title: '推导内容',
      text: text,
      formulas: [],
      figure: null,
      key_insight: '',
    }]
  }

  return headers.map((h, i) => {
    const contentEnd = i + 1 < headers.length ? headers[i + 1].start : text.length
    const rawContent = text.slice(h.headerEnd, contentEnd).trim()
    return {
      index: h.index,
      title: h.title,
      text: rawContent,
      formulas: [],
      figure: null,
      key_insight: '',
    }
  })
}

/**
 * 归一化步骤数组（排序、补 index）
 */
export function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return []
  return steps.map((s, i) => ({
    index: s.index || i + 1,
    title: s.title || `步骤 ${i + 1}`,
    text: s.text || s.content || '',
    formulas: s.formulas || [],
    figure: s.figure || null,
    key_insight: s.key_insight || '',
  }))
}

/**
 * 序列化步骤数组为可持久化的 JSON
 */
export function serializeSteps(steps) {
  return JSON.stringify(steps.map(s => ({
    index: s.index,
    title: s.title,
    text: s.text,
    formulas: s.formulas || [],
    figure: s.figure || null,
    key_insight: s.key_insight || '',
  })))
}

/**
 * 反序列化步骤数组（兼容新结构化 JSON 和旧 markdown 格式）
 */
export function deserializeSteps(data) {
  if (!data) return []
  let parsed = data
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data)
    } catch {
      return []
    }
  }

  // 新格式：数组 of { index, title, text, formulas, figure, key_insight }
  if (Array.isArray(parsed)) {
    return normalizeSteps(parsed)
  }

  // 新格式：{ steps: [...] }
  if (parsed && Array.isArray(parsed.steps)) {
    return normalizeSteps(parsed.steps)
  }

  return []
}
