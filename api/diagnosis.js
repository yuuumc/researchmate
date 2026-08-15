// ============================================================
// 诊断混合模式 API（W2 Step 2）
// ============================================================
// POST /api/diagnosis
// Body: { op: 'subjective'|'grade', payload: {...} }
//
// op='subjective'  → LLM 生成 2 道主观题（基于薄弱知识点）
//   payload: { target_major, weak_points[], knowledge_points[] }
//   returns: { questions: [{ id, knowledge_point, question, type, difficulty }] }
//
// op='grade'  → 客观题自动判分 + 主观题 LLM 评判 → 输出 10 字段结构化 weak_points
//   payload: { objective_results[], subjective_answers[], profile, knowledge_points[] }
//   returns: { content, structured }
//
// 客观题抽题 / 判分 / DB 写入均在客户端（RLS owner 策略允许），
// 本端点只负责需要 DEEPSEEK_API_KEY 的 LLM 调用。
// ============================================================

import { getProviderConfig, validateProviderConfig, buildHeaders, buildMessages } from './llm-provider.js'
import { loadPrompt, substitute, extractStructured } from './prompt-loader.js'
import { applyCors, getClientIp, checkRateLimit, RATE_LIMIT_WINDOW_MS } from './_middleware.js'

// P1: Sanitize user input to prevent prompt injection
function sanitizeUserInput(str, maxLen = 500) {
  if (!str) return ''
  return String(str)
    .slice(0, maxLen)
    .replace(/\n+/g, ' ')  // Remove newlines that could break prompt structure
    .replace(/<[^>]*>/g, '')   // Strip HTML tags
    .trim()
}

const TIMEOUT_MS = 50000

export default async function handler(req, res) {
  if (!applyCors(req, res, '[api/diagnosis]')) return

  const clientIp = getClientIp(req)
  if (!checkRateLimit(clientIp)) {
    console.warn('[api/diagnosis] rate limited: ' + clientIp)
    res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)))
    return res.status(429).json({ error: 'rate_limited' })
  }

  const { op, payload = {} } = req.body || {}
  if (!op) return res.status(400).json({ error: 'missing_op' })

  const config = getProviderConfig()
  const { valid, error: providerError } = validateProviderConfig(config)
  if (!valid) {
    return res.status(500).json({ error: 'provider_not_configured' })
  }

  if (op === 'subjective') {
    return handleSubjective(req, res, payload, config)
  }
  if (op === 'grade') {
    return handleGrade(req, res, payload, config)
  }
  return res.status(400).json({ error: 'unknown_op', available: ['subjective', 'grade'] })
}

// ---- op=subjective: 生成主观题 ----
async function handleSubjective(req, res, payload, config) {
  const { target_major, weak_points = [], knowledge_points = [] } = payload

  const kpList = Array.isArray(weak_points) && weak_points.length > 0
    ? weak_points.slice(0, 5)
    : (Array.isArray(knowledge_points) ? knowledge_points.slice(0, 5).map(k => typeof k === 'string' ? k : k.topic || '') : [])

  const systemPrompt = `你是一位集成电路考研命题专家。请根据学生的目标专业和薄弱知识点，生成 2 道主观题（简答题），用于诊断其知识掌握深度。

要求：
1. 每道题聚焦一个薄弱知识点，题目难度对标考研真题（难度 3-4）
2. 题干清晰、答案可量化评判（不是开放闲聊）
3. 输出**严格 JSON 数组**（不要 markdown 代码块、不要任何解释文字），每项格式：
   { "id": "sub-1", "knowledge_point": "知识点名", "question": "题干全文", "type": "essay", "difficulty": 3 }

学生目标专业：${target_major || '集成电路'}
薄弱知识点：${kpList.join('、') || '半导体器件基础'}`

  const userInput = '请生成 2 道主观诊断题。只输出 JSON 数组。'

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(config.chatUrl, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        model: config.model,
        messages: buildMessages(systemPrompt, userInput),
        temperature: 0.5,
        max_tokens: 1500,
        stream: false,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text()
      console.error('[api/diagnosis] subjective upstream ' + response.status + ':', errText.slice(0, 200))
      return res.status(502).json({ error: 'upstream_error', status: response.status })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    // 解析 JSON 数组（容错：剥离 markdown 代码块）
    const questions = parseJsonArray(content)

    if (!questions || questions.length === 0) {
      return res.status(500).json({ error: 'parse_failed', raw: content.slice(0, 500) })
    }

    return res.status(200).json({
      status: 'ok',
      op: 'subjective',
      questions: questions.slice(0, 3),
      provider: { name: config.provider, model: config.model },
      usage: data.usage || null,
    })
  } catch (e) {
    clearTimeout(timeoutId)
    const isTimeout = e.name === 'AbortError'
    console.error('[api/diagnosis] subjective ' + (isTimeout ? 'timeout' : 'failed') + ':', e)
    return res.status(502).json({ error: isTimeout ? 'upstream_timeout' : 'upstream_error' })
  }
}

// ---- op=grade: 主观题评判 + weak_points 合成 ----
async function handleGrade(req, res, payload, config) {
  const {
    objective_results = [],
    subjective_answers = [],
    profile = {},
    knowledge_points = [],
  } = payload

  // 统计客观题表现
  const objStats = summarizeObjective(objective_results)

  // 加载 diagnose prompt v3.1
  const promptTemplate = loadPrompt('diagnose', {})
  if (!promptTemplate) {
    return res.status(500).json({ error: 'prompt_not_found' })
  }

  const weakPointsInput = Array.isArray(profile.weak_points) ? profile.weak_points : []
  const masteredInput = Array.isArray(profile.mastered_skills) ? profile.mastered_skills : []

  let systemPrompt = substitute(promptTemplate, {
    student_name: profile.student_name || '',
    target_major: profile.target_major || '',
    mastered_skills: masteredInput,
    weak_points: weakPointsInput,
    knowledge_points: knowledge_points,
  })

  // 注入做题证据
  systemPrompt += `

# 诊断做题证据（混合模式：客观题自动判分 + 主观题学生作答）

## 客观题统计
${JSON.stringify(objStats, null, 2)}

## 客观题逐题结果
${JSON.stringify(objective_results.map(r => ({
  knowledge_point: r.knowledge_point,
  question_type: r.question_type,
  difficulty: r.difficulty,
  is_correct: r.is_correct,
  score: r.score,
})), null, 2)}

## 主观题学生作答
${JSON.stringify(subjective_answers.map(a => ({
  knowledge_point: a.knowledge_point,
  question: a.question,
  answer: (a.answer || '').slice(0, 800),
})), null, 2)}

**重要**：weak_points 必须基于以上做题证据（客观题错误 + 主观题暴露的知识缺口）而非学生自评。
ability_stars 的星级应反映实际做题表现：全对→4-5星，部分对→2-3星，错/空白→1星。`

  // 构造用户消息
  const userInput = `请基于以上做题证据，生成诊断报告。输出 Markdown 报告 + 尾部 \`\`\`json 代码块（含 10 字段结构化数据）。

学生：${profile.student_name || '匿名'} | 专业：${profile.target_major || '集成电路'}
客观题正确率：${objStats.correct}/${objStats.total}（${objStats.accuracy}%）
主观题作答数：${subjective_answers.length}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(config.chatUrl, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        model: config.model,
        messages: buildMessages(systemPrompt, userInput),
        temperature: 0.3,
        max_tokens: 3000,
        stream: false,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text()
      console.error('[api/diagnosis] grade upstream ' + response.status + ':', errText.slice(0, 200))
      return res.status(502).json({ error: 'upstream_error', status: response.status })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    const structured = extractStructured(content)

    return res.status(200).json({
      status: 'ok',
      op: 'grade',
      content,
      structured,
      objective_stats: objStats,
      provider: { name: config.provider, model: config.model },
      usage: data.usage || null,
    })
  } catch (e) {
    clearTimeout(timeoutId)
    const isTimeout = e.name === 'AbortError'
    console.error('[api/diagnosis] grade ' + (isTimeout ? 'timeout' : 'failed') + ':', e)
    return res.status(502).json({ error: isTimeout ? 'upstream_timeout' : 'upstream_error' })
  }
}

// ---- 辅助函数 ----

function parseJsonArray(text) {
  if (!text) return null
  let t = String(text).trim()
  // 剥离 markdown 代码块
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  // 尝试直接解析
  try {
    const arr = JSON.parse(t)
    return Array.isArray(arr) ? arr : null
  } catch (_) { /* fallthrough */ }
  // 尝试提取第一个 JSON 数组
  const m = t.match(/\[[\s\S]*\]/)
  if (m) {
    try {
      return JSON.parse(m[0])
    } catch (_) { /* fallthrough */ }
  }
  return null
}

function summarizeObjective(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return { total: 0, correct: 0, accuracy: 0, by_kp: {} }
  }
  const total = results.length
  const correct = results.filter(r => r.is_correct).length
  const byKp = {}
  for (const r of results) {
    const kp = r.knowledge_point || '未知'
    if (!byKp[kp]) byKp[kp] = { total: 0, correct: 0 }
    byKp[kp].total++
    if (r.is_correct) byKp[kp].correct++
  }
  return {
    total,
    correct,
    accuracy: Math.round((correct / total) * 100),
    by_kp: byKp,
  }
}
