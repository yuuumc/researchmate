// ============================================================
// stripStructuredJson — 从 LLM 原文里剥离结构化 JSON 代码块
// ============================================================
// 用途：agent 返回的 content 含「第一部分：叙述」+ 「第二部分：```json {...} ```」，
// 前端已用 msg.structured 渲染了可视化卡片，原文里的 JSON 代码块不应再展示给用户。
//
// 规则（保守，宁可不删也不误删用户想看的代码）：
//   1. 删除完整的 ```json ... ``` 代码块，连同其上方一行引导标题
//      （如「第二部分：结构化路线图」「## 结构化输出」等）
//   2. 流式未闭合：从 ```json 起到末尾一并删除（仅当 stream=true）
//   3. 仅在「能解析出结构化 schema」或调用方确认有 structured 时才删，
//      避免误删 tutor 正常回答里的代码示例
// ============================================================

// 已知结构化 schema 的特征键（命中 ≥2 个才判定为结构化 JSON）
const SCHEMA_KEYS = new Set([
  'roadmap', 'undergrad_path', 'research_path', 'papers', 'projects',
  'tech_stack', 'labs', 'summary', 'direction',
  'week_plan', 'weekly_plan', 'tasks', 'milestones',
  'weak_points', 'root_causes', 'direct_causes', 'middle_causes',
  'remediation_path', 'ability_stars', 'score', 'overall_level',
  'recommendations', 'matches', 'complementary_skills',
  'diagnosis_reason', 'plan_version',
  'career_paths', 'path_id', 'path_name', 'priority', 'match_score',
  'target_roles', 'skill_gaps', 'market_demand', 'school_profile_ref',
  'recommendation_reason', 'growth'
])

function looksStructured(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  let hits = 0
  for (const k of Object.keys(obj)) if (SCHEMA_KEYS.has(k)) hits++
  return hits >= 2
}

function safeParse(str) {
  try { return JSON.parse(str) } catch { return null }
}

/**
 * 从 content 中剥离结构化 JSON 代码块
 * @param {string} content - LLM 原文
 * @param {{ hasStructured?: boolean, streaming?: boolean }} opts
 *   - hasStructured: 调用方已知 msg.structured 存在（卡片会渲染），放心删
 *   - streaming: 流式中，处理未闭合的 ```json fence
 * @returns {string} 清理后的内容
 */
export function stripStructuredJson(content, opts = {}) {
  if (!content || typeof content !== 'string') return ''
  const { hasStructured = false, streaming = false } = opts
  let out = content

  // 1. 完整的 ```json ... ``` 块
  out = out.replace(/```json\s*([\s\S]*?)```/g, (full, body) => {
    if (hasStructured) return '' // 卡片会渲染，直接删
    const parsed = safeParse(body.trim())
    return parsed && looksStructured(parsed) ? '' : full
  })

  // 2. 引导标题行 + 紧跟的已被删除的 json 块位置 → 清掉孤立标题
  //    匹配「第X部分：…结构化…」「## 结构化…」等，其后无实质内容时删除
  out = out.replace(
    /[ \t]*#{0,4}\s*[^\n]{0,40}(第[一二三四五六七八九十]+部分|结构化路线图|结构化报告|结构化输出|结构化数据|Structured Output|Structured Data)[^\n]*\n{2,}/g,
    '\n'
  )

  // 3. 流式未闭合：从 ```json 起到末尾
  if (streaming) {
    out = out.replace(/```json[\s\S]*$/g, '')
  }

  // 4. 清理多余空行（3+ 连续换行压成 2 个）
  out = out.replace(/\n{3,}/g, '\n\n').trim()

  return out
}

export default stripStructuredJson
