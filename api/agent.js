// ============================================================
// 开放 API - Agent 编排（v3.1 升级版）
// ============================================================
// v3.1 变更：
//   - career Agent: 接入就业 Prompt v3.1 + 院校画像注入 + 真实 LLM 调用
//   - tutor Agent: 接入教研 Prompt v3.1 + 真实 LLM 调用
//   - diagnose/plan/practice/peer: 全部接入 v3.1 Prompt（6/6 Agent 就绪）
//   - 支持 compact 模式（Groq provider 自动加载 .compact.md）
//   - 响应体新增 structured 字段（从 LLM 输出提取 JSON 块）
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

const AGENTS = {
  diagnose: { name: '诊断 Agent', desc: '识别学员知识薄弱点，生成分层诊断报告', prompt: 'diagnose', ready: true },
  plan:     { name: '规划 Agent', desc: '基于诊断结果制定个性化备考计划', prompt: 'plan', ready: true },
  practice: { name: '练习 Agent', desc: '生成针对性练习题并提供即时反馈', prompt: 'practice', ready: true },
  tutor:    { name: '辅导 Agent', desc: '教研模式答疑（LaTeX 规范化 + 5 维度 QA）', prompt: 'student-taoyan', ready: true },
  career:   { name: '就业 Agent', desc: '基于院校画像推荐 3 条就业路径 + 技能缺口分析', prompt: 'student-employment', ready: true },
  peer:     { name: '同伴匹配 Agent', desc: '匹配学习伙伴，构建互助小组', prompt: 'peer', ready: true },
}

export default async function handler(req, res) {
  // ---- CORS ----
  const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
  const requestOrigin = req.headers.origin || ''
  const isSameOrigin = !requestOrigin
  if (!isSameOrigin && !ALLOWED_ORIGINS.includes(requestOrigin)) {
    return res.status(403).json({ error: 'cors_denied' })
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Origin', isSameOrigin ? 'null' : requestOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const { action, input = {} } = req.body || {}
  if (!action) return res.status(400).json({ error: 'missing_action' })
  if (!AGENTS[action]) {
    return res.status(400).json({ error: 'unknown_action', available: Object.keys(AGENTS) })
  }

  const agentInfo = AGENTS[action]

  // ---- Provider 配置 ----
  const config = getProviderConfig()
  const { valid, error: providerError } = validateProviderConfig(config)
  if (!valid) {
    return res.status(500).json({ error: 'provider_not_configured', message: providerError })
  }

  // ---- 未就绪 Agent：返回 scaffold ----
  if (!agentInfo.ready) {
    return res.status(200).json({
      status: 'scaffold',
      message: `${agentInfo.name} 已注册，Prompt 待升级到 v3.1`,
      agent: action,
      agentInfo: { name: agentInfo.name, description: agentInfo.desc },
      input: input || null,
      provider: { name: config.provider, model: config.model, configured: valid },
      availableAgents: Object.entries(AGENTS).map(([k, v]) => ({ key: k, name: v.name, ready: v.ready })),
    })
  }

  // ---- 加载 Prompt ----
  const compact = shouldUseCompact()
  const promptTemplate = loadPrompt(agentInfo.prompt, { compact })
  if (!promptTemplate) {
    return res.status(500).json({
      error: 'prompt_not_found',
      message: `Prompt 文件未找到: prompts/${agentInfo.prompt}.md（compact=${compact}）`,
      hint: '请确认 prompts/ 目录下有对应的 .md 文件',
    })
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

  // ---- 构造用户消息 ----
  const userInput = action === 'career'
    ? buildCareerQuery(input)
    : action === 'tutor'
      ? buildTutorQuery(input)
      : JSON.stringify(input)

  // ---- 调用 LLM ----
  try {
    const response = await fetch(config.chatUrl, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        model: config.model,
        messages: buildMessages(systemPrompt, userInput),
        temperature: input.temperature ?? 0.7,
        max_tokens: input.max_tokens ?? 2000,
        stream: false,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[api/agent] ${action} upstream ${response.status}:`, errText.slice(0, 200))
      return res.status(502).json({
        error: 'upstream_error',
        status: response.status,
        message: errText.slice(0, 500),
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
    console.error(`[api/agent] ${action} fetch failed:`, e)
    return res.status(502).json({
      error: 'upstream_error',
      message: String(e),
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
  if (input.question) parts.push(`问题: ${input.question}`)

  // 如果没有具体问题，默认请求 3 条就业路径
  if (!input.question) {
    parts.push('请根据我的院校和专业，推荐 3 条就业路径（career_paths 模式），每条附 2-3 个目标岗位和技能缺口分析。')
  }

  return parts.join('\n') || '请推荐 3 条就业路径。'
}

function buildTutorQuery(input) {
  const parts = []
  if (input.subject) parts.push(`科目: ${input.subject}`)
  if (input.context) parts.push(`上下文: ${input.context}`)
  parts.push(`问题: ${input.question || '请帮我梳理这个知识点。'}`)
  return parts.join('\n')
}
