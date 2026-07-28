// ============================================================
// 科研成长 Agent（v1 正式版 §三：第五个 Agent）
// ============================================================
// 职责：把考研准备与未来科研成长连接起来
// 输出：本科路径 + 研究生路径 + 论文 + 项目 + 技术栈
// 对应 v1正式版.txt：「研芯通 ≠ 考研工具，而是工科人才成长智能体」
// ============================================================

import { AI_PROVIDER } from '@/api/custom'
import { profileToContext } from '../profileLoader'
import { RESEARCH_PROMPT } from '@/prompts/index'
import { safeParseJSON } from '@/utils/validator'

/**
 * 科研成长 Agent
 * @param {string} userInput
 * @param {object} profile
 * @returns {Promise<{intent:string, agent:string, content:string, structured:object}>}
 */
export async function researchAgent(userInput, profile) {
  const prompt = `${RESEARCH_PROMPT}

# 学生画像
${profileToContext(profile)}
`

  const raw = await AI_PROVIDER.call(prompt, userInput, {
    temperature: 0.6, // 科研路径需要一定创造力
    max_tokens: 2500
  })

  const structured = extractResearchStructure(raw)

  return {
    intent: 'research',
    agent: 'research',
    content: raw,
    structured
  }
}

/**
 * 从 LLM 输出中抽取结构化字段
 */
function extractResearchStructure(raw) {
  const jsonMatch = raw.match(/```json\s*([\s\S]+?)```/) || raw.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    const parsed = safeParseJSON(jsonMatch[1] || jsonMatch[0], null)
    if (parsed) {
      return {
        direction: parsed.direction || '',
        undergrad_path: Array.isArray(parsed.undergrad_path) ? parsed.undergrad_path : [],
        research_path: Array.isArray(parsed.research_path) ? parsed.research_path : [],
        papers: Array.isArray(parsed.papers) ? parsed.papers : [],
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        tech_stack: Array.isArray(parsed.tech_stack) ? parsed.tech_stack : []
      }
    }
  }
  return {
    direction: '',
    undergrad_path: [],
    research_path: [],
    papers: [],
    projects: [],
    tech_stack: []
  }
}
