// ============================================================
// 画像装配（对应原工作流 N3）
// ============================================================
// 职责：从 Pinia store 加载学生画像，注入到 Agent 上下文
// ============================================================

import { useProfileStore } from '@/stores/profile'
import { useDiagnosisStore } from '@/stores/diagnosis'
import { usePlanStore } from '@/stores/plan'

/**
 * 加载学生画像（含诊断历史 + 计划版本的精简信息）
 * @returns {object} profile 快照
 */
export function loadProfile() {
  const profileStore = useProfileStore()
  const diagnosisStore = useDiagnosisStore()
  const planStore = usePlanStore()

  return {
    ...profileStore.profile,
    // 诊断历史概要（最近 5 次）
    recent_diagnoses: diagnosisStore.history.slice(-5).map((h) => ({
      score: h.score,
      date: h.timestamp,
      weak_points: h.weak_points
    })),
    // 当前计划版本
    current_plan_version: planStore.currentVersion,
    current_plan: planStore.current
  }
}

/**
 * 把画像转成 Prompt 上下文字符串
 */
export function profileToContext(profile) {
  if (!profile) return '（暂无画像）'

  const lines = []
  lines.push(`学生 ID: ${profile.user_id}`)
  lines.push(`备考阶段: ${profile.preparation_stage}`)
  if (profile.target_school) lines.push(`目标院校: ${profile.target_school}`)
  if (profile.target_major) lines.push(`目标专业: ${profile.target_major}`)
  if (profile.weak_topics.length > 0) {
    lines.push(`薄弱知识点: ${profile.weak_topics.join('、')}`)
  }
  if (profile.mastered_topics.length > 0) {
    lines.push(`已掌握知识点: ${profile.mastered_topics.join('、')}`)
  }
  if (profile.last_diagnosis_score !== null) {
    lines.push(`最近诊断分数: ${profile.last_diagnosis_score}`)
  }
  if (profile.recent_diagnoses && profile.recent_diagnoses.length > 0) {
    lines.push(`历史诊断轮次: ${profile.recent_diagnoses.length}`)
  }
  return lines.join('\n')
}
