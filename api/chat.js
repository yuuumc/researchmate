// ============================================================
// Vercel serverless function - LLM API 代理（v3.1 多 Provider + Prompt 自动加载）
// ============================================================
// v3.1 变更：
//   - 新增 mode 参数：employment/taoyan → 自动加载对应 prompt
//   - 前端不再需要传完整 system prompt，只传 mode + userInput 即可
//   - 向后兼容：不传 mode 时仍用 body.prompt（v3.0 行为不变）
//
// v3.0 沿用：
//   - 多 provider 抽象（llm-provider.js）
//   - JSON 模式 + SSE 流式模式
//   - CORS 白名单 + 简易限流
//   - 1 次降级重试
//
// v2.0-W1: CORS / 限流抽取至 ./_middleware.js（与 agent.js 共享）
// ============================================================

import { getProviderConfig, validateProviderConfig } from './llm-provider.js'
import { loadPrompt, substitute, shouldUseCompact } from '../lib/prompt-loader.js'
import { applyCors, getClientIp, checkRateLimit, RATE_LIMIT_WINDOW_MS } from './_middleware.js'

const DEFAULT_MAX_DURATION_MS = 58000
const STREAM_FIRST_TOKEN_TIMEOUT_MS = 30000
const RETRY_MAX_TOKENS_RATIO = 0.5

// ---- mode → prompt 文件映射 ----
const MODE_PROMPT_MAP = {
  employment: 'student-employment',
  taoyan: 'student-taoyan',
}

export default async function handler(req, res) {
  // CORS 白名单（共享中间件，P0-3）
  if (!applyCors(req, res, '[api/chat]')) return

  // 简易限流（共享中间件，P0-6）
  const clientIp = getClientIp(req)
  if (!checkRateLimit(clientIp)) {
    console.warn('[api/chat] rate limited: ' + clientIp)
    res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)))
    return res.status(429).json({ error: 'rate_limited' })
  }

  const { prompt, userInput, options = {}, mode, profile = {}, history = [] } = req.body || {}

  if (!userInput) {
    return res.status(400).json({ error: 'missing_userInput' })
  }

  // P0 危机短路（8/20 服务端安全网）：检测到危机信号时，不调 LLM，直接返回固定安全话术
  // 根因：DeepSeek 安全过滤拦截自残/自杀内容 → upstream_error。emotionGuard 客户端
  //       已做短路，此处为 callChatWithMode / 直接调 /api/chat 的服务端兜底。
  //       话术与 src/prompts/v2/tutor/student.md §5.3 逐字一致。
  const _CRISIS_KW = [
    "不想活","想死","想消失","活着没意思","活着没什么意思","想伤害自己",
    "不想存在","了结自己","自杀","自残","自伤","撑不下去","撑不下去了",
    "没有希望","没希望了","没有人在意","没有意义","一切都没意义",
    "想解脱","不如消失","不想醒来"
  ]
  const _CRISIS_RESP = '我听到你了。你现在愿意说出来，这本身就很勇敢。你的感受很重要，此刻的情绪不是软弱，也不是你一个人该独自扛的事。\n\n我只是一个学习助手，没办法代替专业的人陪着你，但有人可以。请你现在就联系下面任意一条热线，他们 24 小时都在，免费、保密：\n- 全国心理援助热线：12356\n- 北京市心理援助热线：010-82951332（手机）/ 800-810-1117（座机），24 小时\n- 也可以拨打当地 12320 卫生热线转心理援助，或前往学校心理咨询中心 / 最近医院的精神心理科。\n\n如果你觉得此刻就有危险，请立刻拨打 120 或 110，或告诉身边一个你信任的人。你不是麻烦，他们会帮你。'
  const _crisisKw = _CRISIS_KW.find(kw => userInput.includes(kw))
  if (_crisisKw) {
    console.warn('[api/chat] crisis signal detected (' + _crisisKw + '), returning hardcoded safety response')
    if (options.stream === true) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      res.status(200)
      if (typeof res.flushHeaders === 'function') res.flushHeaders()
      const _chunks = _CRISIS_RESP.match(/[^。\n]*[。\n]?/g) || [_CRISIS_RESP]
      for (const _ch of _chunks) {
        if (_ch) res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: _ch } }] }) + '\n\n')
      }
      res.write('data: [DONE]\n\n')
      return res.end()
    }
    return res.status(200).json({ content: _CRISIS_RESP, model: 'crisis-safety', provider: 'hardcoded' })
  }

  // ---- v3.1: mode 自动加载 prompt ----
  let systemPrompt = prompt
  if (mode && MODE_PROMPT_MAP[mode]) {
    const compact = shouldUseCompact()
    const template = loadPrompt(MODE_PROMPT_MAP[mode], { compact })
    if (template) {
      systemPrompt = substitute(template, profile)
    } else {
      console.warn(`[api/chat] mode=${mode} 但 prompt 文件未找到，回退到 body.prompt`)
    }
  }

  if (!systemPrompt) {
    return res.status(400).json({ error: 'missing_prompt', message: '请提供 prompt 或 mode 参数' })
  }

  // P0-2 D2: 对话历史安全过滤（仅 user/assistant，限 12 条，每条截断 2000 字）
  const safeHistory = Array.isArray(history)
    ? history
        .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
        .slice(-12)
        .map(m => ({ role: m.role, content: String(m.content || '').slice(0, 2000) }))
    : []

  // v3.0: 多 LLM provider 配置
  const providerConfig = getProviderConfig()
  const { valid, error: providerError } = validateProviderConfig(providerConfig)
  if (!valid) {
    console.error('[api/chat] ' + providerError)
    return res.status(500).json({ error: 'provider_not_configured', message: providerError })
  }

  const ALLOWED_MODELS = ['xopdeepseekv4flash0731']
  const model = (options.model && ALLOWED_MODELS.includes(options.model)) ? options.model : providerConfig.model
  const temperature = Math.min(Math.max(Number(options.temperature) || 0.7, 0), 2)
  const maxTokens = Math.min(Number(options.max_tokens) || 2000, 4000)
  const stream = options.stream === true

  const callParams = {
    chatUrl: providerConfig.chatUrl,
    apiKey: providerConfig.apiKey,
    provider: providerConfig.provider,
    model,
    temperature,
    maxTokens,
    prompt: systemPrompt,
    userInput,
    history: safeHistory,
  }

  if (stream) {
    return handleStream(req, res, callParams)
  }
  return handleJson(req, res, callParams)
}

// ============================================================
// JSON 模式（v1.5 兼容路径）
// ============================================================
async function handleJson(req, res, { chatUrl, apiKey, provider, model, temperature, maxTokens, prompt, userInput, history = [] }) {
  const attempt = async (mt) => {
    const r = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: prompt },
          ...history,
          { role: 'user', content: userInput },
        ],
        temperature,
        max_tokens: mt,
        stream: false,
      }),
    })
    return r
  }

  try {
    let r = await attempt(maxTokens)

    if (!r.ok && isRetryable(r.status)) {
      console.warn(`[api/chat] ${provider} upstream ${r.status}，降级重试 (max_tokens ${maxTokens} → ${Math.floor(maxTokens * RETRY_MAX_TOKENS_RATIO)})`)
      r = await attempt(Math.max(256, Math.floor(maxTokens * RETRY_MAX_TOKENS_RATIO)))
    }

    if (!r.ok) {
      const errText = await r.text()
      console.error(`[api/chat] ${provider} upstream error:`, r.status, errText)
      return res.status(502).json({
        error: 'upstream_error',
        status: r.status,
      })
    }

    const data = await r.json()
    const content = data.choices?.[0]?.message?.content || ''

    return res.status(200).json({
      content,
      model: data.model || model,
      provider,
      usage: data.usage || null,
    })
  } catch (e) {
    console.error(`[api/chat] ${provider} fetch failed:`, e)
    return res.status(502).json({
      error: 'upstream_error',
    })
  }
}

// ============================================================
// SSE 流式模式（v2.0）
// ============================================================
async function handleStream(req, res, { chatUrl, apiKey, provider, model, temperature, maxTokens, prompt, userInput, history = [] }) {
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
            ...history,
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
      console.warn(`[api/chat] ${provider} stream upstream ${r.status}，降级重试 (max_tokens ${mt} → ${fallbackMt})`)
      retryUsed = true
      r = await streamOnce(fallbackMt)
    }

    return r
  }

  try {
    const r = await attemptWithRetry(maxTokens)

    if (!r.ok) {
      const errText = await r.text()
      console.error(`[api/chat] ${provider} stream upstream error:`, r.status, errText)
      sendEvent('error', {
        error: 'upstream_error',
        status: r.status,
      })
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
        console.error(`[api/chat] 首 token 超时 (${STREAM_FIRST_TOKEN_TIMEOUT_MS}ms)，主动中断`)
        sendEvent('error', {
          error: 'first_token_timeout',
          message: `首 token 超过 ${STREAM_FIRST_TOKEN_TIMEOUT_MS}ms 未到达`,
          latencyMs: Date.now() - startTime,
        })
        try { reader.cancel() } catch (_) { /* noop */ }
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
                usage: null,
                latencyMs: Date.now() - startTime,
                firstTokenLatencyMs: firstTokenSent ? null : Date.now() - startTime,
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
            } catch (parseErr) {
              // 忽略无法解析的行（heartbeat 等）
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
          usage: null,
          latencyMs: Date.now() - startTime,
        })
        res.end()
      }
    } catch (e) {
      clearTimeout(firstTokenTimer)
      console.error(`[api/chat] ${provider} stream read error:`, e)
      sendEvent('error', { error: 'stream_read_error' })
      if (!res.writableEnded) res.end()
    }
  } catch (e) {
    console.error(`[api/chat] ${provider} stream failed:`, e)
    sendEvent('error', { error: 'upstream_error' })
    if (!res.writableEnded) res.end()
  }
}

// ============================================================
// 工具函数
// ============================================================
function isRetryable(status) {
  return [408, 429, 500, 502, 503, 504, 524].includes(status)
}
