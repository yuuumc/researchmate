// ============================================================
// 考研导航 Agent（v2.0 SSE 版）
// ============================================================
// 硬约束（v1 §6.5 / v3.4）：
//   1. 数字字段（分数线 / 报录比 / 录取概率 / 招生人数 / 年份）禁止由 LLM 生成
//   2. LLM 只做：① 匹配（哪 3 档各推哪 2 所） ② 推荐理由
//   3. 所有数字字段只从 src/data/university/*.json 渲染
//   4. 数据来源 URL 由 source_url 字段渲染，不让 LLM 拼 URL
//   5. v3.4：清洗 LLM 在 reason 中可能编造的数字字段
//
// v1.5：继承 BaseAgent，trace 自动埋点
// v2.0：支持流式 + 取消
// ============================================================

import { profileToContext } from '../profileLoader'
import { ADMISSION_PROMPT } from '@/prompts/index'
import { traceAgent, runLLM, callLLM, parseStructured } from './BaseAgent'

// 院校数据库（启动时由 main.js / subjectLoader 注入）
let universityData = []

export function setUniversityData(data) {
  universityData = Array.isArray(data) ? data : []
}

export const admissionAgent = traceAgent('admission', async function admissionCore(userInput, profile, ctx = {}) {
  const onToken = ctx?.onToken || null
  const signal = ctx?.signal || null

  // 1. 把候选院校列表（无数字字段，只有校名/地区/层次）作为上下文给 LLM
  const candidates = universityData.map((u) => ({
    school: u.school,
    region: u.region,
    level: u.level, // 985 / 211 / 双非
    major: u.major
  }))

  const prompt = `${ADMISSION_PROMPT}

# 学生画像
${profileToContext(profile)}

# 院校候选库（数字字段由前端模板渲染，不在此处给出）
${JSON.stringify(candidates, null, 2)}
`

  // 2. LLM 只做匹配 + 推荐理由（v2.0：接 ctx.onToken → 流式）
  const { content: raw } = await callLLM('admission', prompt, userInput, {
    temperature: 0.4,
    max_tokens: 2000
  }, false, onToken, signal)

  // 3. 解析 LLM 推荐的院校名
  const matched = extractMatchedSchools(raw)

  // 4. 从本地数据回填真实数字字段
  const recommendations = matched
    .map((m) => {
      const u = universityData.find((x) => x.school === m.school)
      if (!u) return null
      return {
        ...m,
        reason: sanitizeReason(m.reason || ''),
        school: u.school,
        level: u.level,
        region: u.region,
        major: u.major,
        score_line: u.score_line,
        ratio: u.ratio,
        enrollment: u.enrollment,
        year: u.year,
        source_url: u.source_url
      }
    })
    .filter(Boolean)

  return {
    intent: 'admission',
    agent: 'admission',
    content: raw,
    structured: {
      recommendations,
      target_school: recommendations[0]?.school || null,
      target_major: recommendations[0]?.major || null
    }
  }
})

function extractMatchedSchools(raw) {
  const parsed = parseStructured(raw, null)
  if (parsed && Array.isArray(parsed.recommendations)) {
    return parsed.recommendations.map((r) => ({
      school: r.school,
      tier: r.tier, // 冲刺 / 稳妥 / 保底
      reason: r.reason || ''
    }))
  }
  return []
}

/**
 * 清洗推荐理由中可能编造的数字字段
 */
function sanitizeReason(reason) {
  return reason
    .replace(/\d{2,3}\s*分/g, '[分数线]')
    .replace(/录取率?\s*\d+(\.\d+)?%?/g, '[录取率]')
    .replace(/报录比\s*\d+(\.\d+)?/g, '[报录比]')
    .replace(/招生\s*\d+\s*人/g, '[招生人数]')
    .replace(/20\d{2}\s*年/g, '[年份]')
}
