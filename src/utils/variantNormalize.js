// ============================================================
// 变式题归一化 + 校验 + prompt 构建（B3 · 可契约测试）
// ============================================================
// 纯函数，不依赖 Vue/Pinia，可在 Node 直接跑
// ============================================================

/**
 * 归一化变式题对象
 * @param {object} raw - LLM 输出的变式题对象
 * @returns {object|null} 归一化后的变式题，或 null（输入无效）
 */
export function normalizeVariant(raw) {
  if (!raw || typeof raw !== 'object') return null

  const stem = String(raw.stem || '').trim()
  if (!stem) return null

  const question_type = String(raw.question_type || '').trim().toLowerCase()
  if (!question_type || !['fill', 'choice'].includes(question_type)) return null

  const correct_answer = String(raw.correct_answer || '').trim()
  if (!correct_answer) return null

  // choice 题必须有 options
  let options = null
  if (question_type === 'choice') {
    if (Array.isArray(raw.options)) {
      options = raw.options.map(o => String(o).trim()).filter(Boolean)
    } else {
      options = []
    }
  }

  return {
    stem,
    question_type,
    options,
    correct_answer,
    explanation: String(raw.explanation || '').trim(),
    knowledge_point: String(raw.knowledge_point || '').trim(),
  }
}

/**
 * 校验变式题
 * @param {object} raw - LLM 输出的变式题对象
 * @param {string} expectedType - 原题题型（'fill' | 'choice'）
 * @returns {{valid:boolean, errors:string[]}}
 */
export function validateVariant(raw, expectedType) {
  const errors = []

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['变式题对象为空'] }
  }

  const normalized = normalizeVariant(raw)
  if (!normalized) {
    return { valid: false, errors: ['变式题归一化失败（缺少必要字段）'] }
  }

  // question_type 一致
  if (normalized.question_type !== expectedType) {
    errors.push(`question_type 不一致：期望 ${expectedType}，实际 ${normalized.question_type}`)
  }

  // correct_answer 非空
  if (!normalized.correct_answer) {
    errors.push('correct_answer 为空')
  }

  // choice 题校验 options
  if (normalized.question_type === 'choice') {
    if (!Array.isArray(normalized.options) || normalized.options.length !== 4) {
      errors.push(`choice 题 options 长度应为 4，实际 ${normalized.options?.length || 0}`)
    }
    // correct_answer 必须是 ABCD
    if (!/^[A-D]$/.test(normalized.correct_answer)) {
      errors.push(`choice 题 correct_answer 应为 A/B/C/D，实际 "${normalized.correct_answer}"`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 从 LLM 输出文本中提取变式题 JSON
 * @param {string} content - LLM 完整输出
 * @returns {Array<object>} 变式题数组
 */
export function extractVariants(content) {
  if (!content || typeof content !== 'string') return []

  // 尝试解析 JSON
  let parsed = null

  // 1. 尝试直接 JSON.parse
  try {
    parsed = JSON.parse(content)
  } catch (_) {
    // 2. 尝试从 ```json 围栏提取
    const match = content.match(/```json\s*\n([\s\S]*?)\n```/)
    if (match) {
      try { parsed = JSON.parse(match[1].trim()) } catch (_) {}
    }
    // 3. 尝试裸 JSON 提取（平衡括号）
    if (!parsed) {
      const lastClose = content.lastIndexOf('}')
      if (lastClose !== -1) {
        let depth = 0
        let start = -1
        for (let i = lastClose; i >= 0; i--) {
          if (content[i] === '}') depth++
          else if (content[i] === '{') {
            depth--
            if (depth === 0) { start = i; break }
          }
        }
        if (start !== -1) {
          try { parsed = JSON.parse(content.slice(start, lastClose + 1)) } catch (_) {}
        }
      }
    }
  }

  if (!parsed) return []
  const variants = parsed.variant_questions || parsed.variants || []
  if (!Array.isArray(variants)) return []

  return variants
    .map(v => normalizeVariant(v))
    .filter(Boolean)
}

/**
 * 构建变式题生成 prompt（从提示词工程师交付的模板）
 * @param {object} params - { original_stem, knowledge_point, question_type, correct_answer, variant_count }
 * @returns {string} 完整 prompt
 */
export function buildVariantPrompt(params) {
  const {
    original_stem = '',
    knowledge_point = '',
    question_type = '',
    correct_answer = '',
    variant_count = 1,
  } = params

  return `你是一名「半导体物理与器件」考研命题专家。你的任务：根据一道原题，生成 ${variant_count} 道考查**同一知识点**的变式题，供学生巩固练习。

## 输入

- 原题题干：${original_stem}
- 知识点：${knowledge_point}
- 题型：${question_type}（choice=选择题 / fill=填空题）
- 原题正确答案：${correct_answer}
- 生成数量：${variant_count}

## 变式要求

1. **同知识点**：变式题考查的知识点与原题一致，且必须属于考纲白名单。不得引入白名单外的知识点。
2. **非复述**：至少使用以下一种变换——①换材料或器件情境（如 Si↔Ge↔GaAs）；②换数值参数；③换设问角度。禁止仅做同义改写。
3. **同题型**：输出的 question_type 必须与原题完全相同。
4. **答案与解析**：每题给出确定无误的 correct_answer 与 explanation。

## 题型专属规则

- **fill（填空题）**：correct_answer 必须是唯一确定的数值或唯一短语；题干条件必须足以严格推出该答案。
- **choice（选择题）**：提供且仅提供 4 个选项；correct_answer 为正确选项的字母（单个大写字母 A/B/C/D）。

## 输出格式

只输出一个 JSON 对象：第一个字符是 \`{\`，最后一个字符是 \`}\`。不输出任何解释或 markdown 代码围栏。

JSON 结构：
{"variant_questions":[{"stem":"题干","question_type":"${question_type}","options":["A. ...","B. ...","C. ...","D. ..."],"correct_answer":"...","explanation":"...","knowledge_point":"${knowledge_point}"}]}

fill 题的 options 字段输出 null。

## 现在开始

原题题干：${original_stem}
知识点：${knowledge_point}
题型：${question_type}
正确答案：${correct_answer}
生成数量：${variant_count}`
}

/**
 * 生成变式题的唯一 ID
 * @returns {string}
 */
export function generateVariantId() {
  return `var-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
