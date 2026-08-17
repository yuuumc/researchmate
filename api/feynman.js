// ============================================================
// Vercel serverless function - F4 费曼模式（讲给 AI 听）
// ============================================================
// 两段式调用（Vercel 60s 硬限逐条守住，每轮独立 LLM 调用，会话状态前端维护）：
//   stage=ask       SSE   学生复述 → AI 指出概念错误 + 针对性追问（首 token <10s）
//   stage=evaluate  JSON  会话结束 → 理解深度评分 0-100 + 错误清单 + 巩固建议
//
// 写画像不在本端点做——由前端评估完成后经 F1 profileBus（mastery-snapshot）统一写回。
// ============================================================

import { getProviderConfig, validateProviderConfig } from './llm-provider.js'
import { applyCors, getClientIp, checkRateLimit, RATE_LIMIT_WINDOW_MS } from './_middleware.js'

const DEFAULT_MAX_DURATION_MS = 58000
const STREAM_FIRST_TOKEN_TIMEOUT_MS = 10000

// 知识点白名单（与 tutor-photo.js / variant.js 同源）
const KNOWLEDGE_WHITELIST = [
  '半导体', '载流子', '本征', '掺杂', '杂质', '费米', '能带',
  '漂移', '扩散', '迁移率', '电导率', '连续性', '泊松',
  '玻尔兹曼', '统计', '分布', '平衡',
  'PN结', 'PN', '耗尽', '内建电势', '整流', '击穿', '雪崩', '齐纳', '隧穿',
  'MOS', 'MOSFET', '阈值电压', 'C-V', 'I-V',
  '跨导', '亚阈值', '短沟道', '沟道', '夹断', '氧化层', '电容',
  'CMOS', '反相器', '时序', '逻辑', '组合', '触发器',
  '双极型', 'BJT', '晶体管', '微电子',
  'JFET', '结型', '场效应',
  '放大器', '放大', '差分', '运算放大', '频率响应', '反馈', '稳定性', '噪声',
  '低功耗', '功耗', '版图', '工艺', '设计',
  '制造', '光刻', '刻蚀', '氧化', '沉积', '金属化', '互连', '封装',
  'ESD', '可靠性', '寄生', '闩锁', 'latch',
  '异质结', '半导体物理', '微电子器件', '半导体器件', '器件',
  '饱和区', '线性区', '截止区',
]

export function isKnowledgeAllowed(kp) {
  if (!kp || typeof kp !== 'string') return false
  if (kp.length > 100) return false
  const lower = kp.toLowerCase()
  if (KNOWLEDGE_WHITELIST.some(w => lower.includes(w.toLowerCase()))) return true
  if (/[\u4e00-\u9fa5]/.test(kp) && kp.length >= 2 && kp.length <= 50) return true
  return false
}

export default async function handler(req, res) {
  if (!applyCors(req, res, '[api/feynman]')) return

  const clientIp = getClientIp(req)
  if (!checkRateLimit(clientIp)) {
    res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)))
    return res.status(429).json({ error: 'rate_limited' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const body = req.body || {}
  const stage = body.stage

  if (stage === 'ask') return handleAsk(req, res, body)
  if (stage === 'evaluate') return handleEvaluate(req, res, body)
  return res.status(400).json({ error: 'invalid_stage', message: 'stage 必须为 ask 或 evaluate' })
}

// ============================================================
// Stage 1: 费曼追问（SSE 流式）
// ============================================================
async function handleAsk(req, res, body) {
  const { topic, history } = body
  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({ error: 'missing_topic', message: '缺少知识点' })
  }
  if (!isKnowledgeAllowed(topic)) {
    return res.status(400).json({ error: 'invalid_topic', message: '知识点不在考纲白名单内' })
  }

  const providerConfig = getProviderConfig()
  const { valid, error: providerError } = validateProviderConfig(providerConfig)
  if (!valid) {
    return res.status(500).json({ error: 'provider_not_configured', message: providerError })
  }

  const model = providerConfig.model

  const systemPrompt = `你是「半导体物理与微电子器件」考研导师，正在用费曼教学法辅导学生。规则：

1. 学生用自己的话复述知识点「${topic}」。
2. 你必须**先指出学生表述中的具体概念错误或不严谨之处**（逐条列出，引用原文措辞），如果没有错误则肯定其理解到位的部分。
3. 然后提出**至少一个针对性追问**，引导学生深入思考或纠正错误——不要直接给出完整正确答案，而是通过提问引导。
4. 语气专业、循循善诱，追问要击中要害，不要泛泛而谈。
5. 输出 Markdown 格式，公式用 \`$...$\` 或 \`$$...$$\`。不要输出 JSON。`

  // 组装多轮对话：system + history（student/assistant 交替）+ 最后一轮 student 复述已在 history 末尾
  const msgs = [{ role: 'system', content: systemPrompt }]
  const hist = Array.isArray(history) ? history : []
  for (const m of hist) {
    const role = m.role === 'student' ? 'user' : (m.role === 'assistant' ? 'assistant' : m.role)
    if (role === 'user' || role === 'assistant') {
      msgs.push({ role, content: String(m.content || '') })
    }
  }

  // SSE 头
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.status(200)
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  const sendEvent = (event, data) => {
    if (res.writableEnded || res.destroyed) return
    if (event === 'token') {
      const delta = typeof data === 'object' && data ? data.delta : ''
      if (delta) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`)
      return
    }
    if (event === 'done') { res.write(`data: [DONE]\n\n`); return }
    if (event === 'error') {
      const errObj = typeof data === 'object' && data ? data : { error: 'unknown', message: String(data) }
      res.write(`data: ${JSON.stringify({ error: errObj.error, message: errObj.message || errObj.error })}\n\n`)
      return
    }
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  const startTime = Date.now()
  let firstTokenSent = false
  let totalContent = ''

  const firstTokenTimer = setTimeout(() => {
    if (!firstTokenSent) {
      console.error('[api/feynman] 首 token 超时 (10s)')
      sendEvent('error', { error: 'first_token_timeout', message: '首 token 超过 10s 未到达' })
      if (!res.writableEnded) res.end()
    }
  }, STREAM_FIRST_TOKEN_TIMEOUT_MS)

  try {
    const ctrl = new AbortController()
    const maxTimer = setTimeout(() => ctrl.abort(), DEFAULT_MAX_DURATION_MS)

    const r = await fetch(providerConfig.chatUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        messages: msgs,
        temperature: 0.6,
        max_tokens: 1800,
        stream: true,
      }),
      signal: ctrl.signal,
    })
    clearTimeout(maxTimer)

    if (!r.ok || !r.body) {
      clearTimeout(firstTokenTimer)
      const errText = r.ok ? 'no body' : await r.text()
      console.error('[api/feynman] ask upstream error:', r.status, String(errText).slice(0, 300))
      sendEvent('error', { error: 'upstream_error', status: r.status })
      if (!res.writableEnded) res.end()
      return
    }

    const reader = r.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const evt of events) {
          for (const line of evt.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data:')) continue
            const payload = trimmed.slice(5).trim()
            if (payload === '[DONE]') {
              clearTimeout(firstTokenTimer)
              sendEvent('done', { content: totalContent, latencyMs: Date.now() - startTime })
              if (!res.writableEnded) res.end()
              return
            }
            try {
              const parsed = JSON.parse(payload)
              const delta = parsed.choices?.[0]?.delta?.content || ''
              if (delta) {
                if (!firstTokenSent) { firstTokenSent = true; clearTimeout(firstTokenTimer) }
                totalContent += delta
                sendEvent('token', { delta })
              }
            } catch (_) { /* heartbeat */ }
          }
        }
      }
      clearTimeout(firstTokenTimer)
      if (!res.writableEnded) {
        sendEvent('done', { content: totalContent, latencyMs: Date.now() - startTime })
        res.end()
      }
    } catch (e) {
      clearTimeout(firstTokenTimer)
      console.error('[api/feynman] stream read error:', e)
      sendEvent('error', { error: 'stream_read_error' })
      if (!res.writableEnded) res.end()
    }
  } catch (e) {
    clearTimeout(firstTokenTimer)
    console.error('[api/feynman] ask failed:', e)
    sendEvent('error', { error: 'upstream_error' })
    if (!res.writableEnded) res.end()
  }
}

// ============================================================
// Stage 2: 理解深度评估（JSON）
// ============================================================
async function handleEvaluate(req, res, body) {
  const { topic, history } = body
  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({ error: 'missing_topic' })
  }
  if (!Array.isArray(history) || history.length === 0) {
    return res.status(400).json({ error: 'missing_history', message: '缺少对话记录' })
  }

  const providerConfig = getProviderConfig()
  const { valid, error: providerError } = validateProviderConfig(providerConfig)
  if (!valid) {
    return res.status(500).json({ error: 'provider_not_configured', message: providerError })
  }

  const model = providerConfig.model

  const systemPrompt = `你是半导体物理与微电子器件考研导师。学生刚完成知识点「${topic}」的费曼复述对话。请根据完整对话记录评估学生的理解深度。

输出严格 JSON（第一个字符是 \`{\`，最后一个字符是 \`}\`，不要 markdown 围栏）：
{
  "score": 0-100 的整数，理解深度评分（0=完全不懂，100=完全掌握且能精准表达）,
  "errors": ["具体概念错误1", "具体概念错误2"],
  "strengths": ["理解到位的点1"],
  "recommendation": "practice" | "derivation" | "mastered",
  "summary": "一句话总评"
}

评分标准：
- 90-100：表述准确无误，概念清晰 → recommendation="mastered"
- 60-89：基本理解但有小瑕疵 → recommendation="practice"
- 0-59：存在明显概念错误 → recommendation="derivation"
errors 必须逐条引用学生原话指出错误点（禁止空话如"回答不错"）。`

  const msgs = [{ role: 'system', content: systemPrompt }]
  const transcript = history.map(m => `[${m.role === 'student' ? '学生' : '导师'}] ${m.content}`).join('\n\n')
  msgs.push({ role: 'user', content: `【对话记录】\n${transcript}\n\n请输出评估 JSON。` })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_MAX_DURATION_MS)

  try {
    const r = await fetch(providerConfig.chatUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: msgs,
        temperature: 0.2,
        max_tokens: 1000,
        stream: false,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!r.ok) {
      const errText = await r.text()
      console.error('[api/feynman] evaluate upstream error:', r.status, errText.slice(0, 300))
      return res.status(502).json({ error: 'upstream_error', status: r.status })
    }

    const data = await r.json()
    const content = data.choices?.[0]?.message?.content || ''
    const parsed = safeParseJSON(content)
    const norm = normalizeEvaluation(parsed)

    return res.status(200).json({
      ...norm,
      model: data.model || model,
      provider: providerConfig.provider,
    })
  } catch (e) {
    clearTimeout(timer)
    console.error('[api/feynman] evaluate failed:', e)
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'evaluate_timeout', message: '评估超时，请重试' })
    }
    return res.status(502).json({ error: 'upstream_error', message: e.message })
  }
}

// ---- 工具 ----
export function safeParseJSON(content) {
  if (!content || typeof content !== 'string') return null
  try { return JSON.parse(content) } catch (_) {}
  const m = content.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
  if (m) { try { return JSON.parse(m[1].trim()) } catch (_) {} }
  const s = content.indexOf('{')
  const e = content.lastIndexOf('}')
  if (s !== -1 && e > s) { try { return JSON.parse(content.slice(s, e + 1)) } catch (_) {} }
  return null
}

/**
 * 评估结果归一化（纯函数，契约测试覆盖）
 * - score 钳到 0-100 整数
 * - recommendation 校验枚举 + 与 score 一致性兜底（<60→derivation, ≥90→mastered）
 * - errors/strengths 强制为字符串数组
 */
export function normalizeEvaluation(parsed) {
  if (!parsed || typeof parsed.score !== 'number') {
    return {
      score: 50,
      errors: [],
      strengths: [],
      recommendation: 'practice',
      summary: '评估解析失败，已回退默认分数',
      parse_failed: true,
    }
  }
  const score = Math.max(0, Math.min(100, Math.round(parsed.score)))
  let recommendation = String(parsed.recommendation || 'practice')
  if (!['practice', 'derivation', 'mastered'].includes(recommendation)) {
    recommendation = score >= 90 ? 'mastered' : (score >= 60 ? 'practice' : 'derivation')
  }
  if (score < 60 && recommendation !== 'derivation') recommendation = 'derivation'
  if (score >= 90 && recommendation !== 'mastered') recommendation = 'mastered'
  return {
    score,
    errors: Array.isArray(parsed.errors) ? parsed.errors.map(String).slice(0, 8) : (parsed.errors ? [String(parsed.errors)] : []),
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String).slice(0, 5) : (parsed.strengths ? [String(parsed.strengths)] : []),
    recommendation,
    summary: String(parsed.summary || ''),
  }
}
