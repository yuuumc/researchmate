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
  // P0 命中漂移=0 主防线：基于原始 TF-IDF 分数判定知识库是否真实命中。
  //   - 命中（rawTop.score >= RAW_HIT_THRESHOLD）：注入检索切片 + 引用纪律
  //   - 未命中：不注入切片（防漂移）+ 强制声明「该专题暂未收录，以下为通用讲解」
  //   graphRag 融合分做了 min-max 归一化（top 恒 1.0），无法反映绝对置信度，
  //   故复用 rag.js retrieve 原始混合分数作为命中判定（索引已缓存，开销可忽略）。
  const RAW_HIT_THRESHOLD = 0.15
  const rawProbe = retrieve(userInput, knowledgeBase, 1)
  const rawTopScore = rawProbe.length > 0 ? (rawProbe[0].score || 0) : 0
  const hasConfidentHit = rawTopScore >= RAW_HIT_THRESHOLD

  let kbSection
  let guardDirective
  if (hasConfidentHit) {
    kbSection = `# 知识库检索结果（Top-${slices.length}，命中分数 ${rawTopScore.toFixed(3)}）
${ragContext || '（无相关切片）'}`
    guardDirective = `# 引用纪律（命中漂移=0 铁律）
以下「知识库检索结果」为可信来源。回答时严格遵守：
1. 仅可引用下方已列出的条目作为知识库依据，禁止引用未列出的条目。
2. 禁止编造来源、页码、章节号。
3. 若问题部分超出检索条目覆盖范围，对该部分明确标注「以下为通用知识，不在知识库内」，再基于通用知识补充。
4. 不得将不相关条目当作答案来源。`
  } else {
    kbSection = `# 知识库检索结果
（未检索到匹配条目；原始命中分数 ${rawTopScore.toFixed(3)} 低于阈值 ${RAW_HIT_THRESHOLD}，为防止命中漂移不注入任何切片）`
    guardDirective = `# 未收录声明（命中漂移=0 铁律，必须执行）
当前问题在研芯通知识库中未检索到匹配条目（命中分数低于阈值）。
你必须在回答最开头明确声明：
「该专题暂未收录到研芯通知识库，以下为基于通用知识的讲解。」
声明之后，基于通用知识作答。
严禁引用任何知识库条目（因未检索到匹配项），严禁编造来源、页码、章节号。`
  }

  const pathSection = pathContext ? `# 知识图谱路径分析（GraphRAG 双路融合）
${pathContext}
` : ''
  const prompt = `${TUTOR_PROMPT}

# 学生画像
${profileToContext(profile)}

${kbSection}

${guardDirective}

${pathSection}
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
      unknown: '',
      learning: '◐学习中'
    }[p.mastery?.status] || ''
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
