// ============================================================
// Vercel serverless function - AI 白板推导（B2 v1.0 · 一次性 JSON）
// ============================================================
// POST /api/derivation
// Body: { knowledge_point: string, tier?: string, context?: string }
// Response: { ok: true, steps: [...] } | { ok: false, error: string }
//
// 复用 llm-provider / prompt-loader / _middleware（CORS + 限流）
// 推导 prompt 从 prompts/derivation.md 加载
// ============================================================

import { getProviderConfig, validateProviderConfig } from './llm-provider.js'
import { loadPrompt, substitute } from '../lib/prompt-loader.js'
import { applyCors, getClientIp, checkRateLimit, RATE_LIMIT_WINDOW_MS } from './_middleware.js'

const REQUEST_TIMEOUT_MS = 55000 // Vercel Hobby 60s 留余量

// 知识点白名单（与 prompt 一致，服务端校验）
const KNOWLEDGE_WHITELIST = [
  '载流子统计', '载流子输运', 'PN结', 'MOS结构', 'MOSFET',
  '本征载流子浓度', '掺杂载流子浓度', '费米能级',
  '漂移', '扩散', '迁移率', '电导率',
  '内建电势', '耗尽层', '伏安特性', '电容',
  '能带', '阈值电压', 'C-V特性',
  'I-V特性', '跨导', '亚阈值特性',
  '单级放大器',
]

// svg-spec figure 白名单
const FIGURE_TYPES = ['circuit', 'waveform', 'band', 'structure']
const FIGURE_TEMPLATES = [
  'diode-rectifier', 'bridge-rectifier', 'rc-lowpass', 'voltage-divider',
  'common-source', 'cmos-inverter', 'opamp-inverting', 'opamp-noninverting',
  'sine', 'piecewise-linear', 'energy-band', 'mos-cross-section',
]

function isKnowledgeAllowed(kp) {
  if (!kp || typeof kp !== 'string') return false
  return KNOWLEDGE_WHITELIST.some(w => kp.includes(w))
}

/**
 * 从 LLM 响应文本中提取 JSON 对象
 * 处理：去围栏 ```json...```、截取首个 { 到末尾 }、JSON.parse
 */
function extractJsonObject(text) {
  if (!text || typeof text !== 'string') return null
  let s = text.trim()

  // 去除 markdown 代码围栏
  s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')

  // 截取首个 { 到最后一个 }
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) return null

  const jsonStr = s.slice(first, last + 1)

  try {
    return JSON.parse(jsonStr)
  } catch {
    return null
  }
}

/**
 * 校验步骤数组
 * @returns {{ valid: boolean, steps: Array, error?: string }}
 */
function validateSteps(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, steps: [], error: 'invalid_response' }
  }

  const steps = parsed.steps
  if (!Array.isArray(steps)) {
    return { valid: false, steps: [], error: 'no_steps_array' }
  }

  if (steps.length < 3 || steps.length > 8) {
    return { valid: false, steps: [], error: 'step_count_out_of_range' }
  }

  let figureCount = 0
  const validated = []

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (!s || typeof s !== 'object') {
      return { valid: false, steps: [], error: `step_${i}_invalid` }
    }

    const title = typeof s.title === 'string' ? s.title.trim() : ''
    const text = typeof s.text === 'string' ? s.text.trim() : ''
    const formulas = Array.isArray(s.formulas) ? s.formulas.filter(f => typeof f === 'string' && f.trim()) : []
    const figure = s.figure || null
    const keyInsight = typeof s.key_insight === 'string' ? s.key_insight.trim() : ''

    if (!title) {
      return { valid: false, steps: [], error: `step_${i}_missing_title` }
    }
    if (!text) {
      return { valid: false, steps: [], error: `step_${i}_missing_text` }
    }

    // 每步 ≥1 公式或图件
    if (formulas.length === 0 && !figure) {
      return { valid: false, steps: [], error: `step_${i}_no_formula_or_figure` }
    }

    // 图件校验
    if (figure) {
      if (typeof figure !== 'object') {
        return { valid: false, steps: [], error: `step_${i}_figure_not_object` }
      }
      if (!FIGURE_TYPES.includes(figure.type)) {
        return { valid: false, steps: [], error: `step_${i}_figure_bad_type` }
      }
      if (figure.template && !FIGURE_TEMPLATES.includes(figure.template)) {
        return { valid: false, steps: [], error: `step_${i}_figure_bad_template` }
      }
      figureCount++
    }

    if (figureCount > 2) {
      return { valid: false, steps: [], error: 'too_many_figures' }
    }

    validated.push({
      index: i + 1,
      title,
      text,
      formulas,
      figure,
      key_insight: keyInsight,
    })
  }

  return { valid: true, steps: validated }
}

export default async function handler(req, res) {
  // CORS
  if (!applyCors(req, res, '[api/derivation]')) return

  // 限流
  const clientIp = getClientIp(req)
  if (!checkRateLimit(clientIp)) {
    res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)))
    return res.status(429).json({ ok: false, error: 'rate_limited' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  const { knowledge_point, tier, context } = req.body || {}

  if (!knowledge_point || typeof knowledge_point !== 'string') {
    return res.status(400).json({ ok: false, error: 'missing_knowledge_point' })
  }

  if (!isKnowledgeAllowed(knowledge_point)) {
    return res.status(400).json({
      ok: false,
      error: 'knowledge_point_not_allowed',
      message: '知识点不在白名单内',
    })
  }

  // 加载推导 prompt
  const template = loadPrompt('derivation')
  if (!template) {
    console.error('[api/derivation] prompt file not found: prompts/derivation.md')
    return res.status(500).json({ ok: false, error: 'prompt_not_found' })
  }

  const systemPrompt = substitute(template, {
    knowledge_point,
    tier: tier || 'intermediate',
    context: context || '暂无',
  })

  // LLM provider 配置
  const providerConfig = getProviderConfig()
  const { valid, error: providerError } = validateProviderConfig(providerConfig)
  if (!valid) {
    console.error('[api/derivation] ' + providerError)
    return res.status(500).json({ ok: false, error: 'provider_not_configured', message: providerError })
  }

  // 一次性 fetch（非流式）
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)

  try {
    const r = await fetch(providerConfig.chatUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: providerConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请对知识点「${knowledge_point}」进行逐步推导讲解。` },
        ],
        temperature: 0.5,
        max_tokens: 4000,
        stream: false,
      }),
      signal: ctrl.signal,
    })

    clearTimeout(timer)

    if (!r.ok) {
      const errText = await r.text().catch(() => '')
      console.error(`[api/derivation] ${providerConfig.provider} upstream error:`, r.status, errText.slice(0, 200))
      return res.status(502).json({ ok: false, error: 'upstream_error', status: r.status })
    }

    const data = await r.json()
    const content = data.choices?.[0]?.message?.content || ''

    if (!content) {
      return res.status(502).json({ ok: false, error: 'empty_response' })
    }

    // 提取并校验 JSON
    const parsed = extractJsonObject(content)
    if (!parsed) {
      console.error('[api/derivation] failed to extract JSON from response:', content.slice(0, 200))
      return res.status(502).json({ ok: false, error: 'json_parse_failed' })
    }

    const { valid: stepsValid, steps, error: stepsError } = validateSteps(parsed)
    if (!stepsValid) {
      console.error('[api/derivation] steps validation failed:', stepsError)
      return res.status(502).json({ ok: false, error: 'steps_validation_failed', detail: stepsError })
    }

    return res.status(200).json({
      ok: true,
      steps,
      model: providerConfig.model,
      provider: providerConfig.provider,
    })
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') {
      return res.status(504).json({ ok: false, error: 'request_timeout' })
    }
    console.error('[api/derivation] fetch failed:', e)
    return res.status(500).json({ ok: false, error: 'internal_error', message: e.message })
  }
}
