// ============================================================
// 科研成长 Agent（v1 正式版 §三：第五个 Agent）
// ============================================================
// 职责：把考研准备与未来科研成长连接起来
// 输出：本科路径 + 研究生路径 + 论文 + 项目 + 技术栈
// 对应 v1正式版.txt：「研芯通 ≠ 考研工具，而是工科人才成长智能体」
//
// v1.5 升级：继承 BaseAgent，trace 自动埋点（Agent 编排工程师）
// v1.5 PATCH：论文引用核对（提示词工程师）
//   - 调用 LLM 后用 citationVerifier 异步核对（OpenAlex 主源）
//   - 失败项不静默删，在 value 字段追加 [未验证: <title>] 占位符
//   - 网络/API 异常时优雅降级（标 [未验证] 不阻塞主流程）
//   - 合并方式：保留 BaseAgent.runLLM 调用，verify 块接在 extractResearchStructure 之后
// ============================================================

import { profileToContext } from '../profileLoader'
import { RESEARCH_PROMPT } from '@/prompts/index'
import { traceAgent, runLLM, parseStructured } from './BaseAgent'
import { verifyAllCitations, markUnverified } from './citationVerifier'

const FALLBACK_STRUCTURE = {
  direction: '',
  undergrad_path: [],
  research_path: [],
  papers: [],
  projects: [],
  tech_stack: []
}

export const researchAgent = traceAgent('research', async function researchCore(userInput, profile) {
  const prompt = `${RESEARCH_PROMPT}

# 学生画像
${profileToContext(profile)}
`

  const { content: raw } = await runLLM('research', prompt, userInput, {
    temperature: 0.6, // 科研路径需要一定创造力
    max_tokens: 2500
  })

  const structured = extractResearchStructure(raw)

  // v1.5 PATCH: 异步核对论文引用（不阻塞主流程，API 失败优雅降级）
  try {
    const { papers: verifiedPapers, summary } = await verifyAllCitations(structured.papers)
    structured.papers = markUnverified(verifiedPapers)
    structured.citation_summary = summary
  } catch (e) {
    // citationVerifier 自身异常也不阻塞（最坏情况：所有论文保持原样，标 [未验证]）
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
