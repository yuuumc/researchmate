// ============================================================
// 知识图谱工具（v1 正式版 §四：知识库升级）
// ============================================================
// 功能：
//   1. 加载知识图谱 JSON
//   2. 通过 RAG 切片 ID 反查知识节点
//   3. 查询某节点的前置知识链（递归）
//   4. 结合学生画像标注每个节点的掌握状态
//   5. 生成"学习路径"上下文（供 Tutor Agent 使用）
//
// 对应 v1正式版.txt §四：
//   问题 → 知识节点 → 前置知识 → 回答
//   "你之前掌握MOS结构，所以重点补沟道夹断。"
// ============================================================

// 图谱缓存（按 subject 缓存）
const graphCache = new Map()

/**
 * 加载知识图谱（带缓存）
 * @param {string} subject - 学科标识，如 '半导体物理'
 * @param {object} graphData - 图谱 JSON 数据
 * @returns {object} { nodes: Map, edges: Array, nodeBySourceId: Map }
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

  const graph = {
    subject,
    nodes,
    nodeBySourceId,
    edges,
    adjacency
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
