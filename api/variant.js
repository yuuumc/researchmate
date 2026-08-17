// ============================================================
// Vercel serverless function - 变式题生成（B3）
// ============================================================
// POST /api/variant
// Body: { original_stem, knowledge_point, question_type, correct_answer, variant_count? }
// Response: { variants: [{ stem, question_type, options, correct_answer, explanation, knowledge_point }] }
//
// 复用 chat.js 的 LLM provider 抽象 + CORS + 限流中间件
// ============================================================

import { getProviderConfig, validateProviderConfig } from './llm-provider.js'
import { applyCors, getClientIp, checkRateLimit, RATE_LIMIT_WINDOW_MS } from './_middleware.js'

const DEFAULT_MAX_DURATION_MS = 55000

// 知识点白名单（与 B2/B3 一致）
const KNOWLEDGE_WHITELIST = [
  '载流子统计', '载流子输运', 'PN结', 'MOS结构', 'MOSFET',
  '本征载流子浓度', '掺杂载流子浓度', '费米能级',
  '漂移', '扩散', '迁移率', '电导率',
  '内建电势', '耗尽层', '伏安特性', '电容',
  '能带', '阈值电压', 'C-V特性',
  'I-V特性', '跨导', '亚阈值特性',
]

function isKnowledgeAllowed(kp) {
  if (!kp || typeof kp !== 'string') return false
  return KNOWLEDGE_WHITELIST.some(w => kp.toLowerCase().includes(w.toLowerCase()))
}

export default async function handler(req, res) {
  if (!applyCors(req, res, '[api/variant]')) return

  const clientIp = getClientIp(req)
  if (!checkRateLimit(clientIp)) {
    res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)))
    return res.status(429).json({ error: 'rate_limited' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const { original_stem, knowledge_point, question_type, correct_answer, variant_count = 1 } = req.body || {}

  // 参数校验
  if (!original_stem || !knowledge_point || !question_type || !correct_answer) {
    return res.status(400).json({ error: 'missing_params', message: '需要 original_stem, knowledge_point, question_type, correct_answer' })
  }

  if (!['fill', 'choice'].includes(question_type)) {
    return res.status(400).json({ error: 'invalid_question_type', message: 'question_type 必须为 fill 或 choice' })
  }

  if (!isKnowledgeAllowed(knowledge_point)) {
    return res.status(400).json({ error: 'knowledge_point_not_allowed', message: '知识点不在白名单内' })
  }

  // LLM provider 配置
  const providerConfig = getProviderConfig()
  const { valid, error: providerError } = validateProviderConfig(providerConfig)
  if (!valid) {
    return res.status(500).json({ error: 'provider_not_configured', message: providerError })
  }

  // 构建 prompt
  const prompt = buildVariantPrompt({ original_stem, knowledge_point, question_type, correct_answer, variant_count })

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DEFAULT_MAX_DURATION_MS)

    const r = await fetch(providerConfig.chatUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: providerConfig.model,
        messages: [
          { role: 'system', content: '你是半导体物理与器件考研命题专家。严格按 JSON 格式输出，不要输出任何其他内容。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        stream: false,
      }),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!r.ok) {
      const errText = await r.text()
      console.error(`[api/variant] upstream error:`, r.status, errText)
      return res.status(502).json({ error: 'upstream_error', status: r.status })
    }

    const data = await r.json()
    const content = data.choices?.[0]?.message?.content || ''

    // 解析变式题
    const variants = extractVariants(content)

    if (variants.length === 0) {
      // LLM 输出无法解析
      return res.status(200).json({
        variants: [],
        error: 'parse_failed',
        message: 'LLM 输出无法解析为变式题',
        raw_content: content.slice(0, 500),
      })
    }

    // 校验每个变式题
    const validated = variants.map(v => {
      const result = validateVariant(v, question_type)
      return { ...v, _valid: result.valid, _errors: result.errors }
    })

    return res.status(200).json({
      variants: validated,
      model: data.model || providerConfig.model,
      provider: providerConfig.provider,
    })
  } catch (e) {
    console.error('[api/variant] failed:', e)
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'timeout' })
    }
    return res.status(502).json({ error: 'upstream_error', message: e.message })
  }
}

// ---- 内联工具函数（避免 import 路径问题） ----

function buildVariantPrompt(params) {
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

1. **同知识点**：变式题考查的知识点与原题一致，且必须属于考纲白名单。
2. **非复述**：至少使用一种变换——换材料/情境、换数值参数、换设问角度。
3. **同题型**：输出的 question_type 必须与原题完全相同。
4. **答案与解析**：每题给出确定无误的 correct_answer 与 explanation。

## 题型专属规则

- **fill**：correct_answer 必须是唯一确定的数值或短语。
- **choice**：提供 4 个选项；correct_answer 为 A/B/C/D。

## 输出格式

只输出一个 JSON 对象，第一个字符是 \`{\`，最后一个字符是 \`}\`。不输出 markdown 围栏或多余文字。

{"variant_questions":[{"stem":"题干","question_type":"${question_type}","options":["A. ...","B. ...","C. ...","D. ..."],"correct_answer":"...","explanation":"...","knowledge_point":"${knowledge_point}"}]}

fill 题的 options 输出 null。

## 现在开始

原题题干：${original_stem}
知识点：${knowledge_point}
题型：${question_type}
正确答案：${correct_answer}
生成数量：${variant_count}`
}

function extractVariants(content) {
  if (!content || typeof content !== 'string') return []

  let parsed = null

  try {
    parsed = JSON.parse(content)
  } catch (_) {
    const match = content.match(/```json\s*\n([\s\S]*?)\n```/)
    if (match) {
      try { parsed = JSON.parse(match[1].trim()) } catch (_) {}
    }
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

  return variants.map(v => {
    if (!v || typeof v !== 'object') return null
    const stem = String(v.stem || '').trim()
    const question_type = String(v.question_type || '').trim().toLowerCase()
    const correct_answer = String(v.correct_answer || '').trim()
    if (!stem || !question_type || !correct_answer) return null
    return {
      stem,
      question_type,
      options: question_type === 'choice' ? (Array.isArray(v.options) ? v.options.map(o => String(o).trim()) : []) : null,
      correct_answer,
      explanation: String(v.explanation || '').trim(),
      knowledge_point: String(v.knowledge_point || '').trim(),
    }
  }).filter(Boolean)
}

function validateVariant(raw, expectedType) {
  const errors = []
  if (!raw) return { valid: false, errors: ['变式题为空'] }

  if (raw.question_type !== expectedType) {
    errors.push(`question_type 不一致：期望 ${expectedType}，实际 ${raw.question_type}`)
  }
  if (!raw.correct_answer) {
    errors.push('correct_answer 为空')
  }
  if (raw.question_type === 'choice') {
    if (!Array.isArray(raw.options) || raw.options.length !== 4) {
      errors.push(`options 长度应为 4，实际 ${raw.options?.length || 0}`)
    }
    if (!/^[A-D]$/.test(raw.correct_answer)) {
      errors.push(`correct_answer 应为 A/B/C/D`)
    }
  }
  return { valid: errors.length === 0, errors }
}
