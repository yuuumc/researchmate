// ============================================================
// 每日学习路径引擎（B6 · 策略权重 v1.0 纯函数实现）
// ============================================================
// 实现产品管理专家《每日学习路径推荐策略权重 v1.0》全部规则：
//   §0 输入字段（全部取自 profile store）
//   §1 知识点分桶（顺序判定，命中即停）
//   §2 桶内排序分值（确定性公式）
//   §3 任务数与配比（按档位定死）+ 降级填充
//   §4 任务类型映射
//   §5 次日刷新逻辑（顺延/降级/丢弃）
//   §6 边界用例（全覆盖）
//
// 设计原则：纯函数 + 零 store 依赖 + 零随机
//   同一输入两次生成结果逐字段一致（§7 验收②）
// ============================================================

// ---- §3 三档配比表（定死，PM 裁定锁不改）----
const RATIO_TABLE = {
  foundational: { weak: 2, consolidate: 1, new: 0, review: 1 },
  intermediate: { weak: 2, consolidate: 1, new: 1, review: 0 },
  advanced:     { weak: 1, consolidate: 1, new: 2, review: 0 },
}

// ---- §3 降级填充顺序（定死，不空槽）----
// 某桶配额取不满时，按此顺序从下一桶补
const DOWNGRADE_CHAIN = {
  weak:        ['consolidate', 'review'],
  consolidate: ['new', 'review'],
  new:         ['review'],
  review:      ['consolidate'], // 仅 foundational 有 review 配额
}

// ---- §4 任务类型映射 ----
const TASK_TYPE_MAP = {
  weak:        'study',   // 补薄弱=学习（昨日已安排学习则改练习）
  consolidate: 'practice', // 巩固=练习(B3)
  new:         'study',   // 拓展=学习
  review:      'review',   // 复习=变式B3固定foundational档
}

// 任务类型中文标签
const TASK_TYPE_LABELS = {
  study: '学习',
  practice: '练习',
  review: '复习',
}

// 内容类别中文标签
const CATEGORY_LABELS = {
  weak: '补强薄弱',
  consolidate: '巩固提升',
  new: '拓展新知',
  review: '复习回顾',
}

// ---- §5 降级映射（次日刷新用）----
const DOWNGRADE_TYPE = {
  study: 'review',
  practice: 'review',
  review: null, // 已是复习，直接丢弃
}

// 默认知识点列表（新用户 §6 边界用例，从知识图谱节点取）
// 若 profile 无 knowledge_state，按此顺序取前 3 个作为 new
const DEFAULT_KS_LIST = [
  'PN结', '二极管', 'MOSFET', 'BJT', 'CMOS',
  '放大电路', '反馈', '运算放大器', '滤波器', '振荡器',
]

/**
 * 计算今天到指定日期的天数差
 * @param {string|Date} date - 日期
 * @returns {number} 天数差（今天 - date）
 */
function daysSince(date) {
  if (!date) return 30 // §0: 无 lastStudied 记 30
  const target = new Date(date)
  if (isNaN(target.getTime())) return 30
  const now = new Date()
  // 归零到天
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.floor((nowDay - targetDay) / (24 * 60 * 60 * 1000)))
}

/**
 * 生成今日日期 key（YYYY-MM-DD）
 */
export function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * §2 桶内排序分值
 * score(ks) = 0.6 × (1 − m̂) + 0.4 × min(d/7, 1)
 * 其中 m̂ = m ?? 0
 * 含义：掌握度越低、越久没碰，排越前
 *
 * @param {number|undefined} mastery - [0,1] 或 undefined
 * @param {number} daysSinceStudied - 距上次学习天数
 * @returns {number} 分值 [0,1]
 */
export function computeScore(mastery, daysSinceStudied) {
  const mHat = mastery ?? 0
  const d = Math.max(0, daysSinceStudied)
  return 0.6 * (1 - mHat) + 0.4 * Math.min(d / 7, 1)
}

/**
 * §1 知识点分桶（顺序判定，命中即停）
 *
 * 1. weak：ks ∈ weak_topics 或（m ≠ undefined 且 m < 0.5）
 * 2. mastered：m ≥ 0.8（且未被第 1 条命中）
 * 3. consolidate：0.5 ≤ m < 0.8
 * 4. new：m === undefined（从未学习）
 *
 * @param {object} profile - useProfileStore.profile 快照
 * @param {Set<string>} cooldownSet - 冷却中的 ks 集合（§5 丢弃后 7 天冷却）
 * @returns {{weak:Array, mastered:Array, consolidate:Array, new:Array, review:Array}}
 *   每个桶是 {ks, mastery, daysSinceStudied, score} 的数组，按 score 降序、ks 字典序
 */
export function bucketKnowledgePoints(profile, cooldownSet = new Set()) {
  const ks = profile?.knowledge_state || {}
  const weakTopics = Array.isArray(profile?.weak_topics) ? profile.weak_topics : []
  const weakTopicSet = new Set(weakTopics)

  // 收集所有知识点（knowledge_state 的 key + weak_topics 的 key，并集）
  const allKs = new Set([...Object.keys(ks), ...weakTopics])

  const buckets = {
    weak: [],
    mastered: [],
    consolidate: [],
    new: [],
    review: [],
  }

  for (const topic of allKs) {
    // 冷却中的 ks 不被任何桶选入
    if (cooldownSet.has(topic)) continue

    const entry = ks[topic] || {}
    const m = entry.mastery // undefined 或 [0,1]
    const d = daysSince(entry.lastStudied)
    const score = computeScore(m, d)

    const item = { ks: topic, mastery: m, daysSinceStudied: d, score }

    // §1 顺序判定，命中即停
    if (weakTopicSet.has(topic) || (m !== undefined && m < 0.5)) {
      buckets.weak.push(item)
    } else if (m !== undefined && m >= 0.8) {
      buckets.mastered.push(item)
    } else if (m !== undefined && m >= 0.5) {
      buckets.consolidate.push(item)
    } else {
      // m === undefined（从未学习）
      buckets.new.push(item)
    }
  }

  // §2 桶内排序：score 降序，并列按 ks 名字典序
  const sortFn = (a, b) => {
    if (Math.abs(a.score - b.score) > 1e-9) return b.score - a.score
    return a.ks < b.ks ? -1 : a.ks > b.ks ? 1 : 0
  }

  for (const key of Object.keys(buckets)) {
    buckets[key].sort(sortFn)
  }

  // 复习池 = mastered 且 d ≥ 2，按 score 降序
  buckets.review = buckets.mastered.filter(item => item.daysSinceStudied >= 2)

  return buckets
}

/**
 * §3 计算任务总数 T
 *
 * T = 4（默认）
 * 例外1：可用池总数 < 4 → T = max(3, 池大小)
 * 例外2：tier=advanced 且昨日完成率=100% → T = 5
 *
 * @param {string} tier - foundational/intermediate/advanced
 * @param {number} poolSize - 可用池总数（weak∪consolidate∪new∪复习池）
 * @param {number} yesterdayCompletionRate - 昨日完成率 [0,1]
 * @returns {number}
 */
export function computeTaskCount(tier, poolSize, yesterdayCompletionRate = 0) {
  let T = 4

  // 例外2：advanced 且昨日完成率 100% → T=5
  if (tier === 'advanced' && yesterdayCompletionRate >= 1) {
    T = 5
  }

  // 例外1：池 < 4 → T = max(3, 池大小)
  if (poolSize < 4) {
    T = Math.min(T, Math.max(3, poolSize))
  }

  // §6 全 mastered 边界：允许 T < 3（复习池也不足时）
  return T
}

/**
 * §3 + §4 生成任务列表
 *
 * @param {string} tier - foundational/intermediate/advanced
 * @param {object} buckets - bucketKnowledgePoints() 返回值
 * @param {number} T - 任务总数
 * @param {object} yesterdayPath - 昨日路径（用于判断"补薄弱昨日已安排学习则改练习"）
 * @returns {Array} 任务列表
 */
export function generateTasks(tier, buckets, T, yesterdayPath = null) {
  const ratio = RATIO_TABLE[tier] || RATIO_TABLE.intermediate
  const categories = ['weak', 'consolidate', 'new', 'review']

  // 昨日已安排学习的 ks 集合（§4: 补薄弱昨日已安排学习→改练习）
  const yesterdayStudyKs = new Set()
  if (yesterdayPath && Array.isArray(yesterdayPath.items)) {
    for (const item of yesterdayPath.items) {
      if (item.category === 'weak' && item.type === 'study') {
        yesterdayStudyKs.add(item.ks)
      }
    }
  }

  // 按配比从各桶取
  const tasks = []
  const consumed = new Set() // 已被选中的 ks

  for (const cat of categories) {
    const quota = ratio[cat]
    const pool = buckets[cat] || []
    let taken = 0

    for (const item of pool) {
      if (taken >= quota) break
      if (consumed.has(item.ks)) continue

      // §4 任务类型映射
      let taskType = TASK_TYPE_MAP[cat]
      // 补薄弱：昨日已安排学习 → 改练习
      if (cat === 'weak' && yesterdayStudyKs.has(item.ks)) {
        taskType = 'practice'
      }

      tasks.push({
        id: `${cat}-${item.ks}`,
        ks: item.ks,
        category: cat,
        type: taskType,
        tier: cat === 'review' ? 'foundational' : tier, // §4: 复习固定 foundational 档
        title: buildTitle(cat, item.ks, taskType),
        description: buildDescription(cat, item, taskType),
        // 路由信息（供前端跳转）
        route: buildRoute(cat, item.ks, taskType, tier),
        // §5 顺延计数
        carryCount: 0,
        completed: false,
        // 排序用元数据
        _score: item.score,
        _sortPriority: 0, // 0=normal, 1=顺延置顶
      })

      consumed.add(item.ks)
      taken++
    }

    // §3 降级填充：某桶配额未满
    if (taken < quota) {
      const deficit = quota - taken
      const filled = fillFromNext(cat, deficit, buckets, consumed, tier, yesterdayStudyKs, tasks)
      // filled 已在 fillFromNext 内推入 tasks
    }
  }

  // 如果 T > ratio 总和（如 advanced T=5 但 ratio=4），从剩余池补任务
  if (tasks.length < T) {
    const ratioTotal = Object.values(ratio).reduce((s, v) => s + v, 0)
    if (T > ratioTotal) {
      // 从剩余池（未被 consumed）取，按 score 降序
      const remaining = []
      for (const cat of categories) {
        for (const item of (buckets[cat] || [])) {
          if (!consumed.has(item.ks)) {
            let taskType = TASK_TYPE_MAP[cat]
            if (cat === 'weak' && yesterdayStudyKs.has(item.ks)) {
              taskType = 'practice'
            }
            remaining.push({
              id: `${cat}-extra-${item.ks}`,
              ks: item.ks,
              category: cat,
              type: taskType,
              tier: cat === 'review' ? 'foundational' : tier,
              title: buildTitle(cat, item.ks, taskType),
              description: buildDescription(cat, item, taskType),
              route: buildRoute(cat, item.ks, taskType, tier),
              carryCount: 0,
              completed: false,
              _score: item.score,
              _sortPriority: 0,
              _extra: true,
            })
          }
        }
      }
      // 按 score 降序排列
      remaining.sort((a, b) => b._score - a._score)
      // 补到 T
      for (const t of remaining) {
        if (tasks.length >= T) break
        tasks.push(t)
        consumed.add(t.ks)
      }
    }
  }

  // 截断到 T（降级填充可能超出）
  const result = tasks.slice(0, T)

  return result
}

/**
 * §3 降级填充
 * 某桶配额取不满时，按 DOWNGRADE_CHAIN 顺序从下一桶补
 */
function fillFromNext(category, deficit, buckets, consumed, tier, yesterdayStudyKs, tasks) {
  const chain = DOWNGRADE_CHAIN[category] || []
  let remaining = deficit

  for (const nextCat of chain) {
    if (remaining <= 0) break
    const pool = buckets[nextCat] || []

    for (const item of pool) {
      if (remaining <= 0) break
      if (consumed.has(item.ks)) continue

      // 降级填充的任务：类型按原桶映射，但标记来源
      let taskType = TASK_TYPE_MAP[category] // 用原桶的类型
      if (category === 'weak' && yesterdayStudyKs.has(item.ks)) {
        taskType = 'practice'
      }

      tasks.push({
        id: `${category}-fill-${nextCat}-${item.ks}`,
        ks: item.ks,
        category: category, // 保持原配额类别
        type: taskType,
        tier: category === 'review' ? 'foundational' : tier,
        title: buildTitle(category, item.ks, taskType),
        description: buildDescription(category, item, taskType),
        route: buildRoute(category, item.ks, taskType, tier),
        carryCount: 0,
        completed: false,
        _score: item.score,
        _sortPriority: 0,
        _filledFrom: nextCat, // 标记降级来源
      })

      consumed.add(item.ks)
      remaining--
    }
  }

  return deficit - remaining
}

/**
 * §4 构建任务标题
 */
function buildTitle(category, ks, taskType) {
  const catLabel = CATEGORY_LABELS[category] || category
  const typeLabel = TASK_TYPE_LABELS[taskType] || taskType
  return `${catLabel}：${ks}`
}

/**
 * §4 构建任务描述
 */
function buildDescription(category, item, taskType) {
  const m = item.mastery
  const d = item.daysSinceStudied

  if (category === 'weak') {
    if (m !== undefined) {
      return `掌握度 ${Math.round(m * 100)}%，距上次学习 ${d} 天，优先补强薄弱点`
    }
    return `薄弱知识点，优先补强`
  }
  if (category === 'consolidate') {
    return `掌握度 ${Math.round(m * 100)}%，巩固提升向掌握冲刺`
  }
  if (category === 'new') {
    return `新知识点，拓展学习`
  }
  if (category === 'review') {
    return `已掌握但 ${d} 天未复习，检测记忆保持`
  }
  return ''
}

/**
 * §4 构建路由信息
 * 学习 → /chat（AI 导师讲解）或 /derivation（白板推导 B2）
 * 练习 → /variant/:topic（变式题 B3）
 * 复习 → /variant/:topic（变式题 B3，固定 foundational 档）
 */
function buildRoute(category, ks, taskType, tier) {
  if (taskType === 'study') {
    // 学习：跳转到 AI 导师，带预填问题
    return {
      path: '/chat',
      query: { q: `帮我学习 ${ks} 的核心概念` },
    }
  }
  if (taskType === 'practice') {
    // 练习：跳转到变式题（B3），按当前 tier
    return {
      path: `/variant/${encodeURIComponent(ks)}`,
      query: { tier },
    }
  }
  if (taskType === 'review') {
    // 复习：跳转到变式题（B3），固定 foundational 档
    return {
      path: `/variant/${encodeURIComponent(ks)}`,
      query: { tier: 'foundational' },
    }
  }
  return { path: '/chat', query: {} }
}

/**
 * §6 边界用例：新用户（knowledge_state 全空）
 * T=3，全部走拓展——按知识图谱节点顺序取前 3 个 new，类型=学习
 */
function handleNewUser(profile) {
  const ks = profile?.knowledge_state || {}
  const weakTopics = Array.isArray(profile?.weak_topics) ? profile.weak_topics : []

  // 如果 knowledge_state 和 weak_topics 都为空 → 新用户
  if (Object.keys(ks).length === 0 && weakTopics.length === 0) {
    const tasks = DEFAULT_KS_LIST.slice(0, 3).map((topic, i) => ({
      id: `new-init-${topic}`,
      ks: topic,
      category: 'new',
      type: 'study',
      tier: 'intermediate', // 新用户默认 intermediate（computeMasteryLevel 兜底）
      title: `拓展新知：${topic}`,
      description: '新知识点，开始学习之旅',
      route: {
        path: '/chat',
        query: { q: `帮我学习 ${topic} 的核心概念` },
      },
      carryCount: 0,
      completed: false,
      _score: 1, // 最高优先
      _sortPriority: 0,
    }))
    return tasks
  }

  return null
}

/**
 * §6 边界用例：全 mastered（weak/consolidate/new 均空）
 * T=3，全取复习池（d≥2 按 score 降序），类型=复习
 * 复习池也不足 3 时有多少出多少（允许 T<3，仅此例外）
 */
function handleAllMastered(buckets) {
  if (buckets.weak.length === 0 && buckets.consolidate.length === 0 && buckets.new.length === 0) {
    const reviewPool = buckets.review || []
    const tasks = reviewPool.slice(0, 3).map((item, i) => ({
      id: `review-mastered-${item.ks}`,
      ks: item.ks,
      category: 'review',
      type: 'review',
      tier: 'foundational', // §4: 复习固定 foundational 档
      title: `复习回顾：${item.ks}`,
      description: `已掌握但 ${item.daysSinceStudied} 天未复习，检测记忆保持`,
      route: {
        path: `/variant/${encodeURIComponent(item.ks)}`,
        query: { tier: 'foundational' },
      },
      carryCount: 0,
      completed: false,
      _score: item.score,
      _sortPriority: 0,
    }))
    return tasks
  }

  return null
}

/**
 * §5 次日刷新：处理昨日未完成任务
 *
 * - 已完成 → 移除，不进入次日
 * - 未完成且 c < 2 → 顺延至次日，c+1，展示排序置顶
 * - c = 2 仍未完成 → 降级：任务类型降一档（学习→复习、练习→复习），c+1
 * - 降级后次日仍未完成 → 丢弃，该 ks 进入冷却：cooldown_until = 当天 + 7 天
 *
 * @param {object} yesterdayPath - 昨日路径 { date, items, completedIds }
 * @param {string} todayDateStr - 今日日期 YYYY-MM-DD
 * @returns {{ carriedOver: Array, cooldowns: Array<{ks, until}> }}
 */
export function refreshYesterday(yesterdayPath, todayDateStr) {
  if (!yesterdayPath || !yesterdayPath.items || yesterdayPath.items.length === 0) {
    return { carriedOver: [], cooldowns: [] }
  }

  const completedSet = new Set(yesterdayPath.completedIds || [])
  const carriedOver = []
  const cooldowns = []

  for (const item of yesterdayPath.items) {
    // 已完成 → 移除
    if (completedSet.has(item.id)) continue

    const c = item.carryCount || 0

    if (c < 2) {
      // 顺延至次日，c+1，展示排序置顶
      carriedOver.push({
        ...item,
        id: `${item.id}-carry${c + 1}`,
        carryCount: c + 1,
        completed: false,
        _sortPriority: 1, // 置顶
      })
    } else if (c === 2) {
      // 降级：任务类型降一档（学习→复习、练习→复习），c+1
      const downgradedType = DOWNGRADE_TYPE[item.type]
      if (downgradedType) {
        carriedOver.push({
          ...item,
          id: `${item.id}-degrade${c + 1}`,
          carryCount: c + 1,
          type: downgradedType,
          tier: 'foundational', // 降级后固定 foundational
          completed: false,
          _sortPriority: 1,
          _degraded: true,
        })
      } else {
        // 已是复习类型 → 直接丢弃，进入冷却
        cooldowns.push({
          ks: item.ks,
          until: addDays(todayDateStr, 7),
        })
      }
    } else {
      // c > 2 且降级后仍未完成 → 丢弃，进入冷却
      cooldowns.push({
        ks: item.ks,
        until: addDays(todayDateStr, 7),
      })
    }
  }

  return { carriedOver, cooldowns }
}

/**
 * 计算冷却中的 ks 集合
 * @param {Array} cooldownHistory - 历史冷却记录 [{ks, until}]
 * @param {string} todayDateStr - 今日日期
 * @returns {Set<string>} 仍在冷却期的 ks 集合
 */
export function computeCooldownSet(cooldownHistory, todayDateStr) {
  const today = new Date(todayDateStr)
  const set = new Set()
  if (!Array.isArray(cooldownHistory)) return set
  for (const c of cooldownHistory) {
    if (c.until && new Date(c.until) > today) {
      set.add(c.ks)
    }
  }
  return set
}

/**
 * 计算昨日完成率
 * @param {object} yesterdayPath
 * @returns {number} [0,1]
 */
export function computeCompletionRate(yesterdayPath) {
  if (!yesterdayPath || !yesterdayPath.items || yesterdayPath.items.length === 0) {
    return 0
  }
  const completed = (yesterdayPath.completedIds || []).length
  return completed / yesterdayPath.items.length
}

// ---- 工具函数 ----

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 生成每日学习路径（主入口，纯函数）
 *
 * @param {object} profile - useProfileStore.profile 快照
 * @param {string} tier - foundational/intermediate/advanced（复用 studentMasteryLevel getter）
 * @param {object} yesterdayPath - 昨日路径 { date, items, completedIds }
 * @param {Array} cooldownHistory - 历史冷却记录
 * @param {string} todayDateStr - 今日日期 YYYY-MM-DD（传入而非内部 new Date，确保纯函数可测）
 * @returns {{ tasks: Array, carriedOver: Array, newCooldowns: Array }}
 */
export function generateDailyPath(profile, tier, yesterdayPath = null, cooldownHistory = [], todayDateStr = null) {
  const today = todayDateStr || todayKey()

  // §5 次日刷新：处理昨日未完成任务
  const { carriedOver, cooldowns: newCooldowns } = refreshYesterday(yesterdayPath, today)

  // 合并冷却记录
  const allCooldowns = [...(cooldownHistory || []), ...newCooldowns]
  const cooldownSet = computeCooldownSet(allCooldowns, today)

  // §1 分桶
  const buckets = bucketKnowledgePoints(profile, cooldownSet)

  // §6 边界用例优先判定
  // 新用户
  const newUserTasks = handleNewUser(profile)
  if (newUserTasks) {
    return { tasks: newUserTasks, carriedOver: [], newCooldowns: [] }
  }

  // 全 mastered
  const allMasteredTasks = handleAllMastered(buckets)
  if (allMasteredTasks) {
    return { tasks: allMasteredTasks, carriedOver: [], newCooldowns: [] }
  }

  // §3 计算任务总数 T
  const poolSize = buckets.weak.length + buckets.consolidate.length + buckets.new.length + buckets.review.length
  const yesterdayRate = computeCompletionRate(yesterdayPath)
  const T = computeTaskCount(tier, poolSize, yesterdayRate)

  // §3+§4 生成任务
  const newTasks = generateTasks(tier, buckets, T, yesterdayPath)

  // §5 合并顺延任务与新任务
  // 顺延任务占次日对应类别的配额
  // 顺延优先、该类别新选 0 个；顺延 + 新选总数 ≤ 5
  const result = mergeCarriedAndNew(carriedOver, newTasks, T)

  return {
    tasks: result,
    carriedOver,
    newCooldowns,
  }
}

/**
 * 合并顺延任务与新任务
 * 顺延任务占次日对应类别的配额（顺延优先）
 * 顺延任务与新选命中同一 ks 时，顺延优先、新选跳过该 ks
 * 顺延 + 新选总数 ≤ 5
 */
function mergeCarriedAndNew(carriedOver, newTasks, T) {
  if (!carriedOver || carriedOver.length === 0) {
    return newTasks
  }

  // 顺延任务的 ks 集合
  const carriedKs = new Set(carriedOver.map(t => t.ks))

  // 顺延任务占的类别配额
  const carriedCategories = new Set(carriedOver.map(t => t.category))

  // 新任务：跳过与顺延同 ks 的
  const filteredNew = newTasks.filter(t => !carriedKs.has(t.ks))

  // 合并：顺延在前（置顶），新任务在后
  const merged = [...carriedOver, ...filteredNew]

  // 总数 ≤ 5
  return merged.slice(0, Math.max(T, carriedOver.length))
}

// ============================================================
// 导出常量（供测试和 UI 使用）
// ============================================================

export { RATIO_TABLE, DOWNGRADE_CHAIN, TASK_TYPE_MAP, TASK_TYPE_LABELS, CATEGORY_LABELS, DEFAULT_KS_LIST }
