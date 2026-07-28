// ============================================================
// 主控编排器（对应原工作流 N2 意图识别）
// ============================================================
// 职责：
//   1. 加载学生画像
//   2. 意图识别（调用 DeepSeek）
//   3. 路由到对应 Agent
//   4. 兜底：意图识别失败 → 默认走 concept（专业导师）
//
// v1 正式版升级（v1正式版.txt §六）：
//   接入 Agent Trace 事件系统，记录全过程时间线
//   Router → Profile → Agent → Profile Update
// ============================================================

import { tutorAgent } from './agents/tutor'
import { diagnoseAgent } from './agents/diagnose'
import { plannerAgent } from './agents/planner'
import { admissionAgent } from './agents/admission'
import { researchAgent } from './agents/research'
import { loadProfile } from './profileLoader'
import { updateProfileAfterResponse } from './profileUpdater'
import { cascadeDiagnoseToPlan } from './cascade'
import { AI_PROVIDER } from '@/api/custom'
import { safeParseJSON } from '@/utils/validator'
import { useTraceStore } from '@/stores/trace'

// 意图识别 Prompt（v1 正式版：5 Agent）
const INTENT_PROMPT = `你是研芯通的主控编排器，负责识别学生输入的意图。
可选意图：
- concept：概念问题（如"MOSFET 阈值电压怎么推导"）
- diagnose：诊断请求（如"我半导体物理考了 55 分"）
- plan：规划请求（如"帮我做下个月复习计划"）
- admission：择校请求（如"我双非前 30%，想去长三角"）
- research：科研成长请求（如"我以后想做 AI 芯片需要准备什么" / "给我一个科研路线图" / "推荐一些论文和项目"）
- cascade：级联请求（如"先诊断再规划"）

请仅返回 JSON 格式：{"intent": "concept|diagnose|plan|admission|research|cascade", "raw_query": "<学生原始输入>"}
不要输出任何其他内容。`

// 意图中文标签（用于 Trace 展示）
const INTENT_LABELS = {
  concept: '概念引导',
  diagnose: '学习诊断',
  plan: '复习规划',
  admission: '择校规划',
  research: '科研成长',
  cascade: '级联（诊断→规划）'
}

// 备考阶段中文标签
const STAGE_LABELS = {
  initial: '起步',
  basic: '基础',
  intensive: '强化',
  sprint: '冲刺'
}

/**
 * 主控路由
 * @param {string} userInput - 学生原始输入
 * @returns {Promise<object>} { intent, content, raw, agent }
 */
export async function route(userInput) {
  if (!userInput || !userInput.trim()) {
    return { error: 'empty_input', agent: 'router' }
  }

  // 初始化 trace store（Pinia 已在 main.js 中注册）
  const traceStore = useTraceStore()
  traceStore.startSession(userInput)

  // 1. 加载学生画像（带 trace）
  let profile
  const profileStepIdx = traceStore.addStep('profile', '加载学生画像…')
  try {
    profile = loadProfile()
    const stageLabel = STAGE_LABELS[profile.preparation_stage] || profile.preparation_stage
    const majorLabel = profile.target_major || profile.major || '未设定'
    const weakCount = profile.weak_topics?.length || 0
    traceStore.updateStep(profileStepIdx, 'done', {
      detail: `${majorLabel} · ${stageLabel}阶段 · 薄弱${weakCount}项`
    })
  } catch (e) {
    traceStore.updateStep(profileStepIdx, 'error', { error: e.message })
    traceStore.endSession()
    throw e
  }

  // 2. 意图识别（带 trace）
  let intent = 'concept' // 默认兜底
  const routerStepIdx = traceStore.addStep('router', '识别意图…')
  try {
    const intentRaw = await AI_PROVIDER.call(INTENT_PROMPT, userInput, {
      temperature: 0.1,
      max_tokens: 200
    })
    const parsed = safeParseJSON(intentRaw, { intent: 'concept' })
    const validIntents = ['concept', 'diagnose', 'plan', 'admission', 'research', 'cascade']
    if (parsed && validIntents.includes(parsed.intent)) {
      intent = parsed.intent
    }
    traceStore.updateStep(routerStepIdx, 'done', {
      detail: INTENT_LABELS[intent] || intent
    })
  } catch (e) {
    console.warn('[router] intent recognition failed, fallback to concept:', e.message)
    traceStore.updateStep(routerStepIdx, 'done', {
      detail: '概念引导（兜底）'
    })
  }

  // 3. 路由到对应 Agent（带 trace）
  let result
  const agentStepIdx = traceStore.addStep(intent, getAgentStartDetail(intent))
  try {
    switch (intent) {
      case 'concept':
        result = await tutorAgent(userInput, profile)
        break
      case 'diagnose':
        result = await diagnoseAgent(userInput, profile)
        break
      case 'plan':
        result = await plannerAgent(userInput, profile)
        break
      case 'admission':
        result = await admissionAgent(userInput, profile)
        break
      case 'research':
        result = await researchAgent(userInput, profile)
        break
      case 'cascade':
        result = await cascadeDiagnoseToPlan(userInput, profile)
        break
      default:
        result = await tutorAgent(userInput, profile)
    }
    traceStore.updateStep(agentStepIdx, 'done', {
      detail: getAgentDoneDetail(intent, result)
    })
  } catch (e) {
    console.error('[router] agent execution failed:', e)
    traceStore.updateStep(agentStepIdx, 'error', { error: e.message })
    result = {
      intent,
      content: 'AI 服务暂不可用，请稍后再试。错误信息：' + e.message,
      agent: intent,
      error: true
    }
  }

  // 4. 画像更新（带 trace）
  const updateStepIdx = traceStore.addStep('profile_update', '更新学生画像…')
  try {
    updateProfileAfterResponse(intent, result, profile)
    traceStore.updateStep(updateStepIdx, 'done', {
      detail: getUpdateDetail(intent, result, profile)
    })
  } catch (e) {
    console.warn('[router] profile update failed:', e)
    traceStore.updateStep(updateStepIdx, 'error', { error: e.message })
  }

  traceStore.endSession()
  return { intent, ...result }
}

/**
 * 同步获取当前意图（用于 UI 高亮，不调用 LLM）
 */
export function guessIntentByRoute(agentRoute) {
  const map = {
    tutor: 'concept',
    diagnose: 'diagnose',
    planner: 'plan',
    admission: 'admission'
  }
  return map[agentRoute] || 'concept'
}

// === Trace 详情生成辅助函数 ===

function getAgentStartDetail(intent) {
  const map = {
    concept: '苏格拉底式引导中…',
    diagnose: '4 层根因分析中…',
    plan: '生成动态周计划…',
    admission: '匹配院校数据…',
    research: '规划科研成长路线…',
    cascade: '级联：诊断 → 规划…'
  }
  return map[intent] || '执行中…'
}

function getAgentDoneDetail(intent, result) {
  if (!result) return '完成'
  const structured = result.structured

  switch (intent) {
    case 'concept': {
      const ragCount = result.rag_slices?.length || 0
      return ragCount > 0 ? `RAG 检索 ${ragCount} 条切片` : '通用知识回答'
    }
    case 'diagnose': {
      if (structured) {
        const score = structured.score
        const weakCount = structured.weak_points?.length || 0
        return score != null ? `分数 ${score} · 薄弱 ${weakCount} 项` : `薄弱 ${weakCount} 项`
      }
      return '诊断完成'
    }
    case 'plan': {
      if (structured?.weeks?.length) {
        return `${structured.weeks.length} 周计划`
      }
      return '计划生成完成'
    }
    case 'admission': {
      if (structured?.recommendations?.length) {
        return `推荐 ${structured.recommendations.length} 所院校`
      }
      return '择校完成'
    }
    case 'research': {
      if (structured) {
        const undergradSteps = structured.undergrad_path?.length || 0
        const researchSteps = structured.research_path?.length || 0
        const papers = structured.papers?.length || 0
        const projects = structured.projects?.length || 0
        const direction = structured.direction || ''
        return `${direction} · 本科${undergradSteps}步/科研${researchSteps}步 · 论文${papers}/项目${projects}`
      }
      return '科研路线生成完成'
    }
    case 'cascade': {
      const diagScore = structured?.diagnose_score
      const weakCount = structured?.diagnose?.weak_points?.length || 0
      const planWeeks = structured?.plan?.weeks?.length || 0
      return `诊断${diagScore != null ? ` ${diagScore}分` : ''} · 薄弱${weakCount}项 · ${planWeeks}周计划`
    }
    default:
      return '完成'
  }
}

function getUpdateDetail(intent, result, profile) {
  const parts = []
  if (intent === 'diagnose' || intent === 'cascade') {
    const score = result?.structured?.score
    if (score != null) parts.push(`分数 ${score}`)
    const weakCount = result?.structured?.weak_points?.length || 0
    if (weakCount > 0) parts.push(`新增薄弱 ${weakCount} 项`)
  }
  if (intent === 'plan' || intent === 'cascade') {
    parts.push('计划版本 +1')
  }
  return parts.length > 0 ? parts.join(' · ') : '画像已同步'
}
