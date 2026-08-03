// ============================================================
// 诊断输入构建器（P0 #9 · 知识图谱知识点注入诊断输入）
// ============================================================
// 从 profileStore 提取学生知识结构，组装为 diagnosis API 输入。
// 让诊断 Agent 能感知学生当前知识图谱（掌握/薄弱/盲区），
// 而非仅靠自评文本——提升诊断精准度。
//
// 输出格式（对齐 diagnosis.js store 的 runDiagnosis 入参）：
// {
//   student_name, target_major,
//   mastered_skills, weak_points,
//   knowledge_points: [{ topic, star, status }]
// }
// ============================================================

import { useProfileStore } from '@/stores/profile'
import { useDiagnosisStore } from '@/stores/diagnosis'

/**
 * 从 profileStore 提取知识结构（知识点 + 星级 + 掌握状态）
 * @returns {Array<{topic, star, status}>}
 */
export function getKnowledgeStructure() {
  const profileStore = useProfileStore()
  const stars = profileStore.profile?.ability_stars || {}
  const mastered = new Set(profileStore.profile?.mastered_topics || [])
  const weak = new Set(profileStore.profile?.weak_topics || [])

  // ability_stars 优先；无 ability_stars 时从 mastered/weak 列表兜底
  const topics = Object.keys(stars)
  if (topics.length === 0) {
    // 兜底：无星级数据时，mastered → 4 星、weak → 1 星
    return [
      ...[...mastered].map((t) => ({ topic: t, star: 4, status: 'mastered' })),
      ...[...weak].map((t) => ({ topic: t, star: 1, status: 'weak' }))
    ]
  }

  return topics.map((topic) => {
    const star = stars[topic] || 0
    let status
    if (mastered.has(topic) || star >= 4) {
      status = 'mastered'
    } else if (weak.has(topic) || star <= 2) {
      status = 'weak'
    } else {
      status = 'learning'
    }
    return { topic, star, status }
  })
}

/**
 * 组装诊断 API 输入（含知识图谱知识点）
 * @param {Object} overrides - 可选覆盖字段
 * @returns {Object} diagnosis input for runDiagnosis()
 */
export function buildDiagnosisInput(overrides = {}) {
  const profileStore = useProfileStore()
  const profile = profileStore.profile || {}

  const knowledgePoints = getKnowledgeStructure()

  return {
    student_name: profile.name || overrides.student_name || '',
    target_major: profile.target_major || profile.major || overrides.target_major || '',
    mastered_skills: profile.mastered_topics || [],
    weak_points: profile.weak_topics || [],
    // #9 核心：知识图谱知识点注入，让 Agent 感知学生当前知识结构
    knowledge_points: knowledgePoints,
    ...overrides
  }
}

/**
 * 从最近一次诊断结果提取规划输入
 * 诊断 → 规划的数据流：诊断输出的 weak_points/root_causes/remediation_path/score
 * 作为规划 Agent 的 diagnosis_result 传入
 * @returns {Object|null} { score, weak_points, root_causes, remediation_path, overall_level }
 */
export function getDiagnosisResultForPlan() {
  const diagnosisStore = useDiagnosisStore()
  const latest = diagnosisStore.latest

  if (!latest) return null

  return {
    score: latest.score,
    weak_points: latest.weak_points || [],
    root_causes: latest.root_causes || [],
    remediation_path: latest.raw_report || '',
    overall_level: latest.ability_stars_snapshot
      ? Math.round(
          (Object.values(latest.ability_stars_snapshot).reduce((s, v) => s + v, 0) /
            (Object.values(latest.ability_stars_snapshot).length || 1)) * 20
        )
      : null
  }
}
