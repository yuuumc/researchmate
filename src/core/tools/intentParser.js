// ============================================================
// P0-2 D3: INTENT_PROMPT 解析兜底（零外部依赖，Node 可直接 import）
// ============================================================
// 三种异常统一退化为纯意图识别（只取 intent，不调工具）：
//   1. JSON parse 失败
//   2. tool 字段缺失 / 非字符串 / 未注册
//   3. tool_args 不完整（缺失 / 非普通对象）
// 退化后 Agent 正常走流式回答，不抛错不卡死。
// ============================================================

function _safeParseJSON(raw, fallback) {
  if (!raw || typeof raw !== 'string') return fallback
  try { return JSON.parse(raw) } catch { /* continue */ }
  // 尝试从 markdown ```json 块或裸 {} 抽取
  const m = raw.match(/```json\s*([\s\S]+?)```/) || raw.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[1] || m[0]) } catch { /* continue */ }
  }
  return fallback
}

/**
 * 解析 INTENT_PROMPT 返回的 {intent, tool, tool_args}
 * @param {string} raw - LLM 原始返回
 * @param {object} options
 * @param {string[]} options.validIntents - 合法意图列表
 * @param {Set|object} options.validTools - 合法工具集合（Set 或 getToolSchemas() 返回的对象）
 * @param {string} options.fallbackIntent - 兜底意图，默认 'concept'
 * @returns {{intent:string, tool:string|null, tool_args:object|null, degraded:string|null}}
 *   degraded 取值：null（正常）/ 'json_parse_failed' / 'tool_missing' / 'tool_not_registered' / 'tool_args_incomplete'
 */
export function parseIntentResult(raw, options = {}) {
  const {
    validIntents = [],
    validTools = new Set(),
    fallbackIntent = 'concept'
  } = options

  const toolSet = validTools instanceof Set
    ? validTools
    : new Set(Object.keys(validTools || {}))

  // 兜底 1: JSON parse 失败
  const parsed = _safeParseJSON(raw, null)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { intent: fallbackIntent, tool: null, tool_args: null, degraded: 'json_parse_failed' }
  }

  // intent 校验（不合法 → fallback，但不阻断 tool 判定）
  const intent = (typeof parsed.intent === 'string' && validIntents.includes(parsed.intent))
    ? parsed.intent
    : fallbackIntent

  // 兜底 2: tool 字段缺失 / 非字符串 / 未注册
  const toolName = parsed.tool
  if (!toolName || typeof toolName !== 'string' || !toolName.trim()) {
    return { intent, tool: null, tool_args: null, degraded: 'tool_missing' }
  }
  if (!toolSet.has(toolName.trim())) {
    return { intent, tool: null, tool_args: null, degraded: 'tool_not_registered' }
  }

  // 兜底 3: tool_args 不完整（缺失 / 非普通对象）
  const toolArgs = parsed.tool_args
  if (!toolArgs || typeof toolArgs !== 'object' || Array.isArray(toolArgs)) {
    return { intent, tool: null, tool_args: null, degraded: 'tool_args_incomplete' }
  }

  // 全部通过 → 正常返回，可调工具
  return { intent, tool: toolName.trim(), tool_args: toolArgs, degraded: null }
}

export default { parseIntentResult }
