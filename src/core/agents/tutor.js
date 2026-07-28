// ============================================================
// 专业导师 Agent（对应原工作流 N4b，苏格拉底式教学）
// ============================================================
// v1 正式版升级（v1正式版.txt §四：知识库升级）：
//   RAG 检索 → 知识节点识别 → 前置知识链 → 个性化回答
//   "你之前掌握MOS结构，所以重点补沟道夹断。"
//
// v1.5 升级：继承 BaseAgent，trace 自动埋点
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
import { traceAgent, runLLM } from './BaseAgent'

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
 * 专业导师（核心实现，traceAgent 包装版对外暴露）
 */
export const tutorAgent = traceAgent('tutor', async function tutorCore(userInput, profile) {
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

  // 4. 调用 LLM（API 失败时仍返回 knowledge_path，保证 UI 卡片正常渲染）
  let content
  let apiError = null
  try {
    const { content: llmContent } = await runLLM('tutor', prompt, userInput, {
      temperature: 0.5,
      max_tokens: 2000
    })
    content = llmContent
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
