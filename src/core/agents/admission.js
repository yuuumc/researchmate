// ============================================================
// 考研导航 Agent（对应原工作流 N7）
// ============================================================
// 硬约束（v1 §6.5 / v3.4 8/9 联调强化）：
//   1. 数字字段（分数线 / 报录比 / 录取概率 / 招生人数 / 年份）禁止由 LLM 生成
//   2. LLM 只做：① 匹配（哪 3 档各推哪 2 所） ② 推荐理由
//   3. 所有数字字段只从 src/data/university/*.json 渲染
//   4. 数据来源 URL 由 source_url 字段渲染，不让 LLM 拼 URL
//   5. v3.4 新增：清洗 LLM 在 reason 中可能编造的数字字段（防泄漏）
//
// v1.5 升级：继承 BaseAgent，trace 自动埋点
// ============================================================

import { profileToContext } from '../profileLoader'
import { ADMISSION_PROMPT } from '@/prompts/index'
import { traceAgent, runLLM, parseStructured } from './BaseAgent'

// 院校数据库（启动时注入）
let universityData = []

export function setUniversityData(data) {
  universityData = Array.isArray(data) ? data : []
}

export const admissionAgent = traceAgent('admission', async function admissionCore(userInput, profile) {
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

  // 2. LLM 只做匹配 + 推荐理由
  const { content: raw } = await runLLM('admission', prompt, userInput, {
    temperature: 0.4,
    max_tokens: 2000
  })

  // 3. 解析 LLM 推荐的院校名
  const matched = extractMatchedSchools(raw)

  // 4. 从本地数据回填真实数字字段（前端模板绑定用）
  //    v3.4 强化：清洗 reason 中可能编造的数字（分数线/概率/招人/年份/报录比）
  const recommendations = matched
    .map((m) => {
      const u = universityData.find((x) => x.school === m.school)
      if (!u) return null
      return {
        ...m,
        reason: sanitizeReason(m.reason || ''),
        // 数字字段强制来自本地数据
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
 * v3.4 新增：清洗推荐理由中可能编造的数字字段
 * 防止 LLM 在 reason 里写出"分数线 350 / 录取概率 60% / 招生 45 人"等
 * 这些数字只能由前端从本地数据回填，不得出现在 LLM 输出中
 */
function sanitizeReason(reason) {
  if (!reason || typeof reason !== 'string') return ''
  return reason
    // 分数线：350 分 / 350分
    .replace(/\b(\d{2,3})\s*分(数线)?/g, '（分数线见本地数据）')
    // 报录比：8.5:1 / 8.5：1
    .replace(/\b\d+(\.\d+)?\s*[:：]\s*1\b/g, '（报录比见本地数据）')
    // 录取概率：60% / 60 %
    .replace(/\b\d{1,3}\s*%/g, '（概率见本地数据）')
    // 招生人数：招 45 人 / 招生 45 人
    .replace(/(招(?:生)?\s*)\d+\s*人/g, '$1（见本地数据）')
    // 年份：2024 年 / 2025年
    .replace(/\b20\d{2}\s*年\b/g, '（年份见本地数据）')
    // 去重空白
    .replace(/\s+/g, ' ')
    .trim()
}
