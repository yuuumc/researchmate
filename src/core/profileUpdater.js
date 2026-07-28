// ============================================================
// 画像更新（对应原工作流 N8）
// ============================================================
// 职责：根据 Agent 返回结果，更新学生画像
// 策略：mastered > weak（铁律，互斥）
// ============================================================

import { useProfileStore } from '@/stores/profile'
import { useDiagnosisStore } from '@/stores/diagnosis'
import { usePlanStore } from '@/stores/plan'

/**
 * 根据 Agent 返回结果更新画像
 * @param {string} intent - 意图
 * @param {object} result - Agent 返回结果
 * @param {object} profile - 当前画像快照
 */
export function updateProfileAfterResponse(intent, result, profile) {
  if (!result || result.error) return

  const profileStore = useProfileStore()

  switch (intent) {
    case 'diagnose':
      updateAfterDiagnose(result, profileStore)
      break
    case 'plan':
      updateAfterPlan(result, profileStore)
      break
    case 'admission':
      updateAfterAdmission(result, profileStore)
      break
    case 'concept':
      // 概念问题不直接更新画像，等诊断再统一更新
      break
    default:
      break
  }
}

function updateAfterDiagnose(result, profileStore) {
  const data = result.structured || {}
  if (typeof data.score === 'number') {
    profileStore.setLastDiagnosis(data.score)
  }
  // 写入诊断历史
  const diagnosisStore = useDiagnosisStore()
  diagnosisStore.add({
    score: data.score ?? null,
    subject: data.subject || '',
    weak_points: data.weak_points || [],
    root_causes: data.root_causes || [],
    raw_report: result.content || '',
    topics_snapshot: [...profileStore.profile.weak_topics]
  })
  // 新薄弱点入画像
  if (Array.isArray(data.weak_points)) {
    data.weak_points.forEach((t) => profileStore.addWeakTopic(t))
  }
  // v2 升级：4 层根因链的"根本原因"作为更深层的薄弱点
  if (Array.isArray(data.root_causes)) {
    data.root_causes.forEach((t) => profileStore.addWeakTopic(t))
  }
}

function updateAfterPlan(result, profileStore) {
  const data = result.structured || {}
  const planStore = usePlanStore()
  planStore.addPlan({
    based_on_diagnosis: profileStore.profile.last_diagnosis_date,
    weeks: data.weeks || [],
    adjustments: data.adjustments,
    raw_plan: result.content || ''
  })
  if (data.target_stage) {
    profileStore.setPreparationStage(data.target_stage)
  }
}

function updateAfterAdmission(result, profileStore) {
  const data = result.structured || {}
  if (data.target_school) {
    profileStore.setTarget(data.target_school, data.target_major || profileStore.profile.target_major)
  }
}

/**
 * 手动标记掌握（用户在 UI 上点击）
 */
export function markMastered(topic) {
  const profileStore = useProfileStore()
  profileStore.addMasteredTopic(topic)
}

/**
 * 手动标记薄弱（用户在 UI 上点击）
 */
export function markWeak(topic) {
  const profileStore = useProfileStore()
  profileStore.addWeakTopic(topic)
}
