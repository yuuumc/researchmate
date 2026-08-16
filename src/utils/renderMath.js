// ============================================================
// src/utils/renderMath.js
// B1：LaTeX 公式 ($...$ / $$...$$) 提取 + KaTeX 渲染 + SVG 提取
//
// 设计要点：
//   - 公式在 marked.parse 之前提取为占位符（纯文本 token），
//     经 DOMPurify sanitize 后再回填 KaTeX HTML——避免 KaTeX
//     输出的 inline style / span 被 sanitize 配置剥离。
//   - 非法公式 try/catch 回退为原文（$expr$），不崩溃。
//   - 代码块/行内代码中的 $ 不被误识别为公式定界符。
//   - SVG <svg>...</svg> 同理提取为占位符，由调用方做 DOMPurify
//     SVG profile sanitize 后回填。
// ============================================================
import katex from 'katex'

// ---- 占位符 token（纯文本，不会被 marked / DOMPurify 改动）----
const MATH_PH_PREFIX = '@@KATEX'
const MATH_PH_SUFFIX = '@@'
const SVG_PH_PREFIX = '@@SVGINLINE'
const SVG_PH_SUFFIX = '@@'
const CODE_PH_PREFIX = '\uE001CODE'
const CODE_PH_SUFFIX = '\uE001'

/**
 * 用 KaTeX 渲染单个公式；非法公式回退为原文（不崩溃）。
 * @param {string} expr       - 公式内容（不含 $ 定界符）
 * @param {boolean} displayMode - true=块级 $$...$$，false=行内 $...$
 * @returns {string} KaTeX HTML 或回退原文
 */
export function renderMathExpression (expr, displayMode = false) {
  const trimmed = expr.trim()
  if (!trimmed) return ''
  try {
    return katex.renderToString(trimmed, {
      displayMode,
      throwOnError: true,
      strict: 'ignore',
      output: 'htmlAndMathml'
    })
  } catch (_) {
    // 非法公式：回退为原文（保留定界符让用户看到原始输入）
    return displayMode ? `$$${trimmed}$$` : `$${trimmed}$`
  }
}

/**
 * 从 markdown 文本中提取 $$...$$（块级）与 $...$（行内）公式，
 * 替换为占位符 token；同时保护代码块/行内代码中的 $。
 *
 * @param {string} text - 原始 markdown 文本
 * @returns {{ text: string, tokens: Array<{placeholder:string, html:string}> }}
 */
export function extractMath (text) {
  if (!text) return { text: '', tokens: [] }
  const tokens = []
  let counter = 0

  // 1) 保护代码块（```...```）与行内代码（`...`），避免其中的 $ 被误识别
  const codeStore = []
  let work = text.replace(/```[\s\S]*?```|`[^`\n]+`/g, (m) => {
    const i = codeStore.length
    codeStore.push(m)
    return `${CODE_PH_PREFIX}${i}${CODE_PH_SUFFIX}`
  })

  // 2) 块级公式 $$...$$
  work = work.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
    const html = renderMathExpression(expr, true)
    const ph = `${MATH_PH_PREFIX}${counter}${MATH_PH_SUFFIX}`
    tokens.push({ placeholder: ph, html })
    counter++
    return ph
  })

  // 3) 行内公式 $...$（排除 $$ 与行首已消费的情况）
  //    要求：$ 后跟非空白、非 $；内容不含换行与 $；以 $ 结尾且后面非 $
  work = work.replace(/(^|[^\\$])\$(?!\$)([^\n$]+?)\$(?!\$)/g, (m, pre, expr) => {
    const html = renderMathExpression(expr, false)
    const ph = `${MATH_PH_PREFIX}${counter}${MATH_PH_SUFFIX}`
    tokens.push({ placeholder: ph, html })
    counter++
    return `${pre}${ph}`
  })

  // 4) 恢复代码占位符（让 marked 正常渲染 <code>）
  work = work.replace(new RegExp(`${CODE_PH_PREFIX}(\\d+)${CODE_PH_SUFFIX}`, 'g'), (_, i) => codeStore[+i] ?? '')

  return { text: work, tokens }
}

/**
 * 将 KaTeX HTML 回填到 sanitize 后的 HTML 中（替换占位符）。
 * @param {string} html   - DOMPurify sanitize 后的 HTML
 * @param {Array} tokens  - extractMath 返回的 tokens
 * @returns {string}
 */
export function injectMath (html, tokens) {
  if (!html || !tokens?.length) return html || ''
  let out = html
  for (const { placeholder, html: mathHtml } of tokens) {
    // 占位符可能被 marked 包裹在 <p> 中（块级），或内联在文本中
    out = out.split(placeholder).join(mathHtml)
  }
  return out
}

// ============================================================
// SVG 提取（内联 <svg>...</svg>）
// ============================================================

const SVG_REGEX = /<svg[\s\S]*?<\/svg>/gi

/**
 * 从文本中提取内联 <svg>...</svg>，替换为占位符。
 * 调用方拿到 svgStore 后，用 DOMPurify SVG profile 逐个 sanitize，
 * 再通过 injectSvg 回填。
 *
 * @param {string} text
 * @returns {{ text: string, svgs: Array<{placeholder:string, raw:string}> }}
 */
export function extractSvg (text) {
  if (!text) return { text: '', svgs: [] }
  const svgs = []
  let counter = 0
  const out = text.replace(SVG_REGEX, (m) => {
    const ph = `${SVG_PH_PREFIX}${counter}${SVG_PH_SUFFIX}`
    svgs.push({ placeholder: ph, raw: m })
    counter++
    return ph
  })
  return { text: out, svgs }
}

/**
 * 将 sanitize 后的 SVG HTML 回填到 HTML 中。
 * @param {string} html
 * @param {Array<{placeholder:string, sanitized:string}>} svgTokens
 * @returns {string}
 */
export function injectSvg (html, svgTokens) {
  if (!html || !svgTokens?.length) return html || ''
  let out = html
  for (const { placeholder, sanitized } of svgTokens) {
    out = out.split(placeholder).join(sanitized)
  }
  return out
}

/**
 * 完整渲染管线（不含 DOMPurify，用于 Node 环境测试）：
 * markdown 文本 → 提取 math/svg → marked.parse → 回填 math。
 * SVG 在无 DOMPurify 的环境下原样回填（测试用）。
 *
 * @param {string} text
 * @param {object} [markedInstance] - 可选的 marked 实例
 * @returns {string}
 */
export function renderPipeline (text, markedInstance) {
  if (!text) return ''
  const m = markedInstance || globalThis.__marked
  const parse = m?.parse || ((s) => s)
  const { text: t1, tokens } = extractMath(text)
  const { text: t2, svgs } = extractSvg(t1)
  let html = parse(t2)
  html = injectMath(html, tokens)
  // 测试环境：SVG 原样回填（生产由 MarkdownRenderer 做 DOMPurify sanitize）
  html = injectSvg(html, svgs.map(s => ({ placeholder: s.placeholder, sanitized: s.raw })))
  return html
}

export default {
  renderMathExpression,
  extractMath,
  injectMath,
  extractSvg,
  injectSvg,
  renderPipeline
}
