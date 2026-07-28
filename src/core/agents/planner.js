// ============================================================
// 成长规划 Agent（v2.0 SSE 版）
// ============================================================
// v1：周计划 + 每日安排 + 补强任务
// v2 升级：紧急度分档 + 动态调整 3 类（保留 / 强化 / 放弃）
// v1.5：继承 BaseAgent，trace 自动埋点
// v2.0：支持流式 + 取消
// ============================================================

import { profileToContext } from '../profileLoader'
import { PLANNER_PROMPT } from '@/prompts/index'
import { traceAgent, runLLM, callLLM, parseStructured } from './BaseAgent'

const FALLBACK_STRUCTURE = {
  weeks: [],
  target_stage: '',
  adjustments: { keep: [], strengthen: [], drop: [] }
}

export const plannerAgent = traceAgent('planner', async function plannerCore(userInput, profile, ctx = {}) {
  const onToken = ctx?.onToken || null
  const signal = ctx?.signal || null

  const prompt = `${PLANNER_PROMPT}

# 学生画像
${profileToContext(profile)}
`

  // v2.0：接 ctx.onToken → 流式
  const { content: raw } = await callLLM('planner', prompt, userInput, {
    temperature: 0.6,
    max_tokens: 2500
  }, false, onToken, signal)

  const structured = extractPlanStructure(raw)

  return {
    intent: 'plan',
    agent: 'planner',
    content: raw,
    structured
  }
})

function extractPlanStructure(raw) {
  const parsed = parseStructured(raw, null)
  if (parsed) {
    return {
      weeks: Array.isArray(parsed.weeks) ? parsed.weeks : [],
      target_stage: parsed.target_stage || '',
      adjustments: {
        keep: parsed.adjustments?.keep || [],
        strengthen: parsed.adjustments?.strengthen || [],
        drop: parsed.adjustments?.drop || []
      }
    }
  }
  return { ...FALLBACK_STRUCTURE }
}
