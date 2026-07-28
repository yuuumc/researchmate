// ============================================================
// 级联管道（对应原工作流 N5 → N6）
// ============================================================
// 场景：学生说"先诊断再规划" → 诊断完成后自动触发规划
// 状态一致性（v2 §V7 / v3.4 8/10 验收）：
//   - 诊断产生的 weak_topics 必须真正写入 profile store
//   - 规划阶段必须从 store 重新 loadProfile，确保拿到最新画像
//   - 严禁直接 spread structured（字段名不一致会导致状态丢失）
// ============================================================

import { diagnoseAgent } from './agents/diagnose'
import { plannerAgent } from './agents/planner'
import { updateProfileAfterResponse } from './profileUpdater'
import { loadProfile } from './profileLoader'

/**
 * 级联：先诊断，再用诊断结果驱动规划
 * @param {string} userInput
 * @param {object} profile
 * @returns {Promise<object>} { intent: 'cascade', diagnose, plan, content }
 */
export async function cascadeDiagnoseToPlan(userInput, profile) {
  // 1. 诊断
  const diagnoseResult = await diagnoseAgent(userInput, profile)

  // 2. 把诊断结果写回 store（weak_topics / last_diagnosis_score / diagnosis_history）
  updateProfileAfterResponse('diagnose', diagnoseResult, profile)

  // 3. 从 store 重新加载画像，确保拿到写入后的最新状态
  //    （v3.4 修复：原代码 spread structured 字段名不匹配，会丢失状态）
  const updatedProfile = loadProfile()

  // 4. 规划：基于诊断结果生成针对性计划
  const weakPoints = diagnoseResult.structured?.weak_points || []
  const score = diagnoseResult.structured?.score
  const planInput = `基于刚才的诊断${score != null ? `（分数 ${score}）` : ''}，薄弱点：${weakPoints.join('、') || '无'}。帮我做一份针对性复习计划，薄弱知识点优先 P0。`

  const planResult = await plannerAgent(planInput, updatedProfile)

  // 5. 规划结果也写回 store（plan_version + preparation_stage）
  updateProfileAfterResponse('plan', planResult, updatedProfile)

  // 6. 拼接最终展示内容（ChatWindow 会基于 diagnose/plan 字段渲染双卡片）
  const content = `## 第一步：学习诊断\n\n${diagnoseResult.content}\n\n---\n\n## 第二步：复习规划（基于诊断结果）\n\n${planResult.content}`

  return {
    intent: 'cascade',
    agent: 'cascade',
    content,
    diagnose: diagnoseResult,
    plan: planResult,
    // structured 同时暴露 diagnose 和 plan，供 UI 渲染双卡片
    structured: {
      diagnose: diagnoseResult.structured,
      plan: planResult.structured,
      cascade: true,
      diagnose_score: score
    }
  }
}
