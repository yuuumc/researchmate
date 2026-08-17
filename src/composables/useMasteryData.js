// ============================================================
// useMasteryData — 统一学情数据层（A1 · T1-7）
// ============================================================
// 单一数据源原则：
//   - 弱弱点（weakPoints）：只从 diagnosisStore.latest.weak_points 读
//     （诊断唯一权威源，考纲内，零职业技能标签污染）
//   - 能力星级（abilityStars）：从 profileStore.ability_stars 读
//     （diagnosis.runDiagnosis + practice 判分共同写入的活态镜像）
//   - 诊断分（latestScore）：从 diagnosisStore.latest.score 读（持久化）
//   - 根因链（rootCauseChain）：从 diagnosisStore.latest.structured 读（持久化）
//
// 所有模块（CareerView / HomeView / DiagnosisView / PracticeView）统一经此
// composable 取数，禁止各模块自行推断掌握/薄弱状态。
// 阈值全仓统一：1-2 星 = weak，3 星 = developing，4-5 星 = strength/mastered
// ============================================================

import { computed } from 'vue'
import { useDiagnosisStore } from '@/stores/diagnosis'
import { useProfileStore } from '@/stores/profile'

let _masteryDecayDone = false  // F1: 同次会话只衰减一次

const WEAK_MAX = 2      // 1-2 星 = 薄弱
const STRONG_MIN = 4    // 4-5 星 = 优势/已掌握
// 3 星 = developing（发展中，既非薄弱也非优势）

export function useMasteryData() {
  const diagnosisStore = useDiagnosisStore()
  const profileStore = useProfileStore()

  // === 权威最近一次诊断（持久化 history） ===
  const latestDiagnosis = computed(() => diagnosisStore.latest)

  // === 诊断分（持久化诊断记录优先，profile 兜底） ===
  const latestScore = computed(() => {
    const d = latestDiagnosis.value
    if (d && typeof d.score === 'number') return d.score
    return profileStore.profile?.last_diagnosis_score ?? null
  })

  // === 能力星级（活态镜像：diagnosis + practice 共同维护） ===
  const abilityStarsRaw = computed(() => {
    return profileStore.profile?.ability_stars || {}
  })

  // 归一化能力星图（统一 type 分类，全仓一致）
  const abilityStars = computed(() => {
    return Object.entries(abilityStarsRaw.value).map(([topic, star]) => {
      const s = parseInt(star, 10) || 0
      return {
        topic,
        star: s,
        score: s * 20,
        type: s > 0 && s <= WEAK_MAX ? 'weak' : s >= STRONG_MIN ? 'strength' : 'developing'
      }
    })
  })

  // === 弱弱点：诊断唯一源（考纲内，零职业标签） ===
  const weakPoints = computed(() => {
    const d = latestDiagnosis.value
    if (!d) return []
    const wps = Array.isArray(d.weak_points) ? d.weak_points : []
    const raw = wps
      .map((w) => (typeof w === 'string' ? w : (w?.knowledge_point || w?.reason || '')))
      .filter(Boolean)
    // T1-7: 过滤已掌握项（>=4 星），防止旧诊断数据中优势项混入薄弱点
    const mastered = new Set(masteredSkills.value)
    let result = raw.filter((w) => !mastered.has(w))
    // T1-7 deep fallback: 旧诊断记录无 weak_points 时，从 ability_stars 反推薄弱点
    if (result.length === 0 && abilityStars.value.length > 0) {
      const weakFromStars = abilityStars.value
        .filter((a) => a.type === 'weak')
        .map((a) => a.topic)
      result = weakFromStars.filter((w) => !mastered.has(w))
    }
    return result
  })

  // 弱弱点数量（从诊断报告，不读 profileStore.weak_topics）
  const weakPointCount = computed(() => weakPoints.value.length)

  // === 统一计数（全仓口径一致） ===
  const strongCount = computed(() => abilityStars.value.filter((a) => a.type === 'strength').length)
  const weakStarCount = computed(() => abilityStars.value.filter((a) => a.type === 'weak').length)
  const developingCount = computed(() => abilityStars.value.filter((a) => a.type === 'developing').length)

  // === 已掌握技能（与 strongCount 同源：≥4 星） ===
  const masteredSkills = computed(() =>
    abilityStars.value.filter((a) => a.type === 'strength').map((a) => a.topic)
  )

  // === 根因链（持久化诊断记录为准，内存 lastReport 仅作新鲜回退） ===
  const rootCauseChain = computed(() => {
    // 持久化诊断记录（权威源，与 latestScore / weakPoints 同源）
    const d = latestDiagnosis.value
    const persistedStructured = d?.structured || null
    // 新鲜 API 结果（内存态，仅在持久化无 structured 时回退）
    const liveStructured = diagnosisStore.lastReport?.structured

    const s = persistedStructured || liveStructured
    if (!s) {
      // T1-7: 旧数据兼容 — 旧诊断记录无 structured 字段时，从基本字段构造最小根因链
      if (d && (d.weak_points?.length || d.root_causes?.length || typeof d.score === 'number')) {
        return {
          score: typeof d.score === 'number' ? d.score : '—',
          subject: d.subject || '—',
          weak_points: (d.weak_points || [])
            .map((p) => (typeof p === 'object' ? p.knowledge_point || p.reason || JSON.stringify(p) : p)),
          direct_causes: [],
          middle_causes: [],
          root_causes: d.root_causes || [],
          remediation: ''
        }
      }
      // T1-7 deep fallback: 旧诊断记录连基本字段都缺失时，从 ability_stars 反推
      if (d && abilityStars.value.length > 0) {
        const weakTopics = abilityStars.value.filter((a) => a.type === 'weak').map((a) => a.topic)
        const avgScore = Math.round(
          abilityStars.value.reduce((sum, a) => sum + a.score, 0) / abilityStars.value.length
        )
        return {
          score: avgScore,
          subject: d.subject || '—',
          weak_points: weakTopics,
          direct_causes: [],
          middle_causes: [],
          root_causes: weakTopics.map((t) => t + '基础薄弱'),
          remediation: ''
        }
      }
      return null
    }

    return {
      score: typeof s.score === 'number' ? s.score : (d?.score ?? '—'),
      subject: s.subject || d?.subject || '—',
      weak_points: (s.weak_points || d?.weak_points || [])
        .map((p) => (typeof p === 'object' ? p.knowledge_point || p.reason || JSON.stringify(p) : p)),
      direct_causes: s.direct_causes || [],
      middle_causes: s.middle_causes || [],
      root_causes: s.root_causes || d?.root_causes || [],
      remediation: s.remediation_path || ''
    }
  })

  // === 最大短板（HomeView 弱势卡片用） ===
  const biggestWeakness = computed(() => {
    const weak = abilityStars.value.filter((a) => a.type === 'weak')
    if (weak.length > 0) {
      const sorted = [...weak].sort((a, b) => a.star - b.star)
      return { topic: sorted[0].topic, stars: sorted[0].star }
    }
    if (weakPoints.value.length > 0) {
      return { topic: weakPoints.value[0], stars: 0 }
    }
    return null
  })

  // === F1: knowledge_state 多维掌握度（画像引擎地基读路径） ===
  const knowledgeState = computed(() => profileStore.profile?.knowledge_state || {})

  // F1: 画像页打开时跑一次遗忘衰减（GWT3：lastStudied 越久 → mastery 经衰减后低于记录值）
  if (!_masteryDecayDone) {
    _masteryDecayDone = true
    try { profileStore.decayStaleMastery && profileStore.decayStaleMastery() } catch (e) { console.warn('[mastery] decay failed:', e) }
  }

  // F1: 手动触发衰减刷新
  const decayStaleMastery = () => profileStore.decayStaleMastery && profileStore.decayStaleMastery()

  return {
    latestDiagnosis,
    latestScore,
    abilityStars,
    weakPoints,
    weakPointCount,
    strongCount,
    weakStarCount,
    developingCount,
    masteredSkills,
    rootCauseChain,
    biggestWeakness,
    knowledgeState,
    decayStaleMastery,
  }
}
