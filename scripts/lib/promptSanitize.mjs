// ============================================================
// Prompt 输入清洗 + 危险片段检测（v1.5 评审保命 P1）
// ============================================================
// 复用 admission.js sanitizeReason 思路：把"可能编造 / 注入"的内容
// 在拼 prompt 前清掉，对 LLM 输出"展示前"清掉。
// 这里聚焦两类：
//   1) 危险代码片段（防止学生输入触发 prompt 注入或在渲染端执行）
//   2) 数字字段越界（admission 任务的硬约束）
// ============================================================

/**
 * 危险片段模式：用户输入一旦在拼 prompt 前出现，视为可注入攻击
 * 静态校验模式（无 LLM 调用）下，prompt 被渲染出来后必须满足：
 *   - 渲染出的 prompt 字符串中不含任何 DANGER_PATTERN 命中
 */
export const DANGER_PATTERNS = [
  // JS 代码执行类
  { id: 'eval_call', re: /\beval\s*\(/, label: 'eval() 调用' },
  { id: 'function_ctor', re: /\bnew\s+Function\s*\(/, label: 'new Function() 构造器' },
  { id: 'function_ctor_legacy', re: /\bFunction\s*\(\s*['"`]/, label: 'Function() 字符串构造' },
  // HTML/JS 注入类
  { id: 'script_tag', re: /<\s*script\b/i, label: '<script> 标签' },
  { id: 'iframe_tag', re: /<\s*iframe\b/i, label: '<iframe> 标签' },
  { id: 'object_tag', re: /<\s*object\b/i, label: '<object> 标签' },
  { id: 'embed_tag', re: /<\s*embed\b/i, label: '<embed> 标签' },
  { id: 'svg_onload', re: /<\s*svg[^>]*onload\b/i, label: 'SVG onload 注入' },
  { id: 'js_uri', re: /javascript\s*:/i, label: 'javascript: 协议' },
  { id: 'vbs_uri', re: /vbscript\s*:/i, label: 'vbscript: 协议' },
  { id: 'data_uri_script', re: /data\s*:\s*text\/html/i, label: 'data:text/html 协议' },
  { id: 'on_event', re: /\son(?:error|load|click|mouseover|focus)\s*=/i, label: 'on* 事件处理器' },
  // 表达式注入类
  { id: 'tmpl_inject', re: /\{\{[\s\S]*?(constructor|__proto__|prototype)/i, label: '模板引擎 prototype 注入' },
  { id: 'os_cmd', re: /\$\([^)]+\)|`[^`]*\$\(/, label: 'shell 命令替换 $(...) / `...$(...)`' }
]

/**
 * 数字字段越界模式（admission 硬约束：不得在 reason / userInput 中出现数字字段）
 */
export const NUMBER_FIELD_PATTERNS = [
  { id: 'score_line', re: /\b\d{2,3}\s*分(?!\w)/, label: '疑似分数线' },
  { id: 'ratio', re: /\b\d+(?:\.\d+)?\s*[:：]\s*1\b/, label: '疑似报录比' },
  { id: 'enrollment', re: /招\s*(?:生\s*)?\d+\s*人/, label: '疑似招生人数' },
  { id: 'year', re: /\b20\d{2}\s*年\b/, label: '疑似年份' }
]

/**
 * 把用户输入"清洗"成 prompt 安全的文本：
 *   - 转义反引号（防止闭合 prompt 代码围栏）
 *   - 剥离明显恶意片段（替换为等长空格，保留长度供定位）
 * 仅在拼 prompt 时调用；student-facing 显示仍保留原文。
 *
 * @param {string} input
 * @returns {string}
 */
export function sanitizeForPrompt(input) {
  if (typeof input !== 'string') return ''
  let s = input
  // 1) 闭合反引号 → 替换为单引号（防 prompt 围栏逃逸）
  s = s.replace(/`/g, "'")
  // 2) HTML 标签转义（防 markdown/html 渲染时执行）
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // 3) 已知危险函数调用直接删除
  s = s.replace(/\beval\s*\([^)]*\)/g, '')
  s = s.replace(/\bnew\s+Function\s*\([^)]*\)/g, '')
  return s
}

/**
 * 静态校验一段已渲染的 prompt：
 *   - 不得命中任何 DANGER_PATTERN
 *   - 若传 expectedFields，必须在 prompt 文本中能找到（camelCase / snake_case 都允许）
 *
 * @param {string} renderedPrompt
 * @param {string[]} expectedFields
 * @returns {{dangerHits: Array, fieldHits: Array, ok: boolean}}
 */
export function staticValidate(renderedPrompt, expectedFields = []) {
  const dangerHits = []
  for (const p of DANGER_PATTERNS) {
    if (p.re.test(renderedPrompt)) {
      const m = renderedPrompt.match(p.re)
      dangerHits.push({ id: p.id, label: p.label, sample: (m && m[0]) || '' })
    }
  }
  const fieldHits = []
  const missing = []
  for (const f of expectedFields) {
    // 同时匹配 snake_case 与 camelCase（如 weak_points 与 weakPoints）
    const variants = [f, f.replace(/_([a-z])/g, (_, c) => c.toUpperCase())]
    const found = variants.some((v) => renderedPrompt.includes(v))
    fieldHits.push({ field: f, found })
    if (!found) missing.push(f)
  }
  return {
    dangerHits,
    fieldHits,
    missingFields: missing,
    ok: dangerHits.length === 0 && missing.length === 0
  }
}

/**
 * 检测 prompt 是否声明了"输出 JSON"格式（含围栏 / 关键词）
 * @param {string} renderedPrompt
 * @returns {boolean}
 */
export function declaresJsonOutput(renderedPrompt) {
  if (!renderedPrompt) return false
  return /```json|输出格式[\s\S]{0,40}JSON|JSON\s*块|JSON 围栏|`{0,1}json`{0,1}\s*格式/.test(renderedPrompt)
}

/**
 * 提取 prompt 实际请求 LLM 输出的"必填字段名"列表
 * 规则：在 ```json ... ``` 代码块内，紧跟 `{` 后到第一个 `}` 之间的所有
 *       snake_case / camelCase 标识符（启发式）。
 *
 * @param {string} promptMarkdown - prompt 的原始 .md 文本
 * @returns {string[]}
 */
export function extractRequiredFieldsFromPrompt(promptMarkdown) {
  if (!promptMarkdown) return []
  // 抓所有 ```json ... ``` 块
  const blocks = [...promptMarkdown.matchAll(/```json\s*([\s\S]+?)```/g)].map((m) => m[1])
  if (blocks.length === 0) return []
  const fields = new Set()
  // 抓 key 名
  const fieldRe = /"([a-z][a-z0-9_]*[a-z0-9])"\s*:/g
  // 抓裸标识符（无引号）
  const bareRe = /\b([a-z][a-z0-9_]*[a-z0-9])\b\s*:/g
  for (const blk of blocks) {
    let m
    while ((m = fieldRe.exec(blk)) !== null) fields.add(m[1])
    while ((m = bareRe.exec(blk)) !== null) {
      const w = m[1]
      if (!['true', 'false', 'null'].includes(w)) fields.add(w)
    }
  }
  return [...fields]
}
