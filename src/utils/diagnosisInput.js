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
 * 判断一条诊断记录是否包含有效数据
 * 区分「无诊断」（null）和「有记录但内容为空」（如 API 部分失败/DB 空壳记录）
 * 有效 = score 为数字，或有薄弱点/根因/报告文本任一
 * @param {Object|null} record
 * @returns {boolean}
 */
export function isValidDiagnosisRecord(record) {
  if (!record) return false
  // score > 0 才算有效诊断分数（score=0 通常是空壳/失败残留；
  // 真实 0 分诊断必然带 weak_points/root_causes，由后续条件兜住）
  const hasValidScore = typeof record.score === 'number'
    && !Number.isNaN(record.score) && record.score > 0
  if (hasValidScore) return true
  if (Array.isArray(record.weak_points) && record.weak_points.length > 0) return true
  if (Array.isArray(record.root_causes) && record.root_causes.length > 0) return true
  if (typeof record.raw_report === 'string' && record.raw_report.trim()) return true
  return false
}

/**
 * 从最近一次诊断结果提取规划输入
 * 诊断 → 规划的数据流：诊断输出的 weak_points/root_causes/remediation_path/score
 * 作为规划 Agent 的 diagnosis_result 传入
 * P0 修复：空壳诊断记录（score null + 全空字段）返回 null，与「无诊断」同等处理，
 * 避免规划 Agent 拿到 { score: null, weak_points: [] } 垃圾输入
 * @returns {Object|null} { score, weak_points, root_causes, remediation_path, overall_level }
 */
export function getDiagnosisResultForPlan() {
  const diagnosisStore = useDiagnosisStore()
  const latest = diagnosisStore.latest

  if (!isValidDiagnosisRecord(latest)) return null

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
