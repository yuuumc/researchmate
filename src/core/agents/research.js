// ============================================================
// 科研成长 Agent（v3.0 tool-calling 版）
// ============================================================
// v1: LLM 直接生成论文 → citationVerifier 事后验证
// v1.5: + citationVerifier 异步核对（OpenAlex / Semantic Scholar）
// v2.0: + SSE 流式 + 取消
// v3.0: 检索优先（RAG 翻转）— tool calling 检索 OpenAlex → LLM 组织
//       citationVerifier 降级为 fallback only
// ============================================================

import { profileToContext } from '../profileLoader'
import { RESEARCH_PROMPT } from '@/prompts/index'
import { traceAgent, callLLM, parseStructured } from './BaseAgent'
import { verifyAllCitations, markUnverified } from './citationVerifier'
import { callResearchAgent } from '@/api/researchAgent'

const FALLBACK_STRUCTURE = {
  direction: '',
  undergrad_path: [],
  research_path: [],
  papers: [],
  projects: [],
  tech_stack: []
}

export const researchAgent = traceAgent('research', async function researchCore(userInput, profile, ctx = {}) {
  const signal = ctx?.signal || null

  let result
  try {
    // v3.0: Call backend with tool calling (search_papers → LLM organize)
    result = await callResearchAgent({
      userInput,
      profile,
      signal,
    })
  } catch (e) {
    console.warn('[research] tool-calling endpoint failed, falling back to direct LLM:', e.message)
    // Fallback to direct LLM call (v2.0 behavior)
    const prompt = `${RESEARCH_PROMPT}

# 学生画像
${profileToContext(profile)}
`
    const { content: raw } = await callLLM('research', prompt, userInput, {
      temperature: 0.6, max_tokens: 2500
    }, false, null, signal)
    result = { content: raw, structured: null, tool_calls_trace: [], fallback: true }
  }

  const raw = result.content || ''
  let structured = result.structured || extractResearchStructure(raw)

  // If tool calling succeeded (papers from OpenAlex), skip citation verification
  // If fallback (LLM-generated papers), run citation verifier as before
  if (result.fallback || !result.tool_calls_trace?.length) {
    // Fallback path: verify citations (old behavior)
    try {
      const { papers: verifiedPapers, summary } = await verifyAllCitations(structured.papers)
      structured.papers = markUnverified(verifiedPapers)
      structured.citation_summary = summary
    } catch (e) {
      console.warn('[research] citation verification failed:', e.message)
      structured.citation_summary = {
        total: structured.papers.length,
        verified: 0,
        unverified: structured.papers.length,
        byReason: { exception: 1 }
      }
    }
  } else {
    // Papers came from OpenAlex tool search — all verified by definition
    structured.citation_summary = {
      total: structured.papers?.length || 0,
      verified: structured.papers?.length || 0,
      unverified: 0,
      source: 'openalex_tool_search'
    }
  }

  return {
    intent: 'research',
    agent: 'research',
    content: raw,
    structured,
    tool_calls_trace: result.tool_calls_trace || []
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
