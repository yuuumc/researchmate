// ============================================================
// Vercel serverless function - F2 拍题讲解（多模态）
// ============================================================
// 两段式调用（Vercel 60s 硬限逐条守住）：
//   stage=recognize  JSON  多模态识别题目 → 知识点白名单校验 → 返回结构化题目
//   stage=explain    SSE   苏格拉底式分步讲解（首 token <10s）
//
// 识别失败（模糊/非题目）不重试轰炸，直接回 is_valid=false 提示重拍。
// 写画像不在本端点做——由前端讲解完成后经 profileBus 统一写入口回写。
// ============================================================

import { getProviderConfig, validateProviderConfig } from './llm-provider.js'
import { applyCors, getClientIp, checkRateLimit, RATE_LIMIT_WINDOW_MS } from './_middleware.js'

const DEFAULT_MAX_DURATION_MS = 58000
const STREAM_FIRST_TOKEN_TIMEOUT_MS = 10000
const MAX_IMAGE_BYTES = 1_500_000 // base64 后约 1.1MB，解码后 <1MB

// 知识点白名单（与 variant.js 同源；F2 识别结果必须命中白名单才写画像）
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
]

function isKnowledgeAllowed(kp) {
  if (!kp || typeof kp !== 'string') return false
  if (kp.length > 100) return false
  const lower = kp.toLowerCase()
  if (KNOWLEDGE_WHITELIST.some(w => lower.includes(w.toLowerCase()))) return true
  if (/[\u4e00-\u9fa5]/.test(kp) && kp.length >= 2 && kp.length <= 50) return true
  return false
}

export default async function handler(req, res) {
  if (!applyCors(req, res, '[api/tutor-photo]')) return

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

  if (stage === 'recognize') {
    return handleRecognize(req, res, body)
  }
  if (stage === 'explain') {
    return handleExplain(req, res, body)
  }
  return res.status(400).json({ error: 'invalid_stage', message: 'stage 必须为 recognize 或 explain' })
}

// ============================================================
// Stage 1: 多模态识别
// ============================================================
async function handleRecognize(req, res, body) {
  const { image } = body
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'missing_image', message: '请上传图片' })
  }
  // 限制 base64 体积（客户端已压缩，兜底校验）
  if (image.length > MAX_IMAGE_BYTES) {
    return res.status(413).json({ error: 'image_too_large', message: '图片过大，请压缩后重试' })
  }

  const providerConfig = getProviderConfig()
  const { valid, error: providerError } = validateProviderConfig(providerConfig)
  if (!valid) {
    return res.status(500).json({ error: 'provider_not_configured', message: providerError })
  }

  // 视觉模型：优先 LLM_VISION_MODEL，否则沿用 provider 默认模型（deepseek-v4-flash 已支持视觉）
  const visionModel = process.env.LLM_VISION_MODEL || providerConfig.model

  const systemPrompt = `你是半导体物理与微电子器件考研题目识别专家。用户会上传一张考题照片。请识别照片中的题目并输出严格 JSON。

输出字段：
- is_valid: boolean，照片是否包含可识别的考研题目（模糊/空白/非题目/完全无法辨认 → false）
- knowledge_point: string，题目考查的核心知识点名称（必须是考纲术语，如 "MOSFET阈值电压"、"PN结"、"CMOS反相器"、"跨导"）
- question_type: string，题型，取值 choice（选择题）/ fill（填空题）/ essay（简答/计算题）
- question_stem: string，题目题干完整文本（含选项文本，选择题把选项也写出）
- correct_answer: string，题目正确答案（选择题填 A/B/C/D；填空/简答填答案要点；无法确定填 ""）
- message: string，当 is_valid=false 时给出原因（如 "图片模糊，请重拍"），is_valid=true 时留空

只输出一个 JSON 对象，第一个字符是 \`{\`，最后一个字符是 \`}\`。不要输出 markdown 围栏或多余文字。`

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
        model: visionModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: [
            { type: 'text', text: '请识别这张考题照片并输出 JSON。' },
            { type: 'image_url', image_url: { url: image } },
          ] },
        ],
        temperature: 0.2,
        max_tokens: 1200,
        stream: false,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!r.ok) {
      const errText = await r.text()
      console.error('[api/tutor-photo] recognize upstream error:', r.status, errText.slice(0, 300))
      // 400 = 图片无效/太小/格式不支持 → 提示重拍（GWT #4: 不卡死、画像零写入）
      if (r.status === 400 || r.status === 422) {
        return res.status(200).json({
          is_valid: false,
          message: '图片无法识别，请重新拍摄清晰的考题照片',
          knowledge_point: '',
          question_type: '',
          question_stem: '',
          correct_answer: '',
        })
      }
      // 429 限流 → 提示稍后重试
      if (r.status === 429) {
        return res.status(429).json({ error: 'rate_limited', message: '请求过于频繁，请稍后重试' })
      }
      // 5xx → 上游服务异常
      return res.status(502).json({ error: 'upstream_error', status: r.status })
    }

    const data = await r.json()
    const content = data.choices?.[0]?.message?.content || ''
    const parsed = safeParseJSON(content)

    if (!parsed || typeof parsed.is_valid !== 'boolean') {
      // 无法解析 → 视为识别失败，提示重拍（不轰炸重试）
      return res.status(200).json({
        is_valid: false,
        message: '图片无法识别为有效题目，请重新拍摄清晰的照片',
        knowledge_point: '',
        question_type: '',
        question_stem: '',
        correct_answer: '',
      })
    }

    // 知识点白名单校验：识别成功但知识点不在白名单 → 仍标记需要确认
    let knowledgePoint = String(parsed.knowledge_point || '').trim()
    const kpAllowed = isKnowledgeAllowed(knowledgePoint)
    if (parsed.is_valid && !kpAllowed) {
      // 尝试从题干提取白名单关键词兜底
      const stem = String(parsed.question_stem || '')
      const hit = KNOWLEDGE_WHITELIST.find(w => stem.includes(w))
      if (hit) knowledgePoint = hit
    }

    return res.status(200).json({
      is_valid: !!parsed.is_valid,
      knowledge_point: knowledgePoint,
      question_type: String(parsed.question_type || '').toLowerCase(),
      question_stem: String(parsed.question_stem || '').trim(),
      correct_answer: String(parsed.correct_answer || '').trim(),
      message: parsed.is_valid ? '' : (String(parsed.message || '图片模糊或未识别到题目，请重新拍摄')),
      model: data.model || visionModel,
      provider: providerConfig.provider,
    })
  } catch (e) {
    clearTimeout(timer)
    console.error('[api/tutor-photo] recognize failed:', e)
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'recognize_timeout', message: '识别超时，请重试' })
    }
    return res.status(502).json({ error: 'upstream_error', message: e.message })
  }
}

// ============================================================
// Stage 2: 苏格拉底式分步讲解（SSE 流式）
// ============================================================
async function handleExplain(req, res, body) {
  const { question_stem, knowledge_point, question_type, correct_answer } = body
  if (!question_stem) {
    return res.status(400).json({ error: 'missing_question_stem' })
  }

  const providerConfig = getProviderConfig()
  const { valid, error: providerError } = validateProviderConfig(providerConfig)
  if (!valid) {
    return res.status(500).json({ error: 'provider_not_configured', message: providerError })
  }

  const model = providerConfig.model
  const systemPrompt = `你是「半导体物理与微电子器件」考研导师，擅长苏格拉底式分步讲解。学生会给你一道题目，请你：

1. 先简述题目考查的核心知识点。
2. 分步骤讲解解题思路（每步一个小标题，引导式提问 + 关键推导），不要一次性给出全部答案。
3. 最后给出完整解答与答案，并点出常见易错点。

讲解用 Markdown 格式，公式用 \`$...$\` 或 \`$$...$$\`。语气专业、循循善诱，不啰嗦。`

  const userContent = `【题目】
${question_stem}

【知识点】${knowledge_point || '（自动识别）'}
【题型】${question_type || '未知'}
【参考答案】${correct_answer || '（未提供）'}

请开始苏格拉底式分步讲解。`

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
      console.error('[api/tutor-photo] 首 token 超时 (10s)')
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
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.6,
        max_tokens: 2500,
        stream: true,
      }),
      signal: ctrl.signal,
    })
    clearTimeout(maxTimer)

    if (!r.ok || !r.body) {
      clearTimeout(firstTokenTimer)
      const errText = r.ok ? 'no body' : await r.text()
      console.error('[api/tutor-photo] explain upstream error:', r.status, String(errText).slice(0, 300))
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
      console.error('[api/tutor-photo] stream read error:', e)
      sendEvent('error', { error: 'stream_read_error' })
      if (!res.writableEnded) res.end()
    }
  } catch (e) {
    clearTimeout(firstTokenTimer)
    console.error('[api/tutor-photo] explain failed:', e)
    sendEvent('error', { error: 'upstream_error' })
    if (!res.writableEnded) res.end()
  }
}

// ---- 工具 ----
function safeParseJSON(content) {
  if (!content || typeof content !== 'string') return null
  try { return JSON.parse(content) } catch (_) {}
  // 去除 markdown 围栏
  const m = content.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
  if (m) { try { return JSON.parse(m[1].trim()) } catch (_) {} }
  // 提取首个 {...}
  const s = content.indexOf('{')
  const e = content.lastIndexOf('}')
  if (s !== -1 && e > s) { try { return JSON.parse(content.slice(s, e + 1)) } catch (_) {} }
  return null
}
