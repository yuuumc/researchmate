// ============================================================
// 专业导师 Agent（v2.0 SSE 版）
// ============================================================
// v1 正式版：RAG 检索 → 知识节点识别 → 前置知识链 → 个性化回答
// v1.5：继承 BaseAgent，trace 自动埋点
// v2.0：支持流式（ctx.onToken）+ 取消（ctx.signal），首 token 延迟 < 2s
// ============================================================

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
 * 专业导师（v2.0 接 ctx.onToken + ctx.signal）
 */
export const tutorAgent = traceAgent('tutor', async function tutorCore(userInput, profile, ctx = {}) {
  const onToken = ctx?.onToken || null
  const signal = ctx?.signal || null

  // 1. RAG 检索 Top-5
  const slices = retrieve(userInput, knowledgeBase, 5)
  const ragContext = buildContext(slices)

  // 2. 知识图谱路径分析（v1 正式版 §四）
  let knowledgePath = null
  let pathContext = ''

  if (knowledgeGraph && slices.length > 0) {
    const topSlice = slices[0]
    let targetNode = findNodeBySourceId(knowledgeGraph, topSlice.id)

    if (!targetNode && topSlice._matched_keywords) {
      targetNode = findNodeByKeywords(knowledgeGraph, topSlice._matched_keywords)
    }

    console.log('[tutor] knowledge graph lookup:', {
      graphLoaded: !!knowledgeGraph,
      topSliceId: topSlice.id,
      targetNodeFound: !!targetNode,
      targetNodeName: targetNode?.name
    })

    if (targetNode) {
      const pathResult = buildLearningPathContext(knowledgeGraph, targetNode, profile)
      pathContext = pathResult.context
      knowledgePath = {
        target: {
          id: targetNode.id,
          name: targetNode.name,
          chapter: targetNode.chapter,
          description: targetNode.description
        },
        path: pathResult.path.map((p) => ({
          id: p.node.id,
          name: p.node.name,
          chapter: p.node.chapter,
          reason: p.reason,
          mastery: p.mastery,
          isTarget: p.isTarget
        })),
        focusHint: pathResult.focusHint
      }
    }
  }

  // 3. 拼 Prompt（含知识图谱路径上下文）
  const prompt = `${TUTOR_PROMPT}

# 学生画像
${profileToContext(profile)}

# 知识库检索结果（Top-${slices.length}）
${ragContext || '（无相关切片，按通用知识回答）'}

${pathContext ? `# 知识图谱路径分析（v1 正式版）\n${pathContext}\n` : ''}
`

  // 4. 调用 LLM（v2.0：接 ctx.onToken → 流式；否则非流式）
  let content
  let apiError = null
  try {
    const result = await callLLM('tutor', prompt, userInput, {
      temperature: 0.5,
      max_tokens: 2000
    }, false, onToken, signal)
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
    error: apiError ? true : undefined
  }
})
