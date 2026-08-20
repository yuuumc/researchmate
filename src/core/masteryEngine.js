// ============================================================
// masteryEngine — 掌握度更新规则纯函数（F1 画像引擎地基 · 规则引擎）
// ============================================================
// 纯函数、零副作用、零依赖——可独立跑契约测试。
// 三大因子：
//   1. 遗忘衰减（Ebbinghaus 指数衰减）：mastery *= exp(-DECAY_RATE * days)
//   2. 题型加权：推导 > 主观题 > 客观题/练习（单次影响幅度按题型缩放）
//   3. 置信度因子：attempts 越多置信度越高，单次学习影响幅度越小
//
// knowledge_state[topic] 结构：
//   { mastery:0-1, confidence:0-1, lastStudied:ISO, attempts:int,
//     correctRate:0-1, errorTypes:{ [type]:int } }
// ============================================================

// --- 可调常量（集中声明，契约测试断言依赖这些语义） ---
export const DECAY_RATE = 0.05          // /天；7天≈0.705、30天≈0.223
export const MASTERY_IMPACT = 0.4        // 零置信度时单次最大影响幅度（×题型权重）
export const WRONG_PENALTY = 1.2        // 答错比答对影响更大（惩罚系数）

// 题型权重：推导 > 主观题(essay) > 填空(fill) > 客观题/练习(choice/practice)
export const QUESTION_WEIGHT = {
  derivation: 1.0,
  essay: 0.8,
  fill: 0.6,
  choice: 0.5,
  practice: 0.5,
}

const DAY_MS = 24 * 60 * 60 * 1000

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function defaultState() {
  return {
    mastery: 0,
    confidence: 0,
    lastStudied: null,
    attempts: 0,
    correctRate: 0,
    errorTypes: {},
  }
}

/**
 * 计算两个 ISO 时间戳间的天数差（非负，ts2 早于 ts1 时返回 0）
 */
export function daysBetween(ts1, ts2) {
  if (!ts1 || !ts2) return 0
  const d = (new Date(ts1).getTime() - new Date(ts2).getTime()) / DAY_MS
  return d > 0 ? d : 0
}

/**
 * 遗忘衰减：按 lastStudied → now 的天数对 mastery 做指数衰减
 * @param {object} ks   单知识点状态
 * @param {string} now  ISO 时间戳
 * @returns {object} 衰减后的状态（mastery 可能降低，lastStudied 不变）
 */
export function applyDecay(ks, now) {
  const base = { ...defaultState(), ...ks }
  if (!base.lastStudied) return base
  const days = daysBetween(now, base.lastStudied)
  if (days <= 0) return base
  const factor = Math.exp(-DECAY_RATE * days)
  return { ...base, mastery: clamp(base.mastery * factor, 0, 1) }
}

/**
 * 置信度：attempts 越多置信度越高（0 → 0，1 → 0.5，50 → 0.98）
 * 单次学习影响幅度 = (1 - confidence) × 题型权重
 */
export function confidenceFromAttempts(attempts) {
  const a = Math.max(0, attempts | 0)
  return a === 0 ? 0 : 1 - 1 / (a + 1)
}

/**
 * 增量学习事件：更新单知识点状态
 * @param {object|null} prevKS   该知识点之前的状态（无则从默认起步）
 * @param {object} event         { outcome, questionType, errorType?, timestamp }
 * @returns {object} 新状态
 *
 * 流程：先按 lastStudied → event.timestamp 衰减，再叠加本次 delta。
 *       delta = ±(1-confidence) × 题型权重 × MASTERY_IMPACT（答错再 × WRONG_PENALTY）
 */
export function applyLearningEvent(prevKS, event) {
  const prev = { ...defaultState(), ...(prevKS || {}) }
  const now = event.timestamp || new Date().toISOString()

  // 1. 先衰减到当前时刻（保留历史 attempts/correctRate，只动 mastery）
  const decayed = applyDecay(prev, now)

  // 2. 累计作答统计
  const attempts = prev.attempts + 1
  const prevCorrect = Math.round(prev.correctRate * prev.attempts)
  const gotCorrect = event.outcome === 'correct' ? 1 : 0
  const correctCount = prevCorrect + gotCorrect
  const correctRate = attempts > 0 ? correctCount / attempts : 0

  // 3. 置信度（基于更新后的 attempts）
  const confidence = confidenceFromAttempts(attempts)

  // 4. 题型加权 × 置信度缩放的单次影响幅度
  const weight = QUESTION_WEIGHT[event.questionType] ?? 0.5
  const impactScale = (1 - confidence) * weight * MASTERY_IMPACT

  // 5. mastery delta（答对 +、答错 - 且惩罚更重）
  let delta
  if (gotCorrect) {
    delta = +impactScale
  } else {
    delta = -impactScale * WRONG_PENALTY
  }
  const mastery = clamp(decayed.mastery + delta, 0, 1)

  // 6. 错误类型计数（仅答错时累加）
  const errorTypes = { ...prev.errorTypes }
  if (!gotCorrect && event.errorType) {
    errorTypes[event.errorType] = (errorTypes[event.errorType] || 0) + 1
  }

  return {
    mastery,
    confidence,
    lastStudied: now,
    attempts,
    correctRate,
    errorTypes,
  }
}

/**
 * 绝对掌握度快照：诊断完成时批量设定某知识点 mastery（权威覆盖）
 * 保留历史 attempts / correctRate / errorTypes，只重置 mastery + lastStudied。
 * @param {object|null} prevKS
 * @param {object} snap   { mastery:0-100, timestamp }
 */
export function applySnapshot(prevKS, snap) {
  const prev = { ...defaultState(), ...(prevKS || {}) }
  const now = snap.timestamp || new Date().toISOString()
  return {
    ...prev,
    mastery: clamp(snap.mastery ?? prev.mastery, 0, 1),
    lastStudied: now,
  }
}

/**
 * 对整个 knowledge_state map 跑遗忘衰减（画像页打开时调用）
 * @param {object} ksMap   { [topic]: KnowledgeState }
 * @param {string} now
 * @returns {object} 衰减后的新 map（仅 mastery 变化的主题会被替换）
 */
export function decayAll(ksMap, now) {
  const out = {}
  let changed = false
  for (const [topic, ks] of Object.entries(ksMap || {})) {
    const d = applyDecay(ks, now)
    if (d.mastery !== ks.mastery) changed = true
    out[topic] = d
  }
  return { map: out, changed }
}

/**
 * mastery(0-100) → 星级(0-5)，与 useMasteryData 阈值对齐：
 *   ≤20→1(weak) ≤40→2(weak) ≤60→3(dev) ≤80→4(strength) >80→5(strength)
 */
export function masteryToStars(mastery) {
  if (mastery <= 0) return 0
  if (mastery <= 0.2) return 1
  if (mastery <= 0.4) return 2
  if (mastery <= 0.6) return 3
  if (mastery <= 0.8) return 4
  return 5
}

/**
 * 星级(0-5) → mastery(0-100)，诊断 ability_stars 快照写入时用
 */
export function starsToMastery(stars) {
  return clamp((stars | 0) / 5, 0, 1)
}

/**
 * 一次性刻度迁移：将旧版 0-100 mastery 归一到 0-1（>1 的值 /100）。
 * 幂等：已是 0-1 的值不动。供 profile.migrateProfile 在加载时调用，
 *   使既有 0-100 历史数据一次性对齐到统一 0-1 刻度（与 persistToDB/setAbilityStar 写入一致）。
 * @param {object} ksMap - knowledge_state map
 * @returns {object} 迁移后的新 map（仅 mastery>1 的项被替换）
 */
export function migrateMasteryScale(ksMap) {
  if (!ksMap || typeof ksMap !== 'object') return ksMap || {}
  const out = {}
  for (const [topic, ks] of Object.entries(ksMap)) {
    if (!ks || typeof ks !== 'object') { out[topic] = ks; continue }
    const m = Number(ks.mastery)
    out[topic] = (Number.isFinite(m) && m > 1)
      ? { ...ks, mastery: m / 100 }
      : ks
  }
  return out
}
