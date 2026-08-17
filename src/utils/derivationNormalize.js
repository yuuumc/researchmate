// ============================================================
// 推导步骤解析纯函数（B2 · 可契约测试）
// ============================================================
// 将 LLM 流式输出的 markdown 文本解析为结构化步骤数组
// 每步含 index / title / content，content 可直接喂给 MarkdownRenderer
// ============================================================

/**
 * 步骤标题正则：匹配 "### 步骤 N：标题" 或 "### 步骤N: 标题" 等变体
 */
const STEP_HEADER_RE = /^###\s*步骤\s*(\d+)\s*[:：：]\s*(.+)$/gm

/**
 * 将完整推导文本解析为步骤数组
 * @param {string} fullText - LLM 输出的完整 markdown 文本
 * @returns {Array<{index:number, title:string, content:string}>}
 */
export function parseSteps(fullText) {
  if (!fullText || typeof fullText !== 'string') return []

  const text = fullText.trim()
  if (!text) return []

  // 收集所有步骤标题的位置
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

  // 没有匹配到步骤标题 → 整段作为单步
  if (headers.length === 0) {
    return [{
      index: 1,
      title: '推导内容',
      content: text,
    }]
  }

  // 提取每个步骤的内容（从标题结束到下一个标题开始）
  const steps = []
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
    const contentStart = h.headerEnd
    const contentEnd = i + 1 < headers.length ? headers[i + 1].start : text.length
    const rawContent = text.slice(contentStart, contentEnd).trim()
    steps.push({
      index: h.index,
      title: h.title,
      content: rawContent,
    })
  }

  return steps
}

/**
 * 从流式累积文本中提取当前已完成的步骤数
 * 用于 UI 实时显示 "推导中... 第 N 步"
 * @param {string} accumulated - 当前累积的文本
 * @returns {number} 已出现的步骤标题数
 */
export function countSteps(accumulated) {
  if (!accumulated) return 0
  const matches = accumulated.match(STEP_HEADER_RE)
  return matches ? matches.length : 0
}

/**
 * 获取当前正在流式的步骤内容（最后一个步骤标题之后的部分）
 * 用于 UI 实时渲染当前正在生成的步骤
 * @param {string} accumulated - 当前累积的文本
 * @returns {{index:number, title:string, content:string}|null}
 */
export function getCurrentStep(accumulated) {
  if (!accumulated) return null
  const steps = parseSteps(accumulated)
  if (steps.length === 0) return null
  return steps[steps.length - 1]
}

/**
 * 归一化步骤数组（排序、去重、补缺）
 * @param {Array} steps - parseSteps 输出
 * @returns {Array} 归一化后的步骤数组
 */
export function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return []

  // 按 index 排序
  const sorted = [...steps].sort((a, b) => a.index - b.index)

  // 去重（同 index 保留第一个非空 content 的）
  const seen = new Map()
  for (const s of sorted) {
    const key = s.index
    if (!seen.has(key)) {
      seen.set(key, s)
    } else {
      const existing = seen.get(key)
      if (!existing.content && s.content) {
        seen.set(key, s)
      }
    }
  }

  // 重新编号（1, 2, 3...）
  return Array.from(seen.values()).map((s, i) => ({
    index: i + 1,
    title: s.title || `步骤 ${i + 1}`,
    content: s.content || '',
  }))
}

/**
 * 从步骤数组中提取所有 LaTeX 公式（用于校验渲染链路）
 * @param {Array} steps
 * @returns {Array<string>} 公式文本列表
 */
export function extractFormulas(steps) {
  if (!Array.isArray(steps)) return []
  const formulas = []
  for (const s of steps) {
    const content = s.content || ''
    // 行间公式 $$...$$
    const blockMatches = content.match(/\$\$([^$]+)\$\$/g)
    if (blockMatches) formulas.push(...blockMatches)
    // 行内公式 $...$（排除 $$）
    const inlineMatches = content.match(/(?<!\$)\$(?!\$)([^$]+)\$/g)
    if (inlineMatches) formulas.push(...inlineMatches)
  }
  return formulas
}

/**
 * 校验步骤数组是否包含源码残留（LaTeX 未渲染的原始文本）
 * 用于契约测试：parseSteps 输出的 content 应保留 $...$ 标记（由 MarkdownRenderer 渲染）
 * @param {Array} steps
 * @returns {boolean} true = 有公式标记（正常），false = 无公式
 */
export function hasFormulaMarkers(steps) {
  if (!Array.isArray(steps)) return false
  return steps.some(s => {
    const c = s.content || ''
    return /\$[^$]+\$/.test(c)
  })
}

/**
 * 序列化步骤数组为可持久化的 JSON
 * @param {Array} steps
 * @returns {string} JSON 字符串
 */
export function serializeSteps(steps) {
  return JSON.stringify(steps.map(s => ({
    index: s.index,
    title: s.title,
    content: s.content,
  })))
}

/**
 * 反序列化步骤数组
 * @param {string|Array} data - JSON 字符串或数组
 * @returns {Array} 步骤数组
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
  if (!Array.isArray(parsed)) return []
  return parsed.map((s, i) => ({
    index: s.index || i + 1,
    title: s.title || `步骤 ${i + 1}`,
    content: s.content || '',
  }))
}
