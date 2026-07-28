// ============================================================
// 级联：diagnose → plan（v2.0 SSE 版）
// ============================================================
// 职责：先调用 diagnose，再基于诊断结果调用 plan
// v2.0 升级：透传 onToken，让级联也能流式输出
// ============================================================

import { diagnoseAgent } from './agents/diagnose'
import { plannerAgent } from './agents/planner'
import { useTraceStore } from '@/stores/trace'

/**
 * 级联调用
 * @param {string} userInput
 * @param {object} profile
 * @param {object} [ctx] v2.0: { onToken, signal }
 */
export async function cascadeDiagnoseToPlan(userInput, profile, ctx = {}) {
  const { onToken = null, signal = null } = ctx
  const traceStore = useTraceStore()

  // 第一步：诊断
  const diagnoseStep = traceStore.addStep('diagnose', '4 层根因分析（级联）…')
  const diagnoseResult = await diagnoseAgent(userInput, profile, { onToken, signal })
  traceStore.updateStep(diagnoseStep, 'done', {
    detail: diagnoseResult.structured?.score != null
      ? `分数 ${diagnoseResult.structured.score}`
      : '诊断完成'
  })

  // 第二步：基于诊断结果做规划
  const planInput = `${userInput}\n\n（基于诊断结果：${diagnoseResult.content?.slice(0, 300) || '无'}）`
  const planStep = traceStore.addStep('planner', '生成复习计划（级联）…')
  const planResult = await plannerAgent(planInput, profile, { onToken, signal })
  traceStore.updateStep(planStep, 'done', {
    detail: planResult.structured?.weeks?.length
      ? `${planResult.structured.weeks.length} 周计划`
      : '计划完成'
  })

  return {
    intent: 'cascade',
    agent: 'cascade',
    content: `${diagnoseResult.content}\n\n---\n\n${planResult.content}`,
    structured: {
      diagnose: diagnoseResult.structured,
      plan: planResult.structured,
      diagnose_score: diagnoseResult.structured?.score,
      diagnose_content: diagnoseResult.content,
      plan_content: planResult.content
    }
  }
}
