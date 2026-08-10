// ============================================================
// 画像装配（对应原工作流 N3）
// ============================================================
// 职责：从 Pinia store 加载学生画像，注入到 Agent 上下文
// P0-3 升级：加入「相似历史记忆」召回，注入 prompt 上下文
// ============================================================

import { useProfileStore } from '@/stores/profile'
import { useDiagnosisStore } from '@/stores/diagnosis'
import { usePlanStore } from '@/stores/plan'
// P0-3: 向量记忆召回
import { queryMemory } from '@/utils/vectorMemory'

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
 * P0-3: 基于用户输入召回相似历史记忆
 * @param {string} query - 用户原始输入
 * @param {object} [opts] - 召回选项
 * @param {number} [opts.topK=3]
 * @param {number} [opts.minScore=0.18]
 * @returns {Array<{id, type, text, score, ts, meta}>}
 */
export function loadMemories(query, opts = {}) {
  if (!query || typeof query !== 'string' || !query.trim()) return []
  try {
    return queryMemory(query, opts)
  } catch (e) {
    console.warn('[profileLoader] loadMemories failed:', e.message)
    return []
  }
}

/**
 * 把画像转成 Prompt 上下文字符串
 * P0-3: 末尾追加「相似历史记忆」段落（profile.recent_memories 非空时）
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

  // P0-3: 相似历史记忆段落
  if (profile.recent_memories && Array.isArray(profile.recent_memories) && profile.recent_memories.length > 0) {
    lines.push('')
    lines.push('--- 相似历史记忆 ---')
    profile.recent_memories.forEach((m, i) => {
      const typeLabel = {
        diagnosis: '诊断',
        plan: '计划',
        admission: '择校',
        qa: '问答'
      }[m.type] || m.type
      lines.push(`${i + 1}. [${typeLabel}] (相似度 ${m.score}) ${m.text}`)
    })
    lines.push('请在回答中自然引用上述记忆（如「我记得你上次……」），但不要机械堆砌。')
  }

  return lines.join('\n')
}
