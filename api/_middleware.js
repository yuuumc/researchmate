// ============================================================
// 共享中间件 - CORS 白名单（P0-3）+ 简易限流（P0-6 兜底）
// ============================================================
// agent.js / chat.js / diagnosis.js / knowledge.js / profile.js 共用。
// 限流桶挂在 globalThis，跨模块、跨 warm serverless 实例共享。
// ============================================================

export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 20)
export const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 5 * 60 * 1000)

const rateLimitBuckets = globalThis.__researchmateRateLimitBuckets || (globalThis.__researchmateRateLimitBuckets = new Map())

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
// methods 可选，默认 'POST, OPTIONS'；支持 'GET, POST, OPTIONS' 等自定义方法列表。
export function applyCors(req, res, tag, methods = 'POST, OPTIONS') {
  const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const requestOrigin = req.headers.origin || ''
  const isSameOrigin = !requestOrigin

  // P0 修复（自定义域名 403）：Origin 的 host 与请求 Host 一致时视为同源放行。
  // 场景：researchmate.researchkit.online 等 Vercel 自定义域名访问时，
  // Origin=https://researchmate.researchkit.online 而 ALLOWED_ORIGINS 只配了
  // vercel.app → 403 cors_denied。Origin host == Host 说明请求确实从本站页面
  // 发出；CSRF 跨站请求 Origin≠Host 仍被拦截，安全性不降低。
  let originHost = ''
  try {
    originHost = requestOrigin ? new URL(requestOrigin).host : ''
  } catch { originHost = '' }
  const requestHost = String(req.headers.host || '')
  const isOriginAllowed = isSameOrigin
    || ALLOWED_ORIGINS.includes(requestOrigin)
    || (originHost !== '' && originHost === requestHost)

  if (!isOriginAllowed) {
    if (tag) console.warn(`${tag} CORS denied for origin: ${requestOrigin}`)
    res.status(403).json({ error: 'cors_denied' })
    return false
  }

  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Origin', isSameOrigin ? 'null' : requestOrigin)
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return false
  }
  const allowedMethods = methods.split(',').map((m) => m.trim())
  if (!allowedMethods.includes(req.method)) {
    res.status(405).json({ error: 'method_not_allowed' })
    return false
  }
  return true
}
