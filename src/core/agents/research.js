// ============================================================
// 科研成长 Agent（v2.0 SSE 版）
// ============================================================
// v1 正式版：第五个 Agent
// 职责：把考研准备与未来科研成长连接起来
// 输出：本科路径 + 研究生路径 + 论文 + 项目 + 技术栈
// v1.5 PATCH：论文引用核对（提示词工程师）
//   - 调用 LLM 后用 citationVerifier 异步核对（OpenAlex 主源）
//   - 失败项不静默删，在 value 字段追加 [未验证: <title>] 占位符
//   - 网络/API 异常时优雅降级（标 [未验证] 不阻塞主流程）
// v2.0：支持流式 + 取消
// ============================================================

import { profileToContext } from '../profileLoader'
import { RESEARCH_PROMPT } from '@/prompts/index'
import { traceAgent, runLLM, callLLM, parseStructured } from './BaseAgent'
import { verifyAllCitations, markUnverified } from './citationVerifier'

const FALLBACK_STRUCTURE = {
  direction: '',
  undergrad_path: [],
  research_path: [],
  papers: [],
  projects: [],
  tech_stack: []
}

export const researchAgent = traceAgent('research', async function researchCore(userInput, profile, ctx = {}) {
  const onToken = ctx?.onToken || null
  const signal = ctx?.signal || null

  const prompt = `${RESEARCH_PROMPT}

# 学生画像
${profileToContext(profile)}
`

  // v2.0：接 ctx.onToken → 流式
  const { content: raw } = await callLLM('research', prompt, userInput, {
    temperature: 0.6,
    max_tokens: 2500
  }, false, onToken, signal)

  const structured = extractResearchStructure(raw)

  // v1.5 PATCH: 异步核对论文引用（不阻塞主流程，API 失败优雅降级）
  try {
    const { papers: verifiedPapers, summary } = await verifyAllCitations(structured.papers)
    structured.papers = markUnverified(verifiedPapers)
    structured.citation_summary = summary
  } catch (e) {
    console.warn('[research] citation verification failed:', e.message)
    structured.citation_summary = { total: structured.papers.length, verified: 0, unverified: structured.papers.length, byReason: { exception: 1 } }
  }

  return {
    intent: 'research',
    agent: 'research',
    content: raw,
    structured
  }
})

/**
 * 从 LLM 输出中抽取结构化字段
 */
function extractResearchStructure(raw) {
  const parsed = parseStructured(raw, null)
  if (parsed) {
    return {
      direction: parsed.direction || '',
      undergrad_path: Array.isArray(parsed.undergrad_path) ? parsed.undergrad_path : [],
      research_path: Array.isArray(parsed.research_path) ? parsed.research_path : [],
      papers: Array.isArray(parsed.papers) ? parsed.papers : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      tech_stack: Array.isArray(parsed.tech_stack) ? parsed.tech_stack : []
    }
  }
  return { ...FALLBACK_STRUCTURE }
}
