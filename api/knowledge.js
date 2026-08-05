// ============================================================
// 开放 API - 知识库查询（v3.0 队长保留件 scaffold）
// ============================================================
// POST /api/knowledge
// Body: { query: "半导体物理 PN 结", subject?: "microelectronics", limit?: 5 }
// Response: { results: [{ title, content, source, score }] }
//
// 当前状态：scaffold（返回 provider 就绪状态 + echo query）
// 后续：接入 RAG 知识库（向量检索 + LLM 摘要）
// ============================================================

import { getProviderConfig, validateProviderConfig, listProviders } from './llm-provider.js'
import { applyCors } from './_middleware.js'

export default async function handler(req, res) {
  if (!applyCors(req, res, '[api/knowledge]')) return

  const { query, subject, limit = 5 } = req.body || {}
  if (!query) return res.status(400).json({ error: 'missing_query' })

  // 当前：返回 scaffold 状态 + provider 信息
  // TODO: 接入 RAG 知识库（向量检索 + LLM 摘要）
  const config = getProviderConfig()
  const { valid } = validateProviderConfig(config)

  return res.status(200).json({
    status: 'scaffold',
    message: '知识库 API 已就绪，RAG 检索待接入',
    query,
    subject: subject || 'microelectronics',
    limit,
    provider: {
      name: config.provider,
      model: config.model,
      configured: valid,
    },
    availableProviders: listProviders(),
  })
}
