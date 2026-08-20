// ============================================================
// src/utils/renderMath.js
// B1：LaTeX 公式 ($...$ / $$...$$) 提取 + KaTeX 渲染 + svg-spec 图件提取
//
// 设计要点：
//   - 公式在 marked.parse 之前提取为占位符（纯文本 token），
//     经 DOMPurify sanitize 后再回填 KaTeX HTML——避免 KaTeX
//     输出的 inline style / span 被 sanitize 配置剥离。
//   - 非法公式 try/catch 回退为原文（$expr$），不崩溃。
//   - 代码块/行内代码中的 $ 不被误识别为公式定界符。
//   - KaTeX 走 dynamic import 按需加载（PM 裁定：首次命中公式标记时才拉取，
//     不进首屏 chunk）。未加载完成时 renderMathExpression 回退为原文，
//     由调用方（MarkdownRenderer）在 ensureKatex 完成后 reactive 重渲染。
//   - svg-spec 围栏（```svg-spec JSON```）提取为占位符，JSON.parse 失败按
//     原文代码块兜底渲染（不白屏）。解析顺序：svg-spec 块 → $$ 块 → $ 行内
//     （先大后小，各自占位符替换，符合 B1 规范 §集成要点）。
// ============================================================

// ---- KaTeX 动态加载（按需）----
let _katex = null
let _katexPromise = null

/**
 * 按需加载 KaTeX（首次命中公式标记时调用）。加载完成前 renderMathExpression
 * 回退为原文；加载完成后调用方 reactive 重渲染。
 * @returns {Promise<object>} katex 模块
 */
export function ensureKatex() {
  if (_katex) return Promise.resolve(_katex)
  if (!_katexPromise) {
    _katexPromise = Promise.all([
      import('katex'),
      // CSS 同步按需拉取（Vite 拆为独立 chunk，不进首屏）
      import('katex/dist/katex.min.css').catch(() => {})
    ]).then(([m]) => {
      _katex = (m && (m.default || m)) || null
      return _katex
    })
  }
  return _katexPromise
}

/** KaTeX 是否已加载完成（调用方据此决定是否触发 reactive 重渲染）*/
export function isKatexReady() {
  return _katex !== null
}

// ---- 占位符 token（纯文本，不会被 marked / DOMPurify 改动）----
const MATH_PH_PREFIX = '@@KATEX'
const MATH_PH_SUFFIX = '@@'
const SVG_PH_PREFIX = '@@SVGINLINE'
const SVG_PH_SUFFIX = '@@'
const SVGSPEC_PH_PREFIX = '@@SVGSPEC'
const SVGSPEC_PH_SUFFIX = '@@'
const CODE_PH_PREFIX = '\uE001CODE'
const CODE_PH_SUFFIX = '\uE001'

/**
 * 用 KaTeX 渲染单个公式；非法公式或 KaTeX 未加载时回退为原文（不崩溃）。
 * @param {string} expr       - 公式内容（不含 $ 定界符）
 * @param {boolean} displayMode - true=块级 $$...$$，false=行内 $...$
 * @returns {string} KaTeX HTML 或回退原文
 */
export function renderMathExpression(expr, displayMode = false) {
  const trimmed = (expr || '').trim()
  if (!trimmed) return ''
  if (!_katex) {
    // 未加载：回退原文（保留定界符让用户看到原始输入；加载后重渲染）
    return displayMode ? `$$${trimmed}$$` : `$${trimmed}$`
  }
  try {
    return _katex.renderToString(trimmed, {
      displayMode,
      throwOnError: true,
      strict: 'ignore',
      output: 'htmlAndMathml'
    })
  } catch (_) {
    // 非法公式（align 多行 / 裸中文 / 未知宏等）：回退为原文
    return displayMode ? `$$${trimmed}$$` : `$${trimmed}$`
  }
}

/**
 * 从 markdown 文本中提取 $$...$$（块级）与 $...$（行内）公式，
 * 替换为占位符 token；同时保护代码块/行内代码中的 $。
 *
 * @param {string} text - 原始 markdown 文本（svg-spec 围栏应已提取）
 * @returns {{ text: string, tokens: Array<{placeholder:string, html:string}> }}
 */
export function extractMath(text) {
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

  // 1.5) 归一化非 $ 定界符 → $ / $$（LLM 常见输出：\(...\) 行内、\[...\] 块级，以及误写的 ((...)) ）
  //      先于 math 提取，使下游 $...$ / $$...$$ 规则统一命中
  work = work
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, e) => '$$' + e + '$$')
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, e) => '$' + e + '$')
    // LLM 误写双括号 ((...)) 当作行内公式（仅当内容含数学符号 _ ^ \ 或电荷号 + - 时）
    .replace(/\(\(([^()]{1,60}?[_^\\+\-][^()]{0,60}?)\)\)/g, (_, e) => '$' + e + '$')

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
export function injectMath(html, tokens) {
  if (!html || !tokens?.length) return html || ''
  let out = html
  for (const { placeholder, html: mathHtml } of tokens) {
    out = out.split(placeholder).join(mathHtml)
  }
  return out
}

// ============================================================
// svg-spec 围栏提取（```svg-spec JSON```）
// ============================================================
const SVGSPEC_FENCE_RE = /```svg-spec\r?\n([\s\S]*?)```/g

/**
 * 从 markdown 文本中提取 ```svg-spec``` 围栏（信息串恰好 svg-spec），
 * 替换为占位符。JSON.parse 失败的围栏保留 raw（调用方按原文代码块兜底渲染）。
 *
 * @param {string} text
 * @returns {{ text: string, specs: Array<{placeholder:string, spec:object|null, raw:string}> }}
 *   spec=null 表示 JSON 非法，调用方用 raw 原文渲染兜底（不白屏）
 */
export function extractSvgSpec(text) {
  if (!text) return { text: '', specs: [] }
  const specs = []
  let counter = 0
  const out = text.replace(SVGSPEC_FENCE_RE, (m, body) => {
    const raw = m
    let spec = null
    try {
      spec = JSON.parse(body)
    } catch (_) {
      spec = null // 非法 JSON，保留 raw 兜底
    }
    const ph = `${SVGSPEC_PH_PREFIX}${counter}${SVGSPEC_PH_SUFFIX}`
    specs.push({ placeholder: ph, spec, raw })
    counter++
    return ph
  })
  return { text: out, specs }
}

/**
 * 将 svg-spec 渲染后的 SVG 回填到 HTML 中（替换占位符）。
 * 调用方需先用 renderSvgSpec + DOMPurify SVG profile sanitize 生成 tokens。
 *
 * @param {string} html
 * @param {Array<{placeholder:string, sanitized:string}>} svgSpecTokens
 * @returns {string}
 */
export function injectSvgSpec(html, svgSpecTokens) {
  if (!html || !svgSpecTokens?.length) return html || ''
  let out = html
  for (const { placeholder, sanitized } of svgSpecTokens) {
    out = out.split(placeholder).join(sanitized)
  }
  return out
}

// ============================================================
// 内联 SVG 提取（<svg>...</svg>，兼容旧路径）
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
export function extractSvg(text) {
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
export function injectSvg(html, svgTokens) {
  if (!html || !svgTokens?.length) return html || ''
  let out = html
  for (const { placeholder, sanitized } of svgTokens) {
    out = out.split(placeholder).join(sanitized)
  }
  return out
}

/**
 * 完整渲染管线（不含 DOMPurify，用于 Node 环境测试）：
 * markdown 文本 → 提取 svg-spec/math/svg → marked.parse → 回填。
 * 生产由 MarkdownRenderer 做 DOMPurify sanitize。
 *
 * @param {string} text
 * @param {object} [markedInstance] - 可选的 marked 实例
 * @param {Function} [renderSpec] - 可选的 svg-spec 渲染函数（测试注入）
 * @returns {string}
 */
export function renderPipeline(text, markedInstance, renderSpec) {
  if (!text) return ''
  const m = markedInstance || globalThis.__marked
  const parse = m?.parse || ((s) => s)
  // 顺序：svg-spec 块 → math → 内联 svg（先大后小）
  const { text: t0, specs } = extractSvgSpec(text)
  const { text: t1, tokens } = extractMath(t0)
  const { text: t2, svgs } = extractSvg(t1)
  let html = parse(t2)
  html = injectMath(html, tokens)
  // svg-spec：测试环境直接渲染（不经 DOMPurify）；渲染失败回退原文代码块
  if (specs.length && typeof renderSpec === 'function') {
    const specTokens = specs.map(({ placeholder, spec, raw }) => {
      const svg = spec ? (renderSpec(spec) || '') : ''
      // 渲染失败（非法 JSON / 白名单外 template / 未知 type）→ 原文代码块兜底
      const sanitized = svg || parse(raw) || ''
      return { placeholder, sanitized }
    })
    html = injectSvgSpec(html, specTokens)
  }
  // 内联 SVG：测试环境原样回填
  html = injectSvg(html, svgs.map(s => ({ placeholder: s.placeholder, sanitized: s.raw })))
  return html
}

export default {
  ensureKatex,
  isKatexReady,
  renderMathExpression,
  extractMath,
  injectMath,
  extractSvgSpec,
  injectSvgSpec,
  extractSvg,
  injectSvg,
  renderPipeline
}
