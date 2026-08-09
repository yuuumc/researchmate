// ============================================================
// 知识图谱工具（v1 正式版 §四：知识库升级）
// ============================================================
// 功能：
//   1. 加载知识图谱 JSON
//   2. 通过 RAG 切片 ID 反查知识节点
//   3. 查询某节点的前置知识链（递归）
//   4. 结合学生画像标注每个节点的掌握状态
//   5. 生成"学习路径"上下文（供 Tutor Agent 使用）
//   v2.0 GraphRAG 升级：
//   6. 为每个节点构建特征哈希向量索引（nodeVectors）
//   7. graphRetrieve() —— 按问题向量语义召回相近节点（含前置链）
//
// 对应 v1正式版.txt §四：
//   问题 → 知识节点 → 前置知识 → 回答
//   "你之前掌握MOS结构，所以重点补沟道夹断。"
// ============================================================

import { tokenize } from './tokenize.js'

// 图谱缓存（按 subject 缓存）
const graphCache = new Map()

// ============================================================
// GraphRAG 向量化常量（P0-1）
// ============================================================
const VECTOR_DIM = 256          // 特征哈希向量维度（内存 / 区分度折中）
const HASH_SEED = 42            // 固定种子，保证同文本向量稳定

// ============================================================
// 特征哈希向量（零依赖，浏览器端语义向量）
// ============================================================
// 把文本 tokenize 后按词哈希到 VECTOR_DIM 维，词频累加 + L2 归一化。
// 同义词/近义表述因共享词（MOSFET/阈值电压/推导）会落在相近方向，从而
// 支持"语义近邻"召回，这是 GraphRAG 向量路的浏览器端轻量实现。
//
// 注意：这是 bag-of-words 哈希向量，非真 embedding，但零依赖、够演示。
// 若需更强语义可后续叠加 Supabase pgvector（见方案步骤 6 可选增强）。
// ============================================================

/**
 * 字符串哈希（FNV-1a 变体，带种子，保证稳定）
 * @param {string} str
 * @returns {number} 无符号 32 位整数
 */
function fnv1a(str, seed = HASH_SEED) {
  let h = 2166136261 ^ seed
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * 把文本转成 L2 归一化的特征哈希向量（Float64Array）
 * @param {string} text
 * @returns {Float64Array} 长度 VECTOR_DIM
 */
export function textToVector(text) {
  const vec = new Float64Array(VECTOR_DIM)
  if (!text || typeof text !== 'string') return vec

  const tokens = tokenize(text)
  for (const tk of tokens) {
    const idx = fnv1a(tk) % VECTOR_DIM
    vec[idx] += 1
  }

  // L2 归一化
  let norm = 0
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= norm
  }
  return vec
}

/**
 * 两个向量的余弦相似度
 * @param {Float64Array|number[]} a
 * @param {Float64Array|number[]} b
 * @returns {number} [-1, 1]
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * 构建图谱节点向量索引（仅当图谱数据含节点时执行）
 * @param {Map<string, object>} nodes - id -> node
 * @returns {Map<string, Float64Array>} nodeId -> 向量
 */
function buildNodeVectors(nodes) {
  const nodeVectors = new Map()
  for (const [id, node] of nodes) {
    const parts = [
      node.name || '',
      node.description || '',
      Array.isArray(node.keywords) ? node.keywords.join(' ') : ''
    ].join(' ')
    nodeVectors.set(id, textToVector(parts))
  }
  return nodeVectors
}

/**
 * 加载知识图谱（带缓存）
 * @param {string} subject - 学科标识，如 '半导体物理'
 * @param {object} graphData - 图谱 JSON 数据
 * @returns {object} { nodes: Map, edges: Array, nodeBySourceId: Map, nodeVectors: Map }
 */
export function loadGraph(subject, graphData) {
  if (graphCache.has(subject)) {
    return graphCache.get(subject)
  }

  const nodes = new Map()          // id -> node
  const nodeBySourceId = new Map() // source_id -> node
  const edges = []                  // { from, to, reason }
  const adjacency = new Map()       // to -> [from, ...]  前置依赖邻接表

  // 加载节点
  for (const node of graphData.nodes || []) {
    nodes.set(node.id, node)
    if (node.source_id) {
      nodeBySourceId.set(node.source_id, node)
    }
    adjacency.set(node.id, [])
  }

  // 加载边 + 构建邻接表
  for (const edge of graphData.edges || []) {
    edges.push(edge)
    if (adjacency.has(edge.to)) {
      adjacency.get(edge.to).push(edge)
    }
  }

  // GraphRAG：节点向量索引（语义近邻召回基础）
  const nodeVectors = buildNodeVectors(nodes)

  const graph = {
    subject,
    nodes,
    nodeBySourceId,
    edges,
    adjacency,
    nodeVectors
  }

  graphCache.set(subject, graph)
  return graph
}

/**
 * 通过 RAG 切片 ID 反查知识节点
 * @param {object} graph - loadGraph 返回值
 * @param {string} sourceId - RAG 切片的 id 字段
 * @returns {object|null} 知识节点
 */
export function findNodeBySourceId(graph, sourceId) {
  return graph.nodeBySourceId.get(sourceId) || null
}

/**
 * 通过关键词匹配知识节点（兜底：当 RAG 切片无 source_id 关联时）
 * @param {object} graph
 * @param {string[]} keywords - 查询关键词
 * @returns {object|null} 最佳匹配节点
 */
export function findNodeByKeywords(graph, keywords) {
  if (!keywords || keywords.length === 0) return null

  let bestNode = null
  let bestScore = 0

  for (const node of graph.nodes.values()) {
    const nodeKeywords = node.keywords || []
    let score = 0
    for (const kw of keywords) {
      for (const nkw of nodeKeywords) {
        if (nkw === kw) score += 2
        else if (nkw.includes(kw) && kw.length >= 2) score += 1
        else if (kw.includes(nkw) && nkw.length >= 2) score += 1
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestNode = node
    }
  }

  return bestScore > 0 ? bestNode : null
}

/**
 * GraphRAG：按问题向量语义召回相近知识节点（含前置链）
 * 这是 P0-1「图谱检索」向量路：query → textToVector → 与每个节点向量算余弦
 * → 取 Top-K 相近节点 → 每个命中节点携带其完整前置知识链。
 *
 * 区别于 findNodeByKeywords（词法精确匹配），本方法用向量相似度召回，
 * 能命中"同义/近义表述"（如"阈值电压推导" vs "V_th 怎么算"）。
 * 适合作为 Tutor Agent 的图谱检索主路，findNodeByKeywords 作兜底。
 *
 * @param {object} graph - loadGraph 返回值
 * @param {string} query - 用户问题
 * @param {object} [opts] - 可选参数
 * @param {number} [opts.topK=5] - 召回节点数
 * @param {number} [opts.minScore=0.15] - 相似度下限（低于则丢弃）
 * @param {boolean} [opts.withPrereq=true] - 是否附带前置知识链
 * @returns {Array<{node: object, score: number, prerequisites: Array}>} 按相似度降序
 */
export function graphRetrieve(graph, query, opts = {}) {
  if (!graph || !graph.nodeVectors || !query) return []
  const { topK = 5, minScore = 0.15, withPrereq = true } = opts || {}

  const queryVec = textToVector(query)
  // 查询向量为空（分词后无有效词）→ 无法召回
  let hasToken = false
  for (let i = 0; i < queryVec.length; i++) {
    if (queryVec[i] !== 0) { hasToken = true; break }
  }
  if (!hasToken) return []

  const scored = []
  for (const [id, vec] of graph.nodeVectors) {
    const node = graph.nodes.get(id)
    if (!node) continue
    const score = cosineSimilarity(queryVec, vec)
    if (score >= minScore) {
      scored.push({ node, score, nodeId: id })
    }
  }

  // 按相似度降序
  scored.sort((a, b) => b.score - a.score)

  const results = scored.slice(0, topK).map(({ node, score }) => {
    const item = { node, score: Number(score.toFixed(4)) }
    if (withPrereq) {
      // 用 getPrerequisiteChain 取该节点前置链（最基础在前）
      item.prerequisites = getPrerequisiteChain(graph, node.id)
    }
    return item
  })

  return results
}

/**
 * 递归获取某节点的完整前置知识链
 * @param {object} graph
 * @param {string} nodeId - 目标节点 ID
 * @param {Set} [visited] - 已访问节点（防环 + 去重）
 * @returns {Array} 前置节点列表，按依赖深度排序（最基础在前）
 */
export function getPrerequisiteChain(graph, nodeId, visited = new Set()) {
  if (visited.has(nodeId)) return []
  visited.add(nodeId)

  const prerequisites = graph.adjacency.get(nodeId) || []
  const chain = []

  for (const edge of prerequisites) {
    const fromNode = graph.nodes.get(edge.from)
    if (!fromNode) continue

    // 跳过已访问的节点（去重：同一节点不重复出现在路径中）
    if (visited.has(edge.from)) continue

    // 递归获取 from 节点的前置
    const deeperChain = getPrerequisiteChain(graph, edge.from, visited)
    chain.push(...deeperChain, { node: fromNode, reason: edge.reason })
  }

  return chain
}

/**
 * 掌握状态判定
 * @param {object} node - 知识节点
 * @param {object} profile - 学生画像
 * @returns {{status: 'mastered'|'weak'|'unknown', stars: number}}
 */
export function getNodeMastery(node, profile) {
  const topic = node.name

  // 优先检查 ability_stars（v1 正式版认知模型）
  if (profile.ability_stars && profile.ability_stars[topic] != null) {
    const stars = profile.ability_stars[topic]
    if (stars >= 4) return { status: 'mastered', stars }
    if (stars <= 2) return { status: 'weak', stars }
    return { status: 'learning', stars }
  }

  // 兼容旧字段 mastered_topics / weak_topics
  if (Array.isArray(profile.mastered_topics) && profile.mastered_topics.includes(topic)) {
    return { status: 'mastered', stars: 5 }
  }
  if (Array.isArray(profile.weak_topics) && profile.weak_topics.includes(topic)) {
    return { status: 'weak', stars: 1 }
  }

  return { status: 'unknown', stars: 0 }
}

/**
 * 生成学习路径上下文（供 Tutor Agent 注入 Prompt）
 * @param {object} graph
 * @param {object} targetNode - 目标知识节点
 * @param {object} profile - 学生画像
 * @returns {object} { context: string, path: Array, focusHint: string }
 */
export function buildLearningPathContext(graph, targetNode, profile) {
  if (!targetNode) {
    return { context: '', path: [], focusHint: '' }
  }

  // 获取前置链（最基础在前）
  const chain = getPrerequisiteChain(graph, targetNode.id)

  // 构建完整路径：前置节点 + 目标节点
  const fullPath = [
    ...chain.map((item) => ({
      node: item.node,
      reason: item.reason,
      mastery: getNodeMastery(item.node, profile),
      isTarget: false
    })),
    {
      node: targetNode,
      reason: '当前问题',
      mastery: getNodeMastery(targetNode, profile),
      isTarget: true
    }
  ]

  // 找到第一个未掌握的前置（重点补强对象）
  const firstWeak = fullPath.find((p) => p.mastery.status === 'weak' || p.mastery.status === 'unknown')
  const focusHint = firstWeak
    ? `你之前${firstWeak.mastery.status === 'weak' ? '薄弱' : '未学'}「${firstWeak.node.name}」，建议先补这个前置知识。`
    : `你的前置知识都已掌握，可以直接学习「${targetNode.name}」。`

  // 生成上下文文本（供 LLM）
  const pathText = fullPath
    .map((p, i) => {
      const statusLabel = {
        mastered: '✓已掌握',
        weak: '✗薄弱',
        unknown: '○未学',
        learning: '◐学习中'
      }[p.mastery.status]
      const prefix = p.isTarget ? '【目标】' : `【前置${i + 1}】`
      return `${prefix}${p.node.name} ${statusLabel}${p.reason ? `（${p.reason}）` : ''}`
    })
    .join('\n')

  const context = `# 知识图谱路径分析
目标知识点：${targetNode.name}（${targetNode.chapter}）
${targetNode.description}

前置知识链：
${pathText}

教学建议：${focusHint}
`

  return {
    context,
    path: fullPath,
    focusHint
  }
}

/**
 * 清除图谱缓存
 * @param {string} [subject] - 指定学科，不传则清空全部
 */
export function clearGraphCache(subject) {
  if (subject) {
    graphCache.delete(subject)
  } else {
    graphCache.clear()
  }
}
