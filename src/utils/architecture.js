// ============================================================
// B5 架构看板 — 数据归一化与聚合工具（纯函数，可契约测试）
// 数据源：GET /api/agent/traces（agent_traces 表，路径 A 落库）
// ============================================================

// Agent 角色元信息（展示用；未登记角色走 fallback）
export const AGENT_ROLE_META = {
  router:   { label: '意图路由',   icon: 'route', color: '#8b5cf6', desc: '识别用户意图，分发到对应 Agent' },
  diagnose: { label: '诊断 Agent', icon: 'activity', color: '#f59e0b', desc: '混合诊断出题与学情评估' },
  tutor:    { label: '导师 Agent', icon: 'message', color: '#00d4aa', desc: '智能对话与答疑辅导' },
  plan:     { label: '规划 Agent', icon: 'clipboard', color: '#3b82f6', desc: '生成个性化复习计划' },
  practice: { label: '练习 Agent', icon: 'check-square', color: '#ec4899', desc: '薄弱点抽题与判分' },
  career:   { label: '就业 Agent', icon: 'briefcase', color: '#10b981', desc: '就业方向指导' },
  research: { label: '科研 Agent', icon: 'search', color: '#6366f1', desc: '科研探索与工具调用' },
  peer:     { label: '同伴 Agent', icon: 'users', color: '#14b8a6', desc: '同伴学习协作' }
}

const FALLBACK_META = { label: '未知 Agent', icon: 'cpu', color: '#6b7280', desc: '未登记的角色' }

// 取角色展示元信息；未知角色保留原角色名
export function roleMeta(role) {
  if (!role) return FALLBACK_META
  const key = String(role).toLowerCase()
  return AGENT_ROLE_META[key] || { ...FALLBACK_META, label: String(role) }
}

// 单条 trace 归一化：字段缺省给安全默认值，绝不抛错
export function normalizeTrace(raw) {
  const t = raw && typeof raw === 'object' ? raw : {}
  return {
    id: t.id ?? null,
    agent_role: t.agent_role || t.agent || 'unknown',
    action: t.action || '',
    input_summary: typeof t.input_summary === 'string' ? t.input_summary : '',
    output_summary: typeof t.output_summary === 'string' ? t.output_summary : '',
    tool_calls_trace: Array.isArray(t.tool_calls_trace) ? t.tool_calls_trace : [],
    usage: t.usage && typeof t.usage === 'object' ? t.usage : null,
    status: t.status || 'done',
    created_at: t.created_at || null
  }
}

// 按 Agent 角色聚合：调用数 / 成功数 / 成功率 / 最近活跃 / 累计 tokens
export function aggregateByAgent(traces) {
  const map = new Map()
  for (const raw of traces || []) {
    const t = normalizeTrace(raw)
    const role = t.agent_role
    if (!map.has(role)) {
      map.set(role, { role, total: 0, done: 0, error: 0, running: 0, lastActive: null, totalTokens: 0 })
    }
    const agg = map.get(role)
    agg.total += 1
    if (t.status === 'done') agg.done += 1
    else if (t.status === 'error') agg.error += 1
    else if (t.status === 'running') agg.running += 1
    if (t.created_at && (!agg.lastActive || new Date(t.created_at) > new Date(agg.lastActive))) {
      agg.lastActive = t.created_at
    }
    const tokens = t.usage && t.usage.total_tokens
    if (typeof tokens === 'number' && Number.isFinite(tokens)) agg.totalTokens += tokens
  }
  return [...map.values()]
    .map(agg => ({
      ...agg,
      successRate: agg.total > 0 ? agg.done / agg.total : 0,
      meta: roleMeta(agg.role)
    }))
    .sort((a, b) => b.total - a.total)
}

// 全览统计：总调用 / 涉及 Agent 数 / 成功率 / 最近一次调用时间
export function overviewStats(traces) {
  const list = (traces || []).map(normalizeTrace)
  const total = list.length
  const done = list.filter(t => t.status === 'done').length
  const agents = new Set(list.map(t => t.agent_role)).size
  let latest = null
  for (const t of list) {
    if (t.created_at && (!latest || new Date(t.created_at) > new Date(latest))) latest = t.created_at
  }
  return {
    totalCalls: total,
    agentCount: agents,
    successRate: total > 0 ? done / total : 0,
    lastCallAt: latest
  }
}

export function fmtDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function statusMeta(status) {
  switch (status) {
    case 'done': return { label: '完成', className: 'is-done' }
    case 'error': return { label: '失败', className: 'is-error' }
    case 'running': return { label: '运行中', className: 'is-running' }
    default: return { label: status || '未知', className: 'is-unknown' }
  }
}

// 从产出摘要中提取 http(s) 链接（产出物可点击），去重
export function extractLinks(text) {
  if (!text || typeof text !== 'string') return []
  const matches = text.match(/https?:\/\/[^\s)\]"'<>]+/g)
  return matches ? [...new Set(matches)] : []
}

export function fmtPercent(ratio) {
  if (!Number.isFinite(ratio)) return '—'
  return `${Math.round(ratio * 100)}%`
}

export function fmtTokens(usage) {
  if (!usage || typeof usage !== 'object') return ''
  const total = usage.total_tokens
  if (typeof total === 'number' && Number.isFinite(total)) return `${total} tokens`
  return ''
}
