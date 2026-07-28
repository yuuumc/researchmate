// ============================================================
// JSON 校验（用于 LLM 返回 JSON 的兜底解析）
// ============================================================

/**
 * 安全解析 JSON，失败返回 fallback
 * @param {string} raw - LLM 返回的字符串
 * @param {*} fallback - 解析失败时的兜底值
 * @returns {*}
 */
export function safeParseJSON(raw, fallback = null) {
  if (!raw || typeof raw !== 'string') return fallback
  try {
    // LLM 偶尔会在 JSON 外面加 ```json ... ``` 包裹
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
    return JSON.parse(cleaned)
  } catch (e) {
    console.warn('[validator] JSON parse failed:', e.message, 'raw:', raw.slice(0, 200))
    return fallback
  }
}

/**
 * 校验学生画像结构
 * @param {*} profile
 * @returns {boolean}
 */
export function isValidProfile(profile) {
  if (!profile || typeof profile !== 'object') return false
  if (typeof profile.user_id !== 'string') return false
  if (!Array.isArray(profile.weak_topics)) return false
  if (!Array.isArray(profile.mastered_topics)) return false
  return true
}

/**
 * 校验诊断报告结构
 */
export function isValidDiagnosis(report) {
  if (!report || typeof report !== 'object') return false
  if (typeof report.score !== 'number') return false
  if (!Array.isArray(report.weak_points)) return false
  return true
}

/**
 * 校验院校推荐结构（防止 LLM 编造数字）
 */
export function isValidAdmission(result) {
  if (!result || !Array.isArray(result.recommendations)) return false
  return result.recommendations.every((rec) => {
    if (!rec.school || typeof rec.school !== 'string') return false
    // 数字字段必须存在（来自 university/*.json，不是 LLM 生成）
    if (rec.score_line !== undefined && typeof rec.score_line !== 'number') return false
    if (rec.ratio !== undefined && typeof rec.ratio !== 'number') return false
    return true
  })
}
