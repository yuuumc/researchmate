// ============================================================
// POST /api/exam-grade — 主观题单题 LLM-as-Judge 评分
// ============================================================
// 逐题独立调用（支持前端 Promise.allSettled 并行），50s 超时
// 失败/超时返回 pending_review 状态而非报错（GWT#4 不阻塞）
//
// Request body:
//   { question, student_answer, knowledge_point, max_score }
// Response:
//   200 { status: 'ok', result: { dimensions, total_score, ... } }
//   200 { status: 'pending_review', result: { ..., pending_review: true } }
//   400 { error: 'missing_fields' }
//   500 { error: 'config_error' }
// ============================================================

import { getProviderConfig, validateProviderConfig, buildHeaders, buildMessages } from './llm-provider.js'
import { applyCors, getClientIp, checkRateLimit, RATE_LIMIT_WINDOW_MS } from './_middleware.js'
import { buildRubricPrompt, parseGradeResponse, createPendingReview } from '../src/core/examGrader.js'

const TIMEOUT_MS = 50000 // 50s，留 10s 给 Vercel 60s 硬限

export default async function handler(req, res) {
  // CORS
  if (applyCors(req, res)) return

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  // 限流
  const clientIp = getClientIp(req)
  if (checkRateLimit && !checkRateLimit(clientIp, 'exam-grade')) {
    return res.status(429).json({ error: 'rate_limited', retry_after: RATE_LIMIT_WINDOW_MS })
  }

  // 解析 body
  const { question, student_answer, knowledge_point, max_score = 10 } = req.body || {}

  if (!question || !student_answer) {
    return res.status(400).json({ error: 'missing_fields', required: ['question', 'student_answer'] })
  }

  // 获取 LLM 配置
  let config
  try {
    config = getProviderConfig()
    const validation = validateProviderConfig(config)
    if (!validation.valid) {
      console.error('[api/exam-grade] config invalid:', validation.errors)
      return res.status(500).json({ error: 'config_error', details: validation.errors })
    }
  } catch (e) {
    console.error('[api/exam-grade] config error:', e)
    return res.status(500).json({ error: 'config_error' })
  }

  // 构建 Rubric prompt
  const { system, user } = buildRubricPrompt({
    question,
    student_answer,
    knowledge_point,
    max_score,
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(config.chatUrl, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        model: config.model,
        messages: buildMessages(system, user),
        temperature: 0.2,
        max_tokens: 1000,
        stream: false,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text()
      console.error('[api/exam-grade] upstream ' + response.status + ':', errText.slice(0, 200))
      // GWT#4: 不报错，返回 pending_review
      return res.status(200).json({
        status: 'pending_review',
        result: createPendingReview(question, 'upstream_' + response.status),
      })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    const result = parseGradeResponse(content)

    if (!result) {
      console.error('[api/exam-grade] parse failed, raw:', content.slice(0, 200))
      return res.status(200).json({
        status: 'pending_review',
        result: createPendingReview(question, 'parse_failed'),
      })
    }

    return res.status(200).json({
      status: 'ok',
      result,
      provider: { name: config.provider, model: config.model },
      usage: data.usage || null,
    })
  } catch (e) {
    clearTimeout(timeoutId)
    const isTimeout = e.name === 'AbortError'
    console.error('[api/exam-grade] ' + (isTimeout ? 'timeout' : 'failed') + ':', e.message)
    // GWT#4: 不报错，返回 pending_review
    return res.status(200).json({
      status: 'pending_review',
      result: createPendingReview(question, isTimeout ? 'timeout' : 'fetch_error'),
    })
  }
}
