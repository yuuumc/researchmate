// ============================================================
// GraphRAG 双路融合检索（P0-1）
// ============================================================
// 三路并行召回 → min-max 归一 → 加权融合 → 去重
//
// 路径 1: TF-IDF 检索（rag.js retrieve）
//   语义相关性 + 子串加权，基于知识库切片
//
// 路径 2: 图谱向量检索（knowledgeGraph.js graphRetrieve）
//   特征哈希向量余弦相似度，基于知识图谱节点
//   能命中同义/近义表述（"阈值电压推导" vs "V_th 怎么算"）
//
// 路径 3: 关键词图谱匹配（knowledgeGraph.js findNodeByKeywords）
//   词法精确匹配，作为向量路的补充
//
// 融合策略：
//   - 各路分数 min-max 归一化到 [0, 1]
//   - 加权求和：TF-IDF 0.4 + 图谱向量 0.4 + 关键词 0.2
//   - 按 source_id 去重（图谱节点通过 source_id 关联切片）
//   - 返回 Top-K 融合结果 + trace 信息
//
// 兜底：无图谱时退化为纯 TF-IDF（向后兼容）
// ============================================================

import { retrieve, buildContext } from './rag.js'
import {
  graphRetrieve,
  findNodeBySourceId,
  findNodeByKeywords,
  buildLearningPathContext,
  getPrerequisiteChain,
  getNodeMastery
} from './knowledgeGraph.js'
import { extractKeywords } from './tokenize.js'
import { textToVector, cosineSimilarity, minMaxNormalize, isZeroVector } from './vector.js'

// ============================================================
// 融合权重
// ============================================================
const WEIGHT_TFIDF = 0.4       // TF-IDF 检索权重
const WEIGHT_GRAPH_VEC = 0.4   // 图谱向量检索权重
const WEIGHT_KEYWORD = 0.2     // 关键词图谱匹配权重

/**
 * GraphRAG 双路融合检索
 *
 * @param {string} query - 用户问题
 * @param {Array} knowledgeBase - 知识库切片数组
 * @param {object|null} knowledgeGraph - loadGraph 返回的图谱对象（null 时退化为纯 TF-IDF）
 * @param {object} [opts]
 * @param {number} [opts.topK=5] - 返回结果数
 * @param {object} [opts.profile] - 学生画像（用于知识路径掌握状态标注）
 * @returns {{
 *   slices: Array,
 *   ragContext: string,
 *   knowledgePath: object|null,
 *   trace: { tfidf: Array, graphVec: Array, keyword: Array, fused: Array }
 * }}
 */
export function graphRagRetrieve(query, knowledgeBase, knowledgeGraph, opts = {}) {
  const { topK = 5, profile = null } = opts || {}

  // --- 无图谱：退化为纯 TF-IDF（向后兼容）---
  if (!knowledgeGraph || !knowledgeGraph.nodes || knowledgeGraph.nodes.size === 0) {
    const slices = retrieve(query, knowledgeBase, topK)
    return {
      slices,
      ragContext: buildContext(slices),
      knowledgePath: null,
      trace: {
        tfidf: slices.map(s => ({ id: s.id, score: s.score })),
        graphVec: [],
        keyword: [],
        fused: slices.map(s => ({ id: s.id, score: s.score, sources: ['tfidf'] })),
        degraded: true
      }
    }
  }

  // ============================================================
  // 路径 1: TF-IDF 检索（知识库切片）
  // ============================================================
  const tfidfResults = retrieve(query, knowledgeBase, topK * 2) // 多取一些用于融合

  // ============================================================
  // 路径 2: 图谱向量检索（语义近邻召回）
  // ============================================================
  const graphVecResults = graphRetrieve(query, knowledgeGraph, {
    topK: topK * 2,
    minScore: 0.05,   // 降低阈值，让融合来排序
    withPrereq: false // 融合阶段不需要前置链，后续按 top-1 构建路径
  })

  // ============================================================
  // 路径 3: 关键词图谱匹配
  // ============================================================
  const queryKws = extractKeywords(query)
  let keywordNode = null
  let keywordScore = 0
  if (queryKws.length > 0) {
    keywordNode = findNodeByKeywords(knowledgeGraph, queryKws)
    if (keywordNode) {
      // 计算关键词匹配得分（归一化到 0-1）
      const nodeKws = keywordNode.keywords || []
      let matchCount = 0
      for (const qkw of queryKws) {
        for (const nkw of nodeKws) {
          if (nkw === qkw || nkw.includes(qkw) || qkw.includes(nkw)) {
            matchCount++
            break
          }
        }
      }
      keywordScore = queryKws.length > 0 ? matchCount / queryKws.length : 0
    }
  }

  // ============================================================
  // Min-Max 归一化各路分数
  // ============================================================

  // TF-IDF 分数归一化
  const tfidfScores = tfidfResults.map(s => s.score || 0)
  const tfidfNorm = minMaxNormalize(tfidfScores)

  // 图谱向量分数归一化
  const graphVecScores = graphVecResults.map(r => r.score || 0)
  const graphVecNorm = minMaxNormalize(graphVecScores)

  // 关键词分数已经是 0-1（单个节点）
  const kwNorm = keywordScore

  // ============================================================
  // 构建统一候选池（按 source_id 去重）
  // ============================================================
  const candidateMap = new Map() // source_id -> { item, scores, sources }

  // 1. 加入 TF-IDF 结果
  tfidfResults.forEach((item, idx) => {
    const sid = item.id
    if (!candidateMap.has(sid)) {
      candidateMap.set(sid, {
        id: sid,
        content: item.content,
        source: item.source,
        keywords: item.keywords,
        scores: { tfidf: 0, graphVec: 0, keyword: 0 },
        sources: [],
        _matched_keywords: item._matched_keywords || [],
        _tfidf_score: item._tfidf_score,
        _substr_score: item._substr_score,
        _exact_matches: item._exact_matches || 0
      })
    }
    const cand = candidateMap.get(sid)
    cand.scores.tfidf = tfidfNorm[idx] || 0
    cand.sources.push('tfidf')
  })

  // 2. 加入图谱向量结果（通过 source_id 关联到切片）
  graphVecResults.forEach((result, idx) => {
    const node = result.node
    const sid = node.source_id
    if (!sid) return // 无 source_id 的节点跳过（无法关联到切片）

    if (!candidateMap.has(sid)) {
      // 图谱命中但 TF-IDF 未命中的切片——从知识库中查找
      const kbItem = knowledgeBase.find(k => k.id === sid)
      if (!kbItem) return // 知识库中无对应切片
      candidateMap.set(sid, {
        id: sid,
        content: kbItem.content,
        source: kbItem.source,
        keywords: kbItem.keywords,
        scores: { tfidf: 0, graphVec: 0, keyword: 0 },
        sources: [],
        _matched_keywords: [],
        _exact_matches: 0,
        _graph_node: node
      })
    }
    const cand = candidateMap.get(sid)
    cand.scores.graphVec = graphVecNorm[idx] || 0
    cand.sources.push('graphVec')
    if (!cand._graph_node) cand._graph_node = node
  })

  // 3. 加入关键词匹配结果
  if (keywordNode && keywordNode.source_id) {
    const sid = keywordNode.source_id
    if (!candidateMap.has(sid)) {
      const kbItem = knowledgeBase.find(k => k.id === sid)
      if (kbItem) {
        candidateMap.set(sid, {
          id: sid,
          content: kbItem.content,
          source: kbItem.source,
          keywords: kbItem.keywords,
          scores: { tfidf: 0, graphVec: 0, keyword: 0 },
          sources: [],
          _matched_keywords: [],
          _exact_matches: 0,
          _graph_node: keywordNode
        })
      }
    }
    if (candidateMap.has(sid)) {
      const cand = candidateMap.get(sid)
      cand.scores.keyword = kwNorm
      cand.sources.push('keyword')
      if (!cand._graph_node) cand._graph_node = keywordNode
    }
  }

  // ============================================================
  // 加权融合 + 排序 + Top-K
  // ============================================================
  const fused = Array.from(candidateMap.values()).map(cand => {
    const fusedScore =
      WEIGHT_TFIDF * cand.scores.tfidf +
      WEIGHT_GRAPH_VEC * cand.scores.graphVec +
      WEIGHT_KEYWORD * cand.scores.keyword

    return {
      ...cand,
      score: Number(fusedScore.toFixed(4)),
      _fused_scores: {
        tfidf: Number(cand.scores.tfidf.toFixed(4)),
        graphVec: Number(cand.scores.graphVec.toFixed(4)),
        keyword: Number(cand.scores.keyword.toFixed(4))
      },
      _retrieval_sources: cand.sources
    }
  })

  // 过滤掉全零分数的候选（三路都没命中）
  const filtered = fused.filter(item => item.score > 0)

  // 按融合分数降序排列
  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    // 同分时，命中路径多的优先
    return (b._retrieval_sources?.length || 0) - (a._retrieval_sources?.length || 0)
  })

  const topResults = filtered.slice(0, topK)

  // ============================================================
  // 构建知识图谱路径（基于 Top-1 结果的图谱节点）
  // ============================================================
  let knowledgePath = null
  let pathContext = ''

  const topGraphNode = topResults.find(r => r._graph_node)?._graph_node
  if (topGraphNode) {
    const pathResult = buildLearningPathContext(knowledgeGraph, topGraphNode, profile || {})
    pathContext = pathResult.context
    knowledgePath = {
      target: {
        id: topGraphNode.id,
        name: topGraphNode.name,
        chapter: topGraphNode.chapter,
        description: topGraphNode.description
      },
      path: pathResult.path.map(p => ({
        id: p.node.id,
        name: p.node.name,
        chapter: p.node.chapter,
        reason: p.reason,
        mastery: p.mastery,
        isTarget: p.isTarget
      })),
      focusHint: pathResult.focusHint,
      // GraphRAG 新增：检索命中信息
      retrievalHits: topResults
        .filter(r => r._graph_node)
        .map(r => ({
          nodeId: r._graph_node.id,
          nodeName: r._graph_node.name,
          sourceId: r.id,
          fusedScore: r.score,
          scores: r._fused_scores,
          sources: r._retrieval_sources
        }))
    }
  }

  // ============================================================
  // 构建 trace 信息
  // ============================================================
  const trace = {
    tfidf: tfidfResults.slice(0, topK).map(s => ({
      id: s.id,
      score: s.score,
      normalizedScore: tfidfNorm[tfidfResults.indexOf(s)] || 0
    })),
    graphVec: graphVecResults.slice(0, topK).map((r, i) => ({
      nodeId: r.node?.id,
      nodeName: r.node?.name,
      sourceId: r.node?.source_id,
      score: r.score,
      normalizedScore: graphVecNorm[i] || 0
    })),
    keyword: keywordNode ? [{
      nodeId: keywordNode.id,
      nodeName: keywordNode.name,
      sourceId: keywordNode.source_id,
      score: keywordScore,
      normalizedScore: kwNorm
    }] : [],
    fused: topResults.map(r => ({
      id: r.id,
      score: r.score,
      sources: r._retrieval_sources,
      scores: r._fused_scores
    })),
    degraded: false,
    weights: { tfidf: WEIGHT_TFIDF, graphVec: WEIGHT_GRAPH_VEC, keyword: WEIGHT_KEYWORD }
  }

  return {
    slices: topResults,
    ragContext: buildContext(topResults),
    knowledgePath,
    trace
  }
}
