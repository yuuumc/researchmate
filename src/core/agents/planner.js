// ============================================================
// 成长规划 Agent（对应原工作流 N6）
// ============================================================
// v1 基础版：周计划 + 每日安排 + 补强任务
// v2 升级：紧急度分档 + 动态调整 3 类（保留 / 强化 / 放弃）
// ============================================================

import { AI_PROVIDER } from '@/api/custom'
import { profileToContext } from '../profileLoader'
import { PLANNER_PROMPT } from '@/prompts/index'
import { safeParseJSON } from '@/utils/validator'

export async function plannerAgent(userInput, profile) {
  const prompt = `${PLANNER_PROMPT}

# 学生画像
${profileToContext(profile)}
`

  const raw = await AI_PROVIDER.call(prompt, userInput, {
    temperature: 0.6,
    max_tokens: 2500
  })

  const structured = extractPlanStructure(raw)

  return {
    intent: 'plan',
    agent: 'planner',
    content: raw,
    structured
  }
}

function extractPlanStructure(raw) {
  const jsonMatch = raw.match(/```json\s*([\s\S]+?)```/) || raw.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    const parsed = safeParseJSON(jsonMatch[1] || jsonMatch[0], null)
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
  }
  return { weeks: [], target_stage: '', adjustments: { keep: [], strengthen: [], drop: [] } }
}
