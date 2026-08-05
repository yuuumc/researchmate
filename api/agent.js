// ============================================================
// 开放 API - Agent 编排（v3.1 升级版）
// ============================================================
// v3.1 变更：
//   - career Agent: 接入就业 Prompt v3.1 + 院校画像注入 + 真实 LLM 调用
//   - tutor Agent: 接入教研 Prompt v3.1 + 真实 LLM 调用
//   - diagnose/plan/practice/peer: 全部接入 v3.1 Prompt（6/6 Agent 就绪）
//   - 支持 compact 模式（Groq provider 自动加载 .compact.md）
//   - 响应体新增 structured 字段（从 LLM 输出提取 JSON 块）
//   - v3.1.1: AbortController 超时 + 限流 + 错误脱敏 + 参数 clamp
//   - v2.0-W1: CORS / 限流抽取至 ./_middleware.js（与 chat.js 共享）
//
// POST /api/agent
// Body: { action: "diagnose|plan|practice|tutor|career|peer", input: {...} }
//   career    input: { student_name, target_school, target_major, mastered_skills?, weak_points? }
//   tutor     input: { question, subject?, context? }
//   diagnose  input: { student_name, target_major, mastered_skills, weak_points?, knowledge_points? }
//   plan      input: { student_name, target_major, diagnosis_result?, exam_date?, weekly_hours? }
//   practice  input: { knowledge_point, difficulty?, question_type?, count?, student_level? }
//   peer      input: { student_name, target_school, target_major, mastered_skills, weak_points?, peer_pool? }
// Response: { status, agent, content, structured?, provider, usage }
// ============================================================

import { getProviderConfig, validateProviderConfig, buildHeaders, buildMessages } from './llm-provider.js'
import { loadPrompt, substitute, getSchoolProfile, getCareerPaths, shouldUseCompact, extractStructured } from './prompt-loader.js'
import { applyCors, getClientIp, checkRateLimit, RATE_LIMIT_WINDOW_MS } from './_middleware.js'

// P1: Sanitize user input to prevent prompt injection
function sanitizeUserInput(str, maxLen = 500) {
  if (!str) return ''
  return String(str)
    .slice(0, maxLen)
    .replace(/[
]+/g, ' ')
    .replace(/<[^>]*>/g, '')
    .trim()
}

const AGENT_TIMEOUT_MS = 55000

const AGENTS = {
  diagnose: { name: '诊断 Agent', desc: '识别学员知识薄弱点，生成分层诊断报告', prompt: 'diagnose', ready: true },
  plan:     { name: '规划 Agent', desc: '基于诊断结果制定个性化备考计划', prompt: 'plan', ready: true },
  practice: { name: '练习 Agent', desc: '生成针对性练习题并提供即时反馈', prompt: 'practice', ready: true },
  tutor:    { name: '辅导 Agent', desc: '教研模式答疑（LaTeX 规范化 + 5 维度 QA）', prompt: 'student-taoyan', ready: true },
  career:   { name: '就业 Agent', desc: '基于院校画像推荐 3 条就业路径 + 技能缺口分析', prompt: 'student-employment', ready: true },
  peer:     { name: '同伴匹配 Agent', desc: '匹配学习伙伴，构建互助小组', prompt: 'peer', ready: true },
  research: { name: '科研 Agent', desc: '规划本科→研究生科研成长路线，推荐论文/技术栈/实验室', prompt: 'research', ready: true },
}

export default async function handler(req, res) {
  // ---- CORS（共享中间件，P0-3）----
  if (!applyCors(req, res, '[api/agent]')) return

  // ---- 限流（共享中间件，P0-6 兜底）----
  const clientIp = getClientIp(req)
  if (!checkRateLimit(clientIp)) {
    console.warn('[api/agent] rate limited: ' + clientIp)
    res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)))
    return res.status(429).json({ error: 'rate_limited' })
  }

  const { action, input = {} } = req.body
  // P1: Sanitize string inputs to prevent prompt injection
  if (input.userInput) input.userInput = sanitizeUserInput(input.userInput, 2000)
  if (input.student_name) input.student_name = sanitizeUserInput(input.student_name, 100)
  if (input.target_major) input.target_major = sanitizeUserInput(input.target_major, 100) || {}
  if (!action) return res.status(400).json({ error: 'missing_action' })
  if (!AGENTS[action]) {
    return res.status(400).json({ error: 'unknown_action', available: Object.keys(AGENTS) })
  }

  const agentInfo = AGENTS[action]

  // ---- Provider 配置 ----
  const config = getProviderConfig()
  const { valid, error: providerError } = validateProviderConfig(config)
  if (!valid) {
    return res.status(500).json({ error: 'provider_not_configured' })
  }

  // ---- 加载 Prompt ----
  const compact = shouldUseCompact()
  const promptTemplate = loadPrompt(agentInfo.prompt, { compact })
  if (!promptTemplate) {
    return res.status(500).json({ error: 'prompt_not_found' })
  }

  // ---- Placeholder 替换 + 数据注入 ----
  let systemPrompt = substitute(promptTemplate, input)

  // career Agent: 注入院校就业画像
  if (action === 'career') {
    const schoolProfile = input.target_school ? getSchoolProfile(input.target_school) : null
    if (schoolProfile) {
      systemPrompt += `\n\n# 院校就业偏好画像（注入数据）\n\n\`\`\`json\n${JSON.stringify(schoolProfile, null, 2)}\n\`\`\``
    }
    const careerPaths = getCareerPaths()
    if (careerPaths.length > 0) {
      systemPrompt += `\n\n# 就业路径元数据\n\n\`\`\`json\n${JSON.stringify(careerPaths, null, 2)}\n\`\`\``
    }
  }

  // research Agent: 注入规划结果
  if (action === 'research') {
    if (input.plan_result && typeof input.plan_result === 'object') {
      systemPrompt += `\n\n# 规划结果（注入数据）\n\n\`\`\`json\n${JSON.stringify(input.plan_result, null, 2)}\n\`\`\`\n`
    }
  }

  // ---- 构造用户消息 ----
  const userInput = action === 'career'
    ? buildCareerQuery(input)
    : action === 'tutor'
      ? buildTutorQuery(input)
      : action === 'research'
        ? buildResearchQuery(input)
        : JSON.stringify(input)

  // ---- 参数 clamp（P1 安全加固）----
  const temperature = Math.min(Math.max(Number(input.temperature) || 0.7, 0), 2)
  const maxTokens = Math.min(Number(input.max_tokens) || 4000, 8000)

  // ---- 调用 LLM（带 AbortController 超时）----
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS)

  try {
    const response = await fetch(config.chatUrl, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        model: config.model,
        messages: buildMessages(systemPrompt, userInput),
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[api/agent] ${action} upstream ${response.status}:`, errText.slice(0, 200))
      // 不返回上游错误原文，防止泄露 API 端点信息
      return res.status(502).json({
        error: 'upstream_error',
        status: response.status,
      })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    const structured = extractStructured(content)

    return res.status(200).json({
      status: 'active',
      agent: action,
      agentInfo: { name: agentInfo.name, description: agentInfo.desc },
      content,
      structured,
      provider: { name: config.provider, model: config.model },
      usage: data.usage || null,
    })
  } catch (e) {
    clearTimeout(timeoutId)
    const isTimeout = e.name === 'AbortError'
    console.error(`[api/agent] ${action} ${isTimeout ? 'timeout' : 'fetch failed'}:`, e)
    return res.status(502).json({
      error: isTimeout ? 'upstream_timeout' : 'upstream_error',
    })
  }
}

// ---- 辅助函数 ----

function buildCareerQuery(input) {
  const parts = []
  if (input.student_name) parts.push(`学生姓名: ${input.student_name}`)
  if (input.target_school) parts.push(`目标院校: ${input.target_school}`)
  if (input.target_major) parts.push(`目标专业: ${input.target_major}`)
  if (input.target_direction) parts.push(`意向方向: ${input.target_direction}`)
  if (input.mastered_skills) parts.push(`已掌握技能: ${Array.isArray(input.mastered_skills) ? input.mastered_skills.join(', ') : input.mastered_skills}`)
  if (input.weak_points) parts.push(`薄弱点: ${Array.isArray(input.weak_points) ? input.weak_points.join(', ') : input.weak_points}`)
  parts.push(`当前日期: ${new Date().toISOString().slice(0, 10)}`)
  if (input.question) parts.push(`问题: ${input.question}`)

  if (!input.question) {
    parts.push('请根据我的院校和专业，推荐 3 条就业路径（career_paths 模式），每条附 2-3 个目标岗位和技能缺口分析。')
  }

  return parts.join('\n') || '请推荐 3 条就业路径。'
}

function buildTutorQuery(input) {
  const parts = []
  if (input.subject) parts.push(`科目: ${input.subject}`)
  if (input.context) parts.push(`上下文: ${input.context}`)
  parts.push(`当前日期: ${new Date().toISOString().slice(0, 10)}`)
  parts.push(`问题: ${input.question || '请帮我梳理这个知识点。'}`)
  return parts.join('\n')
}

function buildResearchQuery(input) {
  const parts = []
  if (input.student_name) parts.push(`学生姓名: ${input.student_name}`)
  if (input.target_major) parts.push(`目标专业: ${input.target_major}`)
  if (input.target_direction) parts.push(`意向科研方向: ${input.target_direction}`)
  if (input.current_stage) parts.push(`当前阶段: ${input.current_stage}`)
  if (input.plan_result) parts.push(`备考计划: ${typeof input.plan_result === 'string' ? input.plan_result : JSON.stringify(input.plan_result)}`)

  // 如果没有具体问题，默认请求完整科研路线
  if (!input.question) {
    parts.push('请根据我的专业、意向方向和备考计划，生成科研成长路线（roadmap 模式），包含路线/论文/技术栈/实验室推荐。')
  }

  return parts.join('\n') || '请生成科研成长路线。'
}
