// ============================================================
// 画像冲突合并规则（v2.5 · UI 层）
// ============================================================
// 背景：派发描述说「合并规则 LWW / union / max 已在 sync.js」，
// 实际 349e43a 的 services/sync.js 只做了远端覆盖（pullAndMerge），
// 没有字段级合并规则。按边界「不改数据层 6 文件」，
// 合并规则落在 UI 层本文件，ConflictResolveModal / stores/sync.js 消费。
//
// 规则：
//   LWW   — 标量字段按 updated_at 新者胜（默认）
//   union — 数组字段取并集（weak_topics / mastered_topics）
//   max   — 数值字段取大者（last_diagnosis_score）
//   starMax — ability_stars 按 topic 逐键取大星
// ============================================================

/** 展示用中文名 */
export const FIELD_LABELS = {
  name: '姓名',
  major: '专业',
  target_direction: '目标方向',
  target_school: '目标院校',
  target_major: '目标专业',
  learning_style: '学习风格',
  preparation_stage: '备考阶段',
  exam_date: '考研日期',
  ability_stars: '能力星级',
  weak_topics: '薄弱知识点',
  mastered_topics: '已掌握知识点',
  last_diagnosis_score: '最近诊断分',
  last_diagnosis_date: '最近诊断时间'
}

const UNION_FIELDS = ['weak_topics', 'mastered_topics']
const MAX_FIELDS = ['last_diagnosis_score']
const STAR_MAX_FIELDS = ['ability_stars']

/** 不参与合并的字段（主键/时间戳/auth 注入字段） */
const SKIP_FIELDS = ['user_id', 'created_at', 'updated_at', 'phone', 'role', 'avatar_url']

function ruleFor(field) {
  if (UNION_FIELDS.includes(field)) return 'union'
  if (MAX_FIELDS.includes(field)) return 'max'
  if (STAR_MAX_FIELDS.includes(field)) return 'starMax'
  return 'lww'
}

function isEmpty(v) {
  if (v === null || v === undefined) return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v).length === 0
  if (v === '') return true
  return false
}

function unionArr(a, b) {
  const out = []
  const seen = new Set()
  for (const v of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    if (!seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

function starMax(a, b) {
  const out = { ...(a || {}) }
  for (const [topic, stars] of Object.entries(b || {})) {
    const cur = out[topic]
    if (cur === undefined || cur === null || stars > cur) out[topic] = stars
  }
  return out
}

/** 建议值（按规则自动合并的结果） */
function suggestValue(field, lv, rv, local, remote) {
  const rule = ruleFor(field)
  if (isEmpty(lv)) return { side: 'remote', value: rv ?? null }
  if (isEmpty(rv)) return { side: 'local', value: lv ?? null }
  switch (rule) {
    case 'union':
      return { side: 'suggested', value: unionArr(lv, rv) }
    case 'max':
      return { side: 'suggested', value: Math.max(Number(lv) || 0, Number(rv) || 0) }
    case 'starMax':
      return { side: 'suggested', value: starMax(lv, rv) }
    case 'lww':
    default: {
      const lt = new Date(local?.updated_at || 0).getTime()
      const rt = new Date(remote?.updated_at || 0).getTime()
      return rt >= lt
        ? { side: 'remote', value: rv }
        : { side: 'local', value: lv }
    }
  }
}

/**
 * 字段级 diff
 * @returns {Array<{field, label, rule, local, remote, suggested, suggestedSide}>}
 */
export function diffFields(local, remote) {
  const fields = new Set([
    ...Object.keys(local || {}),
    ...Object.keys(remote || {})
  ])
  const diffs = []
  for (const f of fields) {
    if (SKIP_FIELDS.includes(f)) continue
    const lv = local?.[f] ?? null
    const rv = remote?.[f] ?? null
    if (JSON.stringify(lv) === JSON.stringify(rv)) continue
    const s = suggestValue(f, lv, rv, local, remote)
    diffs.push({
      field: f,
      label: FIELD_LABELS[f] || f,
      rule: ruleFor(f),
      local: lv,
      remote: rv,
      suggested: s.value,
      suggestedSide: s.side
    })
  }
  return diffs
}

/**
 * 应用合并
 * @param {object} local 本地画像
 * @param {object} remote 远端画像
 * @param {Record<string, 'local'|'remote'|'suggested'>} choices 每字段选择
 * @returns {object} 合并后的画像（保留 local 的 user_id / created_at）
 */
export function mergeProfiles(local, remote, choices = {}) {
  const diffs = diffFields(local, remote)
  const merged = { ...(local || {}) }
  for (const d of diffs) {
    const choice = choices[d.field] || 'suggested'
    if (choice === 'local') merged[d.field] = d.local
    else if (choice === 'remote') merged[d.field] = d.remote
    else merged[d.field] = d.suggested
  }
  merged.user_id = local?.user_id || remote?.user_id
  merged.updated_at = new Date().toISOString()
  return merged
}

/** 全选快捷 choices */
export function choicesAll(diffs, side) {
  const out = {}
  for (const d of diffs) out[d.field] = side
  return out
}

/** 展示格式化 */
export function formatValue(field, v) {
  if (v === null || v === undefined) return '—'
  if (UNION_FIELDS.includes(field)) {
    return Array.isArray(v) && v.length > 0 ? v.join('、') : '—'
  }
  if (STAR_MAX_FIELDS.includes(field)) {
    const entries = Object.entries(v || {})
    if (entries.length === 0) return '—'
    return entries
      .slice(0, 6)
      .map(([t, s]) => `${t} ${'★'.repeat(Math.max(0, Math.min(5, s)))}`)
      .join('；') + (entries.length > 6 ? ` 等 ${entries.length} 项` : '')
  }
  if (field === 'learning_style') {
    return { theoretical: '理论型', practical: '实践型', mixed: '混合型' }[v] || String(v)
  }
  if (field === 'preparation_stage') {
    return { initial: '起步', basic: '基础', intensive: '强化', sprint: '冲刺' }[v] || String(v)
  }
  if (field.endsWith('_date') || field.endsWith('_at')) {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('zh-CN')
  }
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
