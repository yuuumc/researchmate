// ============================================================
// Vercel serverless function - DeepSeek API 代理（v2.0 SSE 流式版）
// ============================================================
// 职责：
//   1. JSON 模式（向后兼容 v1.5）：一次性返回
//   2. SSE 流式模式（v2.0 新增）：服务端流式转发，首 token 延迟 < 2s
//   3. 1 次重试：上游失败/超时时降级 max_tokens 重试
//   4. 健康检查：探测 API 可用性
//
// 安全铁律（沿用 v1.5）：
//   1. DEEPSEEK_API_KEY 只从 process.env 读取
//   2. 严禁 VITE_DEEPSEEK_API_KEY 前缀
//   3. 前端 DevTools Network 只能看到 /api/chat
//
// 部署前自检：
//   # JSON 模式（兼容）
//   curl https://your-app.vercel.app/api/chat -X POST \
//     -H "Content-Type: application/json" \
//     -d '{"prompt":"hi","userInput":"hello"}'
//
//   # SSE 流式模式
//   curl -N https://your-app.vercel.app/api/chat -X POST \
//     -H "Content-Type: application/json" \
//     -d '{"prompt":"hi","userInput":"hello","stream":true}'
// ============================================================

const UPSTREAM_URL = 'https://api.deepseek.com/v1/chat/completions'
const DEFAULT_MAX_DURATION_MS = 58000 // 略小于 Vercel 60s 限制
const STREAM_FIRST_TOKEN_TIMEOUT_MS = 30000 // 首 token 30s 超时（reasoner 长 prompt 适配）
const RETRY_MAX_TOKENS_RATIO = 0.5 // 重试时 max_tokens 减半

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const { prompt, userInput, options = {} } = req.body || {}

  if (!prompt || !userInput) {
    return res.status(400).json({ error: 'missing_prompt_or_userInput' })
  }

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    console.error('[api/chat] DEEPSEEK_API_KEY not configured')
    return res.status(500).json({ error: 'api_key_not_configured' })
  }

  const model = options.model || 'deepseek-chat'
  const temperature = options.temperature ?? 0.7
  const maxTokens = options.max_tokens ?? 2000
  const stream = options.stream === true

  if (stream) {
    return handleStream(req, res, { apiKey, model, temperature, maxTokens, prompt, userInput })
  }
  return handleJson(req, res, { apiKey, model, temperature, maxTokens, prompt, userInput })
}

// ============================================================
// JSON 模式（v1.5 兼容路径）
// ============================================================
async function handleJson(req, res, { apiKey, model, temperature, maxTokens, prompt, userInput }) {
  const attempt = async (mt) => {
    const r = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: userInput }
        ],
        temperature,
        max_tokens: mt,
        stream: false
      })
    })
    return r
  }

  try {
    let r = await attempt(maxTokens)

    // 1 次重试：上游失败/超时 → 降级 max_tokens
    if (!r.ok && isRetryable(r.status)) {
      console.warn(`[api/chat] upstream ${r.status}，降级重试 (max_tokens ${maxTokens} → ${Math.floor(maxTokens * RETRY_MAX_TOKENS_RATIO)})`)
      r = await attempt(Math.max(256, Math.floor(maxTokens * RETRY_MAX_TOKENS_RATIO)))
    }

    if (!r.ok) {
      const errText = await r.text()
      console.error('[api/chat] DeepSeek upstream error:', r.status, errText)
      return res.status(502).json({
        error: 'upstream_error',
        status: r.status,
        message: errText.slice(0, 500)
      })
    }

    const data = await r.json()
    const content = data.choices?.[0]?.message?.content || ''

    return res.status(200).json({
      content,
      model: data.model || model,
      usage: data.usage || null
    })
  } catch (e) {
    console.error('[api/chat] fetch failed:', e)
    return res.status(502).json({
      error: 'upstream_error',
      message: String(e)
    })
  }
}

// ============================================================
// SSE 流式模式（v2.0 新增）
// ============================================================
async function handleStream(req, res, { apiKey, model, temperature, maxTokens, prompt, userInput }) {
  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // 禁用 nginx 缓冲
  res.status(200)

  const sendEvent = (event, data) => {
    if (res.writableEnded || res.destroyed) return
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  // 立即 flush headers
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  const startTime = Date.now()
  let firstTokenSent = false
  let retryUsed = false
  let totalContent = ''

  // 辅助：执行一次流式调用
  const streamOnce = async (mt) => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), DEFAULT_MAX_DURATION_MS)
    try {
      const r = await fetch(UPSTREAM_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: userInput }
          ],
          temperature,
          max_tokens: mt,
          stream: true
        }),
        signal: ctrl.signal
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
      console.warn(`[api/chat] stream upstream ${r.status}，降级重试 (max_tokens ${mt} → ${fallbackMt})`)
      retryUsed = true
      r = await streamOnce(fallbackMt)
    }

    return r
  }

  try {
    const r = await attemptWithRetry(maxTokens)

    if (!r.ok) {
      const errText = await r.text()
      console.error('[api/chat] stream upstream error:', r.status, errText)
      sendEvent('error', {
        error: 'upstream_error',
        status: r.status,
        message: errText.slice(0, 500)
      })
      return res.end()
    }

    if (!r.body) {
      sendEvent('error', { error: 'no_response_body' })
      return res.end()
    }

    // 解析 SSE 流（DeepSeek 格式：data: {...}\n\n）
    const reader = r.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    // 首 token 超时检测
    const firstTokenTimer = setTimeout(() => {
      if (!firstTokenSent) {
        console.error(`[api/chat] 首 token 超时 (${STREAM_FIRST_TOKEN_TIMEOUT_MS}ms)，主动中断`)
        sendEvent('error', {
          error: 'first_token_timeout',
          message: `首 token 超过 ${STREAM_FIRST_TOKEN_TIMEOUT_MS}ms 未到达`,
          latencyMs: Date.now() - startTime
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

        // 按双换行切分 SSE 事件
        const events = buffer.split('\n\n')
        buffer = events.pop() || '' // 最后一个可能不完整，留到下次

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
                usage: null,
                latencyMs: Date.now() - startTime,
                firstTokenLatencyMs: firstTokenSent ? null : Date.now() - startTime
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
      // 正常流结束（部分实现不发 [DONE]）
      clearTimeout(firstTokenTimer)
      if (!res.writableEnded) {
        sendEvent('done', {
          content: totalContent,
          model,
          usage: null,
          latencyMs: Date.now() - startTime
        })
        res.end()
      }
    } catch (e) {
      clearTimeout(firstTokenTimer)
      console.error('[api/chat] stream read error:', e)
      sendEvent('error', { error: 'stream_read_error', message: String(e) })
      if (!res.writableEnded) res.end()
    }
  } catch (e) {
    console.error('[api/chat] stream failed:', e)
    sendEvent('error', { error: 'upstream_error', message: String(e) })
    if (!res.writableEnded) res.end()
  }
}

// ============================================================
// 工具函数
// ============================================================
function isRetryable(status) {
  // 408 408 429 500 502 503 504 524 → 1 次重试
  return [408, 429, 500, 502, 503, 504, 524].includes(status)
}
