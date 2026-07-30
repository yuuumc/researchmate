// ============================================================
// 开放 API - Agent 编排（v3.0 队长保留件 scaffold）
// ============================================================
// POST /api/agent
// Body: { action: "diagnose|plan|practice|tutor|career", input: {...} }
// Response: { agent, result, metadata }
//
// 当前状态：scaffold（返回支持的 Agent 列表 + echo action）
// 后续：接入 5+1 Agent 协作引擎（诊断/规划/练习/辅导/就业 + 同伴匹配）
// ============================================================

import { getProviderConfig, validateProviderConfig } from './llm-provider.js'

const AGENTS = {
  diagnose: { name: '诊断 Agent', description: '识别学员知识薄弱点，生成分层诊断报告' },
  plan: { name: '规划 Agent', description: '基于诊断结果制定个性化备考计划' },
  practice: { name: '练习 Agent', description: '生成针对性练习题并提供即时反馈' },
  tutor: { name: '辅导 Agent', description: 'SSE 流式一对一答疑（当前 /api/chat 的增强版）' },
  career: { name: '就业 Agent', description: '基于画像推荐就业方向与岗位匹配' },
  peer: { name: '同伴匹配 Agent', description: '匹配学习伙伴，构建互助小组' },
}

export default async function handler(req, res) {
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

  const { action, input } = req.body || {}
  if (!action) return res.status(400).json({ error: 'missing_action' })
  if (!AGENTS[action]) {
    return res.status(400).json({ error: 'unknown_action', available: Object.keys(AGENTS) })
  }

  const config = getProviderConfig()
  const { valid } = validateProviderConfig(config)

  return res.status(200).json({
    status: 'scaffold',
    message: `${AGENTS[action].name} 已注册，引擎待接入`,
    agent: action,
    agentInfo: AGENTS[action],
    input: input || null,
    provider: {
      name: config.provider,
      model: config.model,
      configured: valid,
    },
    availableAgents: Object.entries(AGENTS).map(([key, val]) => ({ key, ...val })),
  })
}
