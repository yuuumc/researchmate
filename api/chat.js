// ============================================================
// Vercel serverless function - DeepSeek API 代理
// ============================================================
// 安全铁律（v3 §翻车点 11）：
//   1. DEEPSEEK_API_KEY 只从 process.env 读取（Vercel Project Settings 配置）
//   2. 严禁 VITE_DEEPSEEK_API_KEY 前缀（会进前端 bundle）
//   3. 前端 DevTools Network 只能看到 /api/chat，不得出现 api.deepseek.com
//
// 部署前自检（v3 §Week 2 8/4 P0）：
//   curl https://your-app.vercel.app/api/chat -X POST \
//     -H "Content-Type: application/json" \
//     -d '{"prompt":"hi","userInput":"hello"}'
// ============================================================

export default async function handler(req, res) {
  // CORS（评审现场可能跨域访问备份链接）
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

  try {
    const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
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
        max_tokens: maxTokens
      })
    })

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
