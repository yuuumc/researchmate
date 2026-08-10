// ============================================================
// 画像更新（对应原工作流 N8）
// ============================================================
// 职责：根据 Agent 返回结果，更新学生画像
// 策略：mastered > weak（铁律，互斥）
// v1.5 新增：diagnose 后自动入错题本（仅当 ability_stars ≤ 2）
// P0-3 新增：diagnose/plan/admission 后写入向量记忆（addMemory）
// ============================================================


import { useProfileStore } from '@/stores/profile'
import { useDiagnosisStore } from '@/stores/diagnosis'
import { usePlanStore } from '@/stores/plan'
import { useWrongBookStore } from '@/stores/wrongBook'
// P0-3: 向量记忆写入
import { addMemory } from '@/utils/vectorMemory'


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

  // v1.5：诊断时快照 ability_stars（趋势图和错题本都用）
  const starsSnapshot = { ...profileStore.profile.ability_stars }

  // 写入诊断历史（含 stars snapshot，给 HistoryView 趋势图用）
  const diagnosisStore = useDiagnosisStore()
  diagnosisStore.add({
    score: data.score ?? null,
    subject: data.subject || '',
    weak_points: data.weak_points || [],
    root_causes: data.root_causes || [],
    raw_report: result.content || '',
    topics_snapshot: [...profileStore.profile.weak_topics],
    ability_stars_snapshot: starsSnapshot
  })

  // 新薄弱点入画像
  if (Array.isArray(data.weak_points)) {
    data.weak_points.forEach((t) => profileStore.addWeakTopic(t))
  }
  // v2 升级：4 层根因链的"根本原因"作为更深层的薄弱点
  if (Array.isArray(data.root_causes)) {
    data.root_causes.forEach((t) => profileStore.addWeakTopic(t))
  }

  // v1.5：错题本自动入册
  //   仅当 ability_stars ≤ 2（包含未评分=0）。重复出现累加 occurrences。
  //   优先检查入 weak_points（更具体），其次 root_causes。
  const wrongBook = useWrongBookStore()
  const seen = new Set()
  const collect = (arr, source) => {
    if (!Array.isArray(arr)) return
    arr.forEach((topic) => {
      if (!topic || seen.has(topic)) return
      seen.add(topic)
      const stars = starsSnapshot[topic]
      wrongBook.addIfWeak(topic, stars, source)
    })
  }
  collect(data.weak_points, 'weak_point')
  collect(data.root_causes, 'root_cause')

  // P0-3: 写入向量记忆（用于后续「我记得你上次…」的个性化召回）
  //   路径: router → updateProfileAfterResponse('diagnose', ...) → 本函数
  //   注意: Agent API 路径(diagnosis.js runDiagnosis) 走自己的 addMemory，详见 diagnosis.js
  try {
    const subject = data.subject || profileStore.profile.major || '未指定学科'
    const scorePart = typeof data.score === 'number' ? `考了${data.score}分` : '诊断'
    const weakPart = (data.weak_points && data.weak_points.length > 0)
      ? `薄弱点:${data.weak_points.join('、')}`
      : '无明显薄弱'
    const memoryText = `${subject}${scorePart}，${weakPart}`
    addMemory('diagnosis', memoryText, {
      score: data.score ?? null,
      subject,
      weak_points: data.weak_points || [],
      root_causes: data.root_causes || []
    })
  } catch (e) {
    console.warn('[profileUpdater] addMemory(diagnosis) failed:', e.message)
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

  // P0-3: 写入向量记忆
  try {
    const weeksCount = (data.weeks && data.weeks.length) || 0
    const stagePart = data.target_stage || profileStore.profile.preparation_stage || '未指定阶段'
    const memoryText = `生成${weeksCount}周复习计划，目标阶段:${stagePart}`
    addMemory('plan', memoryText, {
      weeks_count: weeksCount,
      target_stage: data.target_stage || '',
      adjustments: data.adjustments || null
    })
  } catch (e) {
    console.warn('[profileUpdater] addMemory(plan) failed:', e.message)
  }
}


function updateAfterAdmission(result, profileStore) {
  const data = result.structured || {}
  if (data.target_school) {
    profileStore.setTarget(data.target_school, data.target_major || profileStore.profile.target_major)
  }

  // P0-3: 写入向量记忆
  try {
    const school = data.target_school || profileStore.profile.target_school || '未指定院校'
    const major = data.target_major || profileStore.profile.target_major || ''
    const memoryText = `目标院校:${school}，专业:${major}`
    addMemory('admission', memoryText, {
      target_school: school,
      target_major: major
    })
  } catch (e) {
    console.warn('[profileUpdater] addMemory(admission) failed:', e.message)
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
