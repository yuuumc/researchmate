// ============================================================
// 共享中间件 - CORS 白名单（P0-3）+ 简易限流（P0-6 兜底）
// ============================================================
// agent.js / chat.js 共用。
// 限流桶挂在 globalThis，跨模块、跨 warm serverless 实例共享。
// ============================================================

export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 20)
export const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 5 * 60 * 1000)

const rateLimitBuckets = globalThis.__yanxintongRateLimitBuckets || (globalThis.__yanxintongRateLimitBuckets = new Map())

export function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (fwd) return String(fwd).split(',')[0].trim()
  return req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown'
}

export function checkRateLimit(ip) {
  const now = Date.now()
  let bucket = rateLimitBuckets.get(ip)
  if (!bucket || now - bucket.start >= RATE_LIMIT_WINDOW_MS) {
    bucket = { start: now, count: 0 }
    rateLimitBuckets.set(ip, bucket)
  }
  bucket.count += 1
  if (rateLimitBuckets.size > 5000) {
    for (const [key, value] of rateLimitBuckets) {
      if (now - value.start >= RATE_LIMIT_WINDOW_MS) rateLimitBuckets.delete(key)
    }
  }
  return bucket.count <= RATE_LIMIT_MAX
}

// CORS 白名单校验 + 预检处理 + 方法限制。
// 返回 true = 继续处理业务；false = 响应已发出（403/204/405），handler 直接 return。
// tag 用于拒绝时打日志（如 '[api/chat]'）。
export function applyCors(req, res, tag) {
  const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const requestOrigin = req.headers.origin || ''
  const isSameOrigin = !requestOrigin
  const isOriginAllowed = isSameOrigin || ALLOWED_ORIGINS.includes(requestOrigin)

  if (!isOriginAllowed) {
    if (tag) console.warn(`${tag} CORS denied for origin: ${requestOrigin}`)
    res.status(403).json({ error: 'cors_denied' })
    return false
  }

  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Origin', isSameOrigin ? 'null' : requestOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return false
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return false
  }
  return true
}
