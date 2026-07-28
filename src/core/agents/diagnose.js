// ============================================================
// 学习诊断 Agent（v2.0 SSE 版）
// ============================================================
// v1：4 层根因链（表面 / 直接 / 中间 / 根本）
// v1.5：继承 BaseAgent，trace 自动埋点；用 reasoner 模型
// v2.0：支持流式 + 取消
// ============================================================

import { profileToContext } from '../profileLoader'
import { DIAGNOSE_PROMPT } from '@/prompts/index'
import { traceAgent, runLLM, callLLM, parseStructured } from './BaseAgent'

const FALLBACK_STRUCTURE = {
  score: null,
  subject: '',
  weak_points: [],
  direct_causes: [],
  middle_causes: [],
  root_causes: [],
  remediation: ''
}

export const diagnoseAgent = traceAgent('diagnose', async function diagnoseCore(userInput, profile, ctx = {}) {
  const onToken = ctx?.onToken || null
  const signal = ctx?.signal || null

  const prompt = `${DIAGNOSE_PROMPT}

# 学生画像
${profileToContext(profile)}
`

  // reasoner 模型做根因推理（v2.0：接 ctx.onToken → 流式）
  const result = await callLLM(
    'diagnose',
    prompt,
    userInput,
    { temperature: 0.3, max_tokens: 2500 },
    true, // useReasoner
    onToken,
    signal
  )
  const raw = result.content

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
  return {
    ...FALLBACK_STRUCTURE,
    score: extractScoreFromInput(userInput)
  }
}

function extractScoreFromInput(input) {
  if (!input) return null
  const m = input.match(/(\d{1,3})\s*分/)
  if (m) {
    const score = parseInt(m[1], 10)
    if (score >= 0 && score <= 150) return score
  }
  return null
}
