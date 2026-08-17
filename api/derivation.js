// ============================================================
// Vercel serverless function - AI 白板推导（B2 · SSE 流式）
// ============================================================
// POST /api/derivation
// Body: { knowledge_point: string }
// Response: text/event-stream (SSE)
//
// 复用 chat.js 的 LLM provider 抽象 + CORS + 限流中间件
// 推导 prompt 从 prompts/derivation.md 加载
// ============================================================

import { getProviderConfig, validateProviderConfig } from './llm-provider.js'
import { loadPrompt, substitute } from './prompt-loader.js'
import { applyCors, getClientIp, checkRateLimit, RATE_LIMIT_WINDOW_MS } from './_middleware.js'

const DEFAULT_MAX_DURATION_MS = 58000
const STREAM_FIRST_TOKEN_TIMEOUT_MS = 30000
const RETRY_MAX_TOKENS_RATIO = 0.5

// 知识点白名单（与 prompt 一致，服务端校验）
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
  const lower = kp.toLowerCase()
  // 精确匹配或包含白名单关键词
  return KNOWLEDGE_WHITELIST.some(w => lower.includes(w.toLowerCase()))
}

export default async function handler(req, res) {
  // CORS
  if (!applyCors(req, res, '[api/derivation]')) return

  // 限流
  const clientIp = getClientIp(req)
  if (!checkRateLimit(clientIp)) {
    res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)))
    return res.status(429).json({ error: 'rate_limited' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const { knowledge_point } = req.body || {}

  if (!knowledge_point || typeof knowledge_point !== 'string') {
    return res.status(400).json({ error: 'missing_knowledge_point' })
  }

  if (!isKnowledgeAllowed(knowledge_point)) {
    return res.status(400).json({
      error: 'knowledge_point_not_allowed',
      message: '知识点不在白名单内',
      allowed: KNOWLEDGE_WHITELIST,
    })
  }

  // 加载推导 prompt
  const template = loadPrompt('derivation')
  if (!template) {
    console.error('[api/derivation] prompt file not found: prompts/derivation.md')
    return res.status(500).json({ error: 'prompt_not_found' })
  }

  const systemPrompt = substitute(template, { knowledge_point })

  // LLM provider 配置
  const providerConfig = getProviderConfig()
  const { valid, error: providerError } = validateProviderConfig(providerConfig)
  if (!valid) {
    console.error('[api/derivation] ' + providerError)
    return res.status(500).json({ error: 'provider_not_configured', message: providerError })
  }

  const model = providerConfig.model
  const temperature = 0.5 // 推导需要严谨，降低温度
  const maxTokens = 3000

  return handleStream(req, res, {
    chatUrl: providerConfig.chatUrl,
    apiKey: providerConfig.apiKey,
    provider: providerConfig.provider,
    model,
    temperature,
    maxTokens,
    prompt: systemPrompt,
    userInput: `请对知识点「${knowledge_point}」进行逐步推导讲解。`,
  })
}

// ============================================================
// SSE 流式模式
// ============================================================
async function handleStream(req, res, { chatUrl, apiKey, provider, model, temperature, maxTokens, prompt, userInput }) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.status(200)

  const sendEvent = (event, data) => {
    if (res.writableEnded || res.destroyed) return
    if (event === 'token') {
      const delta = typeof data === 'object' && data ? data.delta : ''
      if (delta) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`)
      }
      return
    }
    if (event === 'done') {
      res.write(`data: [DONE]\n\n`)
      return
    }
    if (event === 'error') {
      const errObj = typeof data === 'object' && data ? data : { error: 'unknown', message: String(data) }
      res.write(`data: ${JSON.stringify({ error: errObj.error, message: errObj.message || errObj.error })}\n\n`)
      return
    }
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  const startTime = Date.now()
  let firstTokenSent = false
  let retryUsed = false
  let totalContent = ''

  const streamOnce = async (mt) => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), DEFAULT_MAX_DURATION_MS)
    try {
      const r = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: userInput },
          ],
          temperature,
          max_tokens: mt,
          stream: true,
        }),
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      return r
    } catch (e) {
      clearTimeout(timer)
      throw e
    }
  }

  const attemptWithRetry = async (mt) => {
    let r = await streamOnce(mt)
    if (!r.ok && isRetryable(r.status) && !retryUsed) {
      const fallbackMt = Math.max(256, Math.floor(mt * RETRY_MAX_TOKENS_RATIO))
      console.warn(`[api/derivation] ${provider} stream upstream ${r.status}，降级重试 (max_tokens ${mt} → ${fallbackMt})`)
      retryUsed = true
      r = await streamOnce(fallbackMt)
    }
    return r
  }

  try {
    const r = await attemptWithRetry(maxTokens)

    if (!r.ok) {
      const errText = await r.text()
      console.error(`[api/derivation] ${provider} stream upstream error:`, r.status, errText)
      sendEvent('error', { error: 'upstream_error', status: r.status })
      return res.end()
    }

    if (!r.body) {
      sendEvent('error', { error: 'no_response_body' })
      return res.end()
    }

    const reader = r.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    const firstTokenTimer = setTimeout(() => {
      if (!firstTokenSent) {
        console.error(`[api/derivation] 首 token 超时 (${STREAM_FIRST_TOKEN_TIMEOUT_MS}ms)`)
        sendEvent('error', {
          error: 'first_token_timeout',
          message: `首 token 超过 ${STREAM_FIRST_TOKEN_TIMEOUT_MS}ms 未到达`,
        })
        try { reader.cancel() } catch (_) {}
        if (!res.writableEnded) res.end()
      }
    }, STREAM_FIRST_TOKEN_TIMEOUT_MS)

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''

        for (const evt of events) {
          const lines = evt.split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data:')) continue
            const payload = trimmed.slice(5).trim()
            if (payload === '[DONE]') {
              clearTimeout(firstTokenTimer)
              sendEvent('done', {
                content: totalContent,
                model,
                provider,
                latencyMs: Date.now() - startTime,
              })
              if (!res.writableEnded) res.end()
              return
            }
            try {
              const parsed = JSON.parse(payload)
              const delta = parsed.choices?.[0]?.delta?.content || ''
              if (delta) {
                if (!firstTokenSent) {
                  firstTokenSent = true
                  clearTimeout(firstTokenTimer)
                }
                totalContent += delta
                sendEvent('token', { delta, latencyMs: Date.now() - startTime })
              }
            } catch (_) {
              // 忽略心跳等非 JSON 行
            }
          }
        }
      }
      clearTimeout(firstTokenTimer)
      if (!res.writableEnded) {
        sendEvent('done', {
          content: totalContent,
          model,
          provider,
          latencyMs: Date.now() - startTime,
        })
        res.end()
      }
    } catch (e) {
      clearTimeout(firstTokenTimer)
      console.error(`[api/derivation] ${provider} stream read error:`, e)
      sendEvent('error', { error: 'stream_read_error' })
      if (!res.writableEnded) res.end()
    }
  } catch (e) {
    console.error(`[api/derivation] ${provider} stream failed:`, e)
    sendEvent('error', { error: 'upstream_error' })
    if (!res.writableEnded) res.end()
  }
}

function isRetryable(status) {
  return [408, 429, 500, 502, 503, 504, 524].includes(status)
}
