// ============================================================
// 主控编排器（v2.0 SSE 流式版）
// ============================================================
// 职责：
//   1. 加载学生画像
//   2. P0-3: 向量记忆召回（同步，<1ms，tutor 预热前完成）
//   3. 意图识别（调 LLM） —— 与「默认 tutor 预热」并行
//   4. 路由到对应 Agent
//   5. 兜底：意图识别失败 → 默认走 concept（专业导师）
//
// v1.5 升级（H2 评审保命）：
//   「2x 串行 LLM → 并行」：intent 识别 + tutor 预热 Promise.all 并发执行
//   节省单轮延迟约 50%（如果命中 concept 走默认）
//   兜底：intent 失败 → 默认 concept；双失败 → 串行 tutor 兜底
//
// v2.0 升级：
//   透传 onToken 到 Agent — 配合 /api/chat SSE，首 token 延迟 < 2s
//   不修改 5 Agent 业务逻辑（仅让 Agent 可选地走 runLLMStream）
//
// P0-3 升级：
//   loadProfile() 之后、Promise.all 之前，插入 loadMemories(userInput) 同步执行
//   tutor 预热即享受记忆上下文（合并进 profile.recent_memories）
// ============================================================


import { tutorAgent } from './agents/tutor'
import { diagnoseAgent } from './agents/diagnose'
import { plannerAgent } from './agents/planner'
import { admissionAgent } from './agents/admission'
import { researchAgent } from './agents/research'
import { loadProfile, loadMemories } from './profileLoader'
import { queryMemory, getMemoryStats } from '@/utils/vectorMemory'
import { updateProfileAfterResponse } from './profileUpdater'
import { cascadeDiagnoseToPlan } from './cascade'
import { AI_PROVIDER } from '@/api/custom'
import { safeParseJSON } from '@/utils/validator'
import { useTraceStore } from '@/stores/trace'
import { callTool, getToolSchemas } from './tools'
import { parseIntentResult } from './tools/intentParser'

// 意图识别 Prompt（P0-2 D3：可选工具调用 + 解析兜底）
// 动态注入工具 schema，LLM 可选返回 {intent, tool, tool_args}
function buildIntentPrompt() {
  let toolSection = ''
  try {
    const schemas = getToolSchemas()
    const entries = Object.entries(schemas)
    if (entries.length > 0) {
      const lines = entries.map(([name, sc]) =>
        `- ${name}：${sc.description}（参数：${JSON.stringify(sc.args_schema)}；适用意图：${sc.mounted_on}）`
      ).join('\n')
      toolSection = `\n可选工具（仅当学生输入明确匹配某工具用途时才返回 tool 字段，否则 tool 留空""）：\n${lines}\n`
    }
  } catch (_) { /* tools 模块未加载时降级为纯意图识别 */ }

  return `你是研芯通的主控编排器，负责识别学生输入的意图。
可选意图：
- concept：概念问题（如"MOSFET 阈值电压怎么推导"）
- diagnose：诊断请求（如"我半导体物理考了 55 分"）
- plan：规划请求（如"帮我做下个月复习计划"）
- admission：择校请求（如"我双非前 30%，想去长三角"）
- research：科研成长请求（如"我以后想做 AI 芯片需要准备什么" / "给我一个科研路线图" / "推荐一些论文和项目"）
- cascade：级联请求（如"先诊断再规划"）
${toolSection}请仅返回 JSON 格式：{"intent": "concept|diagnose|plan|admission|research|cascade", "tool": "工具名或空字符串", "tool_args": {…工具参数…}}
不要输出任何其他内容。`
}

// 意图中文标签（用于 Trace 展示）
const INTENT_LABELS = {
  concept: '概念引导',
  diagnose: '学习诊断',
  plan: '复习规划',
  admission: '择校规划',
  research: '科研成长',
  cascade: '级联（诊断→规划）'
}


const STAGE_LABELS = {
  initial: '起步',
  basic: '基础',
  intensive: '强化',
  sprint: '冲刺'
}

const VALID_INTENTS = ['concept', 'diagnose', 'plan', 'admission', 'research', 'cascade']

/**
 * 调用意图识别 LLM（P0-2 D3：返回 {intent, tool, tool_args}，内置三种兜底）
 * 兜底逻辑见 tools/intentParser.js：JSON parse 失败 / tool 缺失 / tool_args 不完整
 *   → 统一退化为纯意图识别（只取 intent，不调工具），Agent 正常走流式回答
 */
async function recognizeIntentWithTool(userInput) {
  const intentRaw = await AI_PROVIDER.call(buildIntentPrompt(), userInput, {
    temperature: 0.1,
    max_tokens: 300
  })
  let schemas = {}
  try { schemas = getToolSchemas() } catch (_) { /* tools 未加载 */ }
  return parseIntentResult(intentRaw, {
    validIntents: VALID_INTENTS,
    validTools: schemas,
    fallbackIntent: 'concept'
  })
}


/**
 * 主控路由（v2.0 流式版 + P0-3 记忆召回）
 * @param {string} userInput - 学生原始输入
 * @param {object} [options] - v2.0 新增
 * @param {(chunk: {delta: string, latencyMs: number}) => void} [options.onToken] - 流式 token 回调
 * @param {AbortSignal} [options.signal] - 取消信号
 * @returns {Promise<object>} { intent, content, raw, agent }
 */
export async function route(userInput, options = {}) {
  const { onToken = null, signal = null, history = [] } = options || {}

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

  // 1.5 P0-3: 向量记忆召回（同步，<1ms，在 Promise.all 之前）
  //    让 tutor 预热即享受记忆上下文，无需等待
  //    详见 plan: loadMemories → queryMemory (topK=3, minScore=0.18)
  const memoryStepIdx = traceStore.addStep('memory_recall', '召回历史记忆…')
  try {
    const hits = loadMemories(userInput, { topK: 3, minScore: 0.18 })
    // 合并进 profile，下游 profileToContext 会渲染「相似历史记忆」段落
    profile.recent_memories = hits
    let _detail
    if (hits.length > 0) {
      _detail = `命中 ${hits.length} 条历史记忆（${hits.map(h => h.type).join('、')}）`
    } else {
      // P0-3 诊断探针：0 命中时暴露根因（库空 / 旧向量残留 / userId 不匹配）
      try {
        const _stats = getMemoryStats()
        const _best = queryMemory(userInput, { topK: 1, minScore: 0 })
        _detail = `无相似记忆（库内${_stats.count}条，最高相似度${_best[0] ? _best[0].score : 0}，阈值0.18）`
      } catch (_) {
        _detail = '无相似记忆'
      }
    }
    traceStore.updateStep(memoryStepIdx, 'done', { detail: _detail })
  } catch (e) {
    console.warn('[router] memory recall failed:', e.message)
    profile.recent_memories = []
    traceStore.updateStep(memoryStepIdx, 'error', { error: e.message })
  }

  // 2. v1.5 升级：意图识别 + tutor 预热 并行
  //    tutor 是最常见的 intent（concept），预先开 LLM 调用
  //    v2.0 升级：tutor 预热走流式 → 首 token 延迟 < 2s
  //    P0-3: profile 已含 recent_memories，tutor 预热 prompt 自动注入记忆上下文
  const routerStepIdx = traceStore.addStep('router', '识别意图（+ tutor 预热）…')

  // 包装 onToken 到 tutor 预热（不影响 intent 识别，intent 是 JSON 一次性返回更稳）
  const tutorPreCallback = onToken
    ? (chunk) => {
        // tutor 预热的流式：拼一个 partial 字段让 UI 显示「正在输入」
        try { onToken({ ...chunk, phase: 'prewarm_tutor' }) } catch (_) { /* noop */ }
      }
    : null

  const intentPromise = recognizeIntentWithTool(userInput).catch((e) => {
    console.warn('[router] intent recognition failed:', e.message)
    return { __error: e, intent: 'concept', tool: null, tool_args: null, degraded: 'intent_call_failed' }
  })

  const tutorPromise = tutorAgent(userInput, profile, { onToken: tutorPreCallback, signal, history }).catch((e) => {
    console.warn('[router] tutor prewarm failed:', e.message)
    return { __error: e, __value: null }
  })

  const [intentSettled, tutorSettled] = await Promise.all([intentPromise, tutorPromise])

  const intentError = intentSettled && intentSettled.__error ? intentSettled.__error : null
  const tutorError = tutorSettled && tutorSettled.__error ? tutorSettled.__error : null
  const intentResult = intentError
    ? { intent: 'concept', tool: null, tool_args: null, degraded: 'intent_call_failed' }
    : intentSettled
  const intent = intentResult.intent
  const tutorPrewarmResult = tutorSettled && tutorSettled.__value !== undefined ? tutorSettled.__value : tutorSettled

  // 双失败兜底：串行再调一次 tutor
  let intentForNext = intent
  if (intentError && tutorError) {
    console.warn('[router] both intent and tutor failed, falling back to serial tutor call')
    try {
      const fallbackResult = await tutorAgent(userInput, profile, { onToken, signal, history })
      const updateStepIdx = traceStore.addStep('profile_update', '更新学生画像…')
      try {
        updateProfileAfterResponse('concept', fallbackResult, profile)
        traceStore.updateStep(updateStepIdx, 'done', { detail: '画像已同步（兜底）' })
      } catch (e) {
        traceStore.updateStep(updateStepIdx, 'error', { error: e.message })
      }
      traceStore.updateStep(routerStepIdx, 'done', { detail: '概念引导（双失败兜底）' })
      traceStore.endSession()
      return { intent: 'concept', ...fallbackResult }
    } catch (e) {
      traceStore.updateStep(routerStepIdx, 'error', { error: 'router_fallback_failed: ' + e.message })
      traceStore.endSession()
      return {
        intent: 'concept',
        content: 'AI 服务暂不可用，请稍后再试。错误信息：' + e.message,
        agent: 'concept',
        error: true
      }
    }
  }

  // 单边失败处理
  if (intentError) {
    console.warn('[router] intent failed, using concept default (tutor prewarm will be used if available)')
    intentForNext = 'concept'
  }

  traceStore.updateStep(routerStepIdx, 'done', {
    detail: INTENT_LABELS[intentForNext] || intentForNext
  })

  // P0-2 D3: 工具调用（INTENT_PROMPT 返回 tool 时执行，带 trace）
  //   三种兜底已在 recognizeIntentWithTool 内完成（parseIntentResult），
  //   到这里的 tool 一定合法且 tool_args 完整；失败/超时由 callTool 内置降级
  if (intentResult.tool) {
    const toolStepIdx = traceStore.addStep('tool_call', `调用工具：${intentResult.tool}…`)
    try {
      const toolArgs = intentResult.tool_args || {}
      const argsSummary = JSON.stringify(toolArgs)
      const toolRes = await callTool(intentResult.tool, toolArgs, {})
      if (toolRes.ok) {
        traceStore.updateStep(toolStepIdx, 'done', {
          detail: `工具：${intentResult.tool} | 参数：${argsSummary} | ${summarizeToolResult(intentResult.tool, toolRes.data)}（${toolRes.elapsedMs}ms）`
        })
        // 工具结果挂到 profile，供下游 Agent 可选消费（向前兼容，不强制）
        profile.tool_result = { tool: intentResult.tool, data: toolRes.data }
      } else {
        traceStore.updateStep(toolStepIdx, 'error', {
          error: `工具：${intentResult.tool} | 参数：${argsSummary} | 失败：${toolRes.error}`
        })
      }
    } catch (e) {
      console.warn('[router] tool_call failed:', e.message)
      traceStore.updateStep(toolStepIdx, 'error', { error: e.message })
    }
  }

  // 3. 路由到对应 Agent（带 trace）
  //    关键优化：如果 intent=concept 且 tutor 预热成功 → 直接用预热结果
  //    v2.0 升级：传 onToken 给最终 Agent
  let result
  const agentStepIdx = traceStore.addStep(intentForNext, getAgentStartDetail(intentForNext))

  if (intentForNext === 'concept' && tutorPrewarmResult && !tutorError) {
    // 命中概念引导 + 预热成功 → 零额外延迟
    result = tutorPrewarmResult
  } else {
    // 命中其他 intent（或预热失败但 intent 识别成功）→ 调对应 Agent
    try {
      switch (intentForNext) {
        case 'concept':
          result = await tutorAgent(userInput, profile, { onToken, signal, history })
          break
        case 'diagnose':
          result = await diagnoseAgent(userInput, profile, { onToken, signal })
          break
        case 'plan':
          result = await plannerAgent(userInput, profile, { onToken, signal })
          break
        case 'admission':
          result = await admissionAgent(userInput, profile, { onToken, signal })
          break
        case 'research':
          result = await researchAgent(userInput, profile, { onToken, signal })
          break
        case 'cascade':
          result = await cascadeDiagnoseToPlan(userInput, profile, { onToken, signal })
          break
        default:
          result = await tutorAgent(userInput, profile, { onToken, signal, history })
      }
      traceStore.updateStep(agentStepIdx, 'done', {
        detail: getAgentDoneDetail(intentForNext, result)
      })
    } catch (e) {
      console.error('[router] agent execution failed:', e)
      traceStore.updateStep(agentStepIdx, 'error', { error: e.message })
      result = {
        intent: intentForNext,
        content: 'AI 服务暂不可用，请稍后再试。错误信息：' + e.message,
        agent: intentForNext,
        error: true
      }
    }
  }

  // 3.5 如果是 concept 但用了预热结果且没有 trace detail，补一个
  if (intentForNext === 'concept' && tutorPrewarmResult && !tutorError) {
    try {
      traceStore.updateStep(agentStepIdx, 'done', {
        detail: getAgentDoneDetail(intentForNext, result)
      })
    } catch (_) { /* trace best-effort */ }
  }

  // 4. 画像更新（带 trace）
  const updateStepIdx = traceStore.addStep('profile_update', '更新学生画像…')
  try {
    updateProfileAfterResponse(intentForNext, result, profile)
    traceStore.updateStep(updateStepIdx, 'done', {
      detail: getUpdateDetail(intentForNext, result, profile)
    })
  } catch (e) {
    console.warn('[router] profile update failed:', e.message)
    traceStore.updateStep(updateStepIdx, 'error', { error: e.message })
  }

  traceStore.endSession()
  return { intent: intentForNext, ...result }
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

/**
 * 工具调用结果摘要（P0-2 D3：tool_call trace detail 用）
 */
function summarizeToolResult(toolName, data) {
  if (!data) return '无返回'
  switch (toolName) {
    case 'query_university':
      return `返回 ${data.count ?? 0} 所院校`
    case 'recommend_papers':
      return `返回 ${data.count ?? 0} 篇论文`
    case 'generate_plan':
      return `生成 ${data.total_weeks ?? 0} 周计划`
    case 'store_progress':
      return data.stored ? `已存储（共 ${data.total ?? 0} 条）` : '存储失败'
    case 'search_knowledge':
      return `命中 ${data.count ?? 0} 条切片`
    default:
      return `返回 ${JSON.stringify(data).slice(0, 80)}`
  }
}


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
