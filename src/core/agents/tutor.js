// ============================================================
// 专业导师 Agent（v2.0 SSE 版 + P0-1 GraphRAG 双路融合）
// ============================================================
// v1 正式版：RAG 检索 → 知识节点识别 → 前置知识链 → 个性化回答
// v1.5：继承 BaseAgent，trace 自动埋点
// v2.0：支持流式（ctx.onToken）+ 取消（ctx.signal），首 token 延迟 < 2s
// P0-1：GraphRAG 双路融合（三路并行召回 + min-max 归一 + 加权 + 去重）
//       无图谱时自动退化为纯 TF-IDF（向后兼容）
// ============================================================

import { graphRagRetrieve } from '@/utils/graphRag'
import { retrieve, buildContext } from '@/utils/rag'
import { profileToContext } from '../profileLoader'
import { TUTOR_PROMPT } from '@/prompts/index'
import {
  loadGraph,
  findNodeBySourceId,
  findNodeByKeywords,
  buildLearningPathContext
} from '@/utils/knowledgeGraph'
import { traceAgent, runLLM, callLLM } from './BaseAgent'

let knowledgeBase = [] // 启动时由 main.js 注入
let knowledgeGraph = null // v1 正式版：知识图谱（可选）

export function setKnowledgeBase(kb) {
  knowledgeBase = Array.isArray(kb) ? kb : []
}

/**
 * 注入知识图谱（v1 正式版 §四）
 * @param {string} subject - 学科标识
 * @param {object} graphData - 图谱 JSON
 */
export function setKnowledgeGraph(subject, graphData) {
  if (!graphData) {
    knowledgeGraph = null
    return
  }
  knowledgeGraph = loadGraph(subject, graphData)
}

/**
 * 专业导师（v2.0 接 ctx.onToken + ctx.signal + P0-1 GraphRAG 双路融合）
 */
export const tutorAgent = traceAgent('tutor', async function tutorCore(userInput, profile, ctx = {}) {
  const onToken = ctx?.onToken || null
  const signal = ctx?.signal || null
  const history = Array.isArray(ctx?.history) ? ctx.history : []

  // 1. GraphRAG 双路融合检索（三路并行召回 + min-max 归一 + 加权 + 去重）
  //    无图谱时自动退化为纯 TF-IDF
  const ragResult = graphRagRetrieve(userInput, knowledgeBase, knowledgeGraph, {
    topK: 5,
    profile
  })

  const slices = ragResult.slices
  const ragContext = ragResult.ragContext
  const knowledgePath = ragResult.knowledgePath
  const pathContext = knowledgePath
    ? buildPathContextText(knowledgePath)
    : ''
  const retrievalTrace = ragResult.trace

  console.log('[tutor] GraphRAG retrieval:', {
    graphLoaded: !!knowledgeGraph,
    degraded: retrievalTrace.degraded,
    sliceCount: slices.length,
    topSliceId: slices[0]?.id,
    topSliceScore: slices[0]?.score,
    topSliceSources: slices[0]?._retrieval_sources,
    knowledgePathTarget: knowledgePath?.target?.name,
    retrievalHits: knowledgePath?.retrievalHits?.length || 0
  })

  // 2. 拼 Prompt（含知识图谱路径上下文）
  const prompt = `${TUTOR_PROMPT}

# 学生画像
${profileToContext(profile)}

# 知识库检索结果（Top-${slices.length}）
${ragContext || '（无相关切片，按通用知识回答）'}

${pathContext ? `# 知识图谱路径分析（GraphRAG 双路融合）\n${pathContext}\n` : ''}
`

  // 3. 调用 LLM（v2.0：接 ctx.onToken → 流式；否则非流式）
  let content
  let apiError = null
  try {
    const result = await callLLM('tutor', prompt, userInput, {
      temperature: 0.5,
      max_tokens: 2000
    }, false, onToken, signal, history)
    content = result.content
  } catch (e) {
    apiError = e.message
    content = 'AI 服务暂不可用，请稍后再试。错误信息：' + e.message
  }

  return {
    intent: 'concept',
    agent: 'tutor',
    content,
    rag_slices: slices,
    knowledge_path: knowledgePath,
    // P0-1: GraphRAG 检索 trace（供 AgentTrace 展示）
    retrieval_trace: retrievalTrace,
    error: apiError ? true : undefined
  }
})

/**
 * 从 knowledgePath 对象构建路径上下文文本
 * （替代旧版 buildLearningPathContext 返回的 context 字段，
 *  因为 graphRagRetrieve 已构建了 knowledgePath 结构化对象）
 */
function buildPathContextText(kp) {
  if (!kp || !kp.target) return ''
  const pathLines = (kp.path || []).map((p, i) => {
    const statusLabel = {
      mastered: '✓已掌握',
      weak: '✗薄弱',
      unknown: '○未学',
      learning: '◐学习中'
    }[p.mastery?.status] || '○未学'
    const prefix = p.isTarget ? '【目标】' : `【前置${i + 1}】`
    return `${prefix}${p.name} ${statusLabel}${p.reason ? `（${p.reason}）` : ''}`
  }).join('\n')

  // GraphRAG 检索命中信息
  const hitsInfo = (kp.retrievalHits || []).map(h => {
    const sources = h.sources.join('+')
    return `  - ${h.nodeName} (${sources}, score=${h.fusedScore})`
  }).join('\n')

  return `目标知识点：${kp.target.name}（${kp.target.chapter}）
${kp.target.description || ''}

前置知识链：
${pathLines}

教学建议：${kp.focusHint || ''}
${hitsInfo ? `\nGraphRAG 检索命中：\n${hitsInfo}` : ''}`
}
