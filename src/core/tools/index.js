// ============================================================
// P0-2: Agent 工具调用框架 + 5 个 Stub 工具（D1）
// ============================================================
// 设计：
//   registerTool(name, handler, schema) → 注册工具
//   callTool(name, args, options) → 执行工具（内置超时保护）
//   getToolSchemas() → 获取所有工具 schema（供 INTENT_PROMPT 注入）
//
// 5 个工具：
//   1. query_university  — Admission（10 所长三角院校 stub）
//   2. recommend_papers  — Research（8 篇半导体/AI芯片论文 stub）
//   3. generate_plan     — Planner（按周数动态生成模板计划）
//   4. store_progress    — Diagnose/Planner（localStorage 真实持久化）
//   5. search_knowledge  — Tutor（复用 GraphRAG，≤3s 超时，非纯 stub）
//
// 约束：
//   - 零新增 npm 依赖
//   - 不碰 vector.js / graphRag.js / vectorMemory.js（P0-1/P0-3 已验收）
//   - search_knowledge 的 graphRagRetrieve 通过 options 注入，非静态 import
//     → 模块零外部依赖，Node 测试可直接 import
// ============================================================

// ============================================================
// Tool Registry
// ============================================================

const _toolRegistry = new Map()

/**
 * 注册工具
 * @param {string} name - 工具名（唯一标识）
 * @param {Function} handler - 异步函数 (args, options) => result
 * @param {object} schema - { description, args_schema, timeout, mounted_on }
 */
export function registerTool(name, handler, schema = {}) {
  if (!name || typeof handler !== 'function') {
    throw new Error(`registerTool: invalid name or handler for "${name}"`)
  }
  _toolRegistry.set(name, { handler, schema: { description: '', args_schema: {}, timeout: 3000, ...schema } })
}

/**
 * 获取所有已注册工具的 schema（供 INTENT_PROMPT 注入）
 * @returns {object} { toolName: { description, args_schema, mounted_on } }
 */
export function getToolSchemas() {
  const schemas = {}
  for (const [name, { schema }] of _toolRegistry) {
    schemas[name] = {
      description: schema.description,
      args_schema: schema.args_schema,
      mounted_on: schema.mounted_on,
      timeout: schema.timeout
    }
  }
  return schemas
}

/**
 * 调用工具（内置超时保护）
 * @param {string} name - 工具名
 * @param {object} args - 工具参数
 * @param {object} options - { timeout?, knowledgeBase?, knowledgeGraph?, graphRagRetrieve? }
 * @returns {Promise<{ok: boolean, data?: any, error?: string, tool?: string}>}
 *
 * 失败降级：工具失败不抛异常，返回 { ok: false, error }
 * 超时保护：默认 3s，可由 schema.timeout 或 options.timeout 覆盖
 */
export async function callTool(name, args = {}, options = {}) {
  const tool = _toolRegistry.get(name)
  if (!tool) {
    return { ok: false, error: `unknown_tool: ${name}`, tool: name }
  }

  const timeout = options.timeout ?? tool.schema.timeout ?? 3000
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()

  try {
    const result = await Promise.race([
      tool.handler(args, options),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`tool_timeout: ${name} exceeded ${timeout}ms`)), timeout)
      )
    ])
    const elapsed = typeof performance !== 'undefined'
      ? Math.round(performance.now() - t0)
      : Date.now() - t0
    return { ok: true, data: result, tool: name, elapsedMs: elapsed }
  } catch (e) {
    console.warn(`[tools] callTool "${name}" failed:`, e.message)
    return { ok: false, error: e.message, tool: name }
  }
}

// ============================================================
// Tool 1: query_university (Admission Agent)
// 10 所长三角院校 stub 数据（211/985 + 双非强校）
// ============================================================

const UNIVERSITY_STUB = [
  { school: '浙江大学', region: '杭州', level: '985', major: '集成电路工程', score_line: 360, ratio: '4.5:1', enrollment: 85, year: 2025 },
  { school: '上海交通大学', region: '上海', level: '985', major: '集成电路工程', score_line: 355, ratio: '5.2:1', enrollment: 90, year: 2025 },
  { school: '复旦大学', region: '上海', level: '985', major: '微电子学', score_line: 350, ratio: '6.0:1', enrollment: 60, year: 2025 },
  { school: '南京大学', region: '南京', level: '985', major: '集成电路工程', score_line: 345, ratio: '4.0:1', enrollment: 70, year: 2025 },
  { school: '东南大学', region: '南京', level: '985', major: '集成电路工程', score_line: 340, ratio: '3.8:1', enrollment: 95, year: 2025 },
  { school: '中国科学技术大学', region: '合肥', level: '985', major: '微电子与固体电子学', score_line: 345, ratio: '4.2:1', enrollment: 55, year: 2025 },
  { school: '同济大学', region: '上海', level: '985', major: '集成电路工程', score_line: 330, ratio: '3.5:1', enrollment: 65, year: 2025 },
  { school: '华东师范大学', region: '上海', level: '985', major: '微电子学', score_line: 325, ratio: '3.0:1', enrollment: 40, year: 2025 },
  { school: '上海大学', region: '上海', level: '211', major: '集成电路工程', score_line: 315, ratio: '2.8:1', enrollment: 75, year: 2025 },
  { school: '杭州电子科技大学', region: '杭州', level: '双非', major: '集成电路工程', score_line: 300, ratio: '2.5:1', enrollment: 120, year: 2025 }
]

registerTool('query_university', async (args) => {
  const { region, level, major } = args || {}
  let results = [...UNIVERSITY_STUB]
  if (region) results = results.filter(u => u.region.includes(region))
  if (level) results = results.filter(u => u.level === level)
  if (major) results = results.filter(u => u.major.includes(major))
  return { count: results.length, universities: results }
}, {
  description: '查询长三角地区考研院校信息（分数线/报录比/招生人数）',
  args_schema: { region: 'string?（地区，如上海/杭州/南京）', level: '985|211|双非?', major: 'string?（专业关键词）' },
  timeout: 1000,
  mounted_on: 'admission'
})

// ============================================================
// Tool 2: recommend_papers (Research Agent)
// 8 篇半导体/AI芯片方向论文 stub
// ============================================================

const PAPER_STUB = [
  { title: 'Attention Is All You Need', authors: 'Vaswani et al.', year: 2017, venue: 'NeurIPS', direction: 'AI芯片/Transformer', url: 'https://arxiv.org/abs/1706.03762' },
  { title: 'Deep Learning Approaches for Semiconductor Device Modeling', authors: 'Li et al.', year: 2023, venue: 'IEEE TED', direction: '半导体器件', url: '' },
  { title: 'Efficient Processing of Deep Neural Networks: A Tutorial and Survey', authors: 'Sze et al.', year: 2020, venue: 'IEEE TCAD', direction: 'AI芯片/硬件加速', url: 'https://arxiv.org/abs/2003.07385' },
  { title: 'Graph Neural Networks: A Review of Methods and Applications', authors: 'Zhou et al.', year: 2020, venue: 'AI Open', direction: 'AI芯片/GNN', url: '' },
  { title: 'Training Deep Neural Networks with 16-bit Floating Point', authors: 'Micikevicius et al.', year: 2018, venue: 'ICLR', direction: 'AI芯片/低精度计算', url: '' },
  { title: 'Neuromorphic Computing: A Survey of Trends and Applications', authors: 'Schuman et al.', year: 2022, venue: 'IEEE TNANO', direction: '类脑计算', url: '' },
  { title: 'Physics-Informed Neural Networks for Semiconductor Device Simulation', authors: 'Karpatne et al.', year: 2023, venue: 'Nature Electronics', direction: '半导体/PINN', url: '' },
  { title: 'Eyeriss: An Energy-Efficient Reconfigurable Accelerator for CNNs', authors: 'Chen et al.', year: 2019, venue: 'ISCA', direction: 'AI芯片/能效优化', url: '' }
]

registerTool('recommend_papers', async (args) => {
  const { direction } = args || {}
  let results = [...PAPER_STUB]
  if (direction) {
    results = results.filter(p => p.direction.includes(direction))
  }
  return { count: results.length, papers: results }
}, {
  description: '推荐半导体/AI芯片方向论文',
  args_schema: { direction: 'string?（方向关键词，如半导体/AI芯片/类脑计算）' },
  timeout: 1000,
  mounted_on: 'research'
})

// ============================================================
// Tool 3: generate_plan (Planner Agent)
// 按周数动态生成模板计划
// ============================================================

registerTool('generate_plan', async (args) => {
  const { weeks = 12, stage = 'basic', weak_topics = [] } = args || {}
  const totalWeeks = Math.min(Math.max(isNaN(parseInt(weeks)) ? 12 : parseInt(weeks), 1), 52)
  const topics = Array.isArray(weak_topics) ? weak_topics : []

  const weeklyPlan = []
  for (let i = 1; i <= totalWeeks; i++) {
    const phaseRatio = i / totalWeeks
    const phase = phaseRatio <= 0.3 ? '基础巩固' : phaseRatio <= 0.7 ? '强化训练' : '冲刺模拟'
    const focus = topics.length > 0 && i <= topics.length
      ? `攻克薄弱项：${topics[(i - 1) % topics.length]}`
      : `综合复习第 ${i} 周`

    weeklyPlan.push({
      week: i,
      phase,
      focus,
      daily_hours: 6,
      tasks: ['理论知识点复习', '习题练习（10题/天）', '错题回顾与总结']
    })
  }

  return {
    total_weeks: totalWeeks,
    stage,
    weak_topics: topics,
    weekly_plan: weeklyPlan
  }
}, {
  description: '按周数动态生成复习计划模板',
  args_schema: { weeks: 'number?（1-52，默认12）', stage: 'string?（起步/基础/强化/冲刺）', weak_topics: 'string[]?（薄弱知识点列表）' },
  timeout: 1000,
  mounted_on: 'planner'
})

// ============================================================
// Tool 4: store_progress (Diagnose/Planner Agent)
// localStorage 真实持久化
// ============================================================

registerTool('store_progress', async (args) => {
  const { type, data } = args || {}

  if (typeof localStorage === 'undefined') {
    return { stored: false, reason: 'no localStorage (SSR environment)' }
  }

  try {
    const key = 'tool_progress_history'
    let history = []
    try {
      history = JSON.parse(localStorage.getItem(key) || '[]')
    } catch (_) { history = [] }

    history.push({ type: type || 'unknown', data: data || {}, ts: Date.now() })

    // 容量上限 100 条（FIFO 淘汰）
    if (history.length > 100) history = history.slice(-100)

    localStorage.setItem(key, JSON.stringify(history))
    return { stored: true, total: history.length }
  } catch (e) {
    return { stored: false, error: e.message }
  }
}, {
  description: '存储学习进度到本地（持久化）',
  args_schema: { type: 'diagnose|plan|admission|qa', data: 'object' },
  timeout: 1000,
  mounted_on: 'diagnose,planner'
})

// ============================================================
// Tool 5: search_knowledge (Tutor Agent)
// 复用 GraphRAG 双路融合检索（非纯 stub）
// ≤3s 超时保护（补充要求 #2）
// graphRagRetrieve 通过 options 注入，非静态 import → 零外部依赖
// ============================================================

let _knowledgeBase = []
let _knowledgeGraph = null

/**
 * 注入知识库（由 main.js / tutor 模块调用）
 * @param {Array} kb - 知识库切片数组
 */
export function setKnowledgeBaseForTools(kb) {
  _knowledgeBase = Array.isArray(kb) ? kb : []
}

/**
 * 注入知识图谱
 * @param {object|null} graph - 知识图谱对象
 */
export function setKnowledgeGraphForTools(graph) {
  _knowledgeGraph = graph || null
}

registerTool('search_knowledge', async (args, options = {}) => {
  const { query, topK = 5 } = args || {}

  if (!query || typeof query !== 'string' || !query.trim()) {
    return { count: 0, slices: [], message: 'empty query' }
  }

  // 优先使用 options 注入的 KB/graph（router 调用时传入）
  const kb = options.knowledgeBase || _knowledgeBase
  const graph = options.knowledgeGraph || _knowledgeGraph
  const retrieveFn = options.graphRagRetrieve || null

  if (!kb || kb.length === 0) {
    // Stub fallback：知识库未加载
    return { count: 0, slices: [], message: '知识库未加载（stub fallback）' }
  }

  if (!retrieveFn || typeof retrieveFn !== 'function') {
    // GraphRAG 检索函数未注入
    return { count: 0, slices: [], message: 'GraphRAG 检索函数未注入' }
  }

  // 复用 P0-1 GraphRAG 双路融合检索（不修改 graphRag.js）
  const ragResult = retrieveFn(query, kb, graph, { topK })

  return {
    count: ragResult.slices?.length || 0,
    slices: (ragResult.slices || []).map(s => ({
      id: s.id,
      content: typeof s.content === 'string' ? s.content.slice(0, 200) : '',
      score: s.score
    })),
    ragContext: typeof ragResult.ragContext === 'string'
      ? ragResult.ragContext.slice(0, 500)
      : ''
  }
}, {
  description: '搜索知识库（复用 GraphRAG 双路融合检索，≤3s 超时）',
  args_schema: { query: 'string（搜索关键词）', topK: 'number?（返回条数，默认5）' },
  timeout: 3000,  // 补充要求 #2：≤3s 超时上限
  mounted_on: 'tutor'
})

// ============================================================
// 测试辅助（仅 test 文件使用）
// ============================================================

export function _getRegistry() {
  return _toolRegistry
}

export function _clearRegistry() {
  _toolRegistry.clear()
}

export function _resetRegistry() {
  _toolRegistry.clear()
  // 重新注册所有工具
  _registerAllTools()
}

// 重新注册（用于测试隔离）
function _registerAllTools() {
  // query_university
  registerTool('query_university', async (args) => {
    const { region, level, major } = args || {}
    let results = [...UNIVERSITY_STUB]
    if (region) results = results.filter(u => u.region.includes(region))
    if (level) results = results.filter(u => u.level === level)
    if (major) results = results.filter(u => u.major.includes(major))
    return { count: results.length, universities: results }
  }, { description: '查询长三角地区考研院校信息', args_schema: { region: 'string?', level: '985|211|双非?', major: 'string?' }, timeout: 1000, mounted_on: 'admission' })

  // recommend_papers
  registerTool('recommend_papers', async (args) => {
    const { direction } = args || {}
    let results = [...PAPER_STUB]
    if (direction) results = results.filter(p => p.direction.includes(direction))
    return { count: results.length, papers: results }
  }, { description: '推荐半导体/AI芯片方向论文', args_schema: { direction: 'string?' }, timeout: 1000, mounted_on: 'research' })

  // generate_plan
  registerTool('generate_plan', async (args) => {
    const { weeks = 12, stage = 'basic', weak_topics = [] } = args || {}
    const totalWeeks = Math.min(Math.max(isNaN(parseInt(weeks)) ? 12 : parseInt(weeks), 1), 52)
    const topics = Array.isArray(weak_topics) ? weak_topics : []
    const weeklyPlan = []
    for (let i = 1; i <= totalWeeks; i++) {
      const phaseRatio = i / totalWeeks
      const phase = phaseRatio <= 0.3 ? '基础巩固' : phaseRatio <= 0.7 ? '强化训练' : '冲刺模拟'
      const focus = topics.length > 0 && i <= topics.length
        ? `攻克薄弱项：${topics[(i - 1) % topics.length]}`
        : `综合复习第 ${i} 周`
      weeklyPlan.push({ week: i, phase, focus, daily_hours: 6, tasks: ['理论知识点复习', '习题练习（10题/天）', '错题回顾与总结'] })
    }
    return { total_weeks: totalWeeks, stage, weak_topics: topics, weekly_plan: weeklyPlan }
  }, { description: '按周数动态生成复习计划模板', args_schema: { weeks: 'number?', stage: 'string?', weak_topics: 'string[]?' }, timeout: 1000, mounted_on: 'planner' })

  // store_progress
  registerTool('store_progress', async (args) => {
    const { type, data } = args || {}
    if (typeof localStorage === 'undefined') return { stored: false, reason: 'no localStorage (SSR)' }
    try {
      const key = 'tool_progress_history'
      let history = []
      try { history = JSON.parse(localStorage.getItem(key) || '[]') } catch (_) { history = [] }
      history.push({ type: type || 'unknown', data: data || {}, ts: Date.now() })
      if (history.length > 100) history = history.slice(-100)
      localStorage.setItem(key, JSON.stringify(history))
      return { stored: true, total: history.length }
    } catch (e) { return { stored: false, error: e.message } }
  }, { description: '存储学习进度到本地', args_schema: { type: 'string', data: 'object' }, timeout: 1000, mounted_on: 'diagnose,planner' })

  // search_knowledge
  registerTool('search_knowledge', async (args, options = {}) => {
    const { query, topK = 5 } = args || {}
    if (!query || !query.trim()) return { count: 0, slices: [], message: 'empty query' }
    const kb = options.knowledgeBase || _knowledgeBase
    const graph = options.knowledgeGraph || _knowledgeGraph
    const retrieveFn = options.graphRagRetrieve || null
    if (!kb || kb.length === 0) return { count: 0, slices: [], message: '知识库未加载（stub fallback）' }
    if (!retrieveFn) return { count: 0, slices: [], message: 'GraphRAG 检索函数未注入' }
    const ragResult = retrieveFn(query, kb, graph, { topK })
    return {
      count: ragResult.slices?.length || 0,
      slices: (ragResult.slices || []).map(s => ({ id: s.id, content: typeof s.content === 'string' ? s.content.slice(0, 200) : '', score: s.score })),
      ragContext: typeof ragResult.ragContext === 'string' ? ragResult.ragContext.slice(0, 500) : ''
    }
  }, { description: '搜索知识库（复用 GraphRAG，≤3s 超时）', args_schema: { query: 'string', topK: 'number?' }, timeout: 3000, mounted_on: 'tutor' })
}

export default {
  registerTool,
  callTool,
  getToolSchemas,
  setKnowledgeBaseForTools,
  setKnowledgeGraphForTools
}
