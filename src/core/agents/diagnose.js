// ============================================================
// 学习诊断 Agent（对应原工作流 N5，4 层根因链）
// ============================================================
// v1 基础版：表面 / 直接 / 根因 / 补强
// v2 升级：4 层根因链结构化（表面 / 直接 / 中间 / 根本）
//
// v1.5 升级：继承 BaseAgent，trace 自动埋点；用 reasoner 模型做根因推理
// ============================================================

import { profileToContext } from '../profileLoader'
import { DIAGNOSE_PROMPT } from '@/prompts/index'
import { traceAgent, runLLM, parseStructured } from './BaseAgent'

const FALLBACK_STRUCTURE = {
  score: null,
  subject: '',
  weak_points: [],
  direct_causes: [],
  middle_causes: [],
  root_causes: [],
  remediation: ''
}

export const diagnoseAgent = traceAgent('diagnose', async function diagnoseCore(userInput, profile) {
  const prompt = `${DIAGNOSE_PROMPT}

# 学生画像
${profileToContext(profile)}
`

  // reasoner 模型做根因推理（v3 §v3.4 Week 2 P0）
  const { content: raw } = await runLLM(
    'diagnose',
    prompt,
    userInput,
    { temperature: 0.3, max_tokens: 2500 },
    true // useReasoner
  )

  // 尝试解析结构化字段
  const structured = extractDiagnosisStructure(raw, userInput)

  return {
    intent: 'diagnose',
    agent: 'diagnose',
    content: raw,
    structured
  }
})

/**
 * 从 LLM 输出中抽取结构化字段
 * LLM 应该返回 JSON 块（v2 升级为强制 JSON-only）
 */
function extractDiagnosisStructure(raw, userInput) {
  const parsed = parseStructured(raw, null)
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
  // 兜底：从输入抽取分数
  return {
    ...FALLBACK_STRUCTURE,
    score: extractScoreFromInput(userInput)
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
