// ============================================================
// 学习诊断 Agent（对应原工作流 N5，4 层根因链）
// ============================================================
// v1 基础版：表面 / 直接 / 根因 / 补强
// v2 升级：4 层根因链结构化（表面 / 直接 / 中间 / 根本）
// ============================================================

import { AI_PROVIDER } from '@/api/custom'
import { profileToContext } from '../profileLoader'
import { DIAGNOSE_PROMPT } from '@/prompts/index'
import { safeParseJSON } from '@/utils/validator'

export async function diagnoseAgent(userInput, profile) {
  const prompt = `${DIAGNOSE_PROMPT}

# 学生画像
${profileToContext(profile)}
`

  // 用 reasoner 模型做根因推理（v3 §v3.4 Week 2 P0）
  const raw = await AI_PROVIDER.callReasoner(prompt, userInput, {
    temperature: 0.3,
    max_tokens: 2500
  })

  // 尝试解析结构化字段
  const structured = extractDiagnosisStructure(raw, userInput)

  return {
    intent: 'diagnose',
    agent: 'diagnose',
    content: raw,
    structured
  }
}

/**
 * 从 LLM 输出中抽取结构化字段
 * LLM 应该返回 JSON 块（v2 升级为强制 JSON-only）
 */
function extractDiagnosisStructure(raw, userInput) {
  // 尝试找 JSON 块
  const jsonMatch = raw.match(/```json\s*([\s\S]+?)```/) || raw.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    const parsed = safeParseJSON(jsonMatch[1] || jsonMatch[0], null)
    if (parsed) {
      return {
        score: typeof parsed.score === 'number' ? parsed.score : extractScoreFromInput(userInput),
        subject: parsed.subject || '',
        weak_points: Array.isArray(parsed.weak_points) ? parsed.weak_points : [],
        direct_causes: Array.isArray(parsed.direct_causes) ? parsed.direct_causes : [],
        middle_causes: Array.isArray(parsed.middle_causes) ? parsed.middle_causes : [],
        root_causes: Array.isArray(parsed.root_causes) ? parsed.root_causes : [],
        remediation: parsed.remediation || ''
      }
    }
  }
  // 兜底：从输入抽取分数
  return {
    score: extractScoreFromInput(userInput),
    subject: '',
    weak_points: [],
    root_causes: [],
    remediation: ''
  }
}

function extractScoreFromInput(input) {
  if (!input) return null
  // 匹配"考了 55 分" / "55 分" / "score 55"
  const m = input.match(/(\d{1,3})\s*分/)
  if (m) {
    const score = parseInt(m[1], 10)
    if (score >= 0 && score <= 150) return score
  }
  return null
}
