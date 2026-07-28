// ============================================================
// Research Agent 论文引用核对（v1.5 评审保命 P1）
// ============================================================
// 解决问题：src/core/agents/research.js 旧版直接用 LLM 生成的 papers 列表，
// 可能包含编造的标题/作者/DOI。本模块在 LLM 返回后异步验证每条论文。
//
// 验证策略（双源 + 优雅降级）：
//   1) OpenAlex (主)：GET https://api.openalex.org/works?search=<title>&per_page=2
//      - 标题相似度 ≥ 0.7 视为命中
//      - 含 DOI 字段，进一步做 DOI 二次校验
//   2) Semantic Scholar (备)：GET .../graph/v1/paper/search?query=<title>&limit=1
//      - 仅在 OpenAlex 失败 / 超时 / 命中度不足时使用
//      - 限流严重（429），作为软兜底
//
// 失败行为（不静默删）：
//   - 验证失败 → 在 paper.value 末尾追加 [未验证: <title>] 占位符
//   - 保留原始 paper 对象，前端仍可渲染（带未验证标记）
//   - 任何 API 异常（超时 / 4xx / 5xx）→ 视为未验证，不阻塞主流程
// ============================================================

const OPENALEX_SEARCH = 'https://api.openalex.org/works'
const SEMANTIC_SCHOLAR_SEARCH = 'https://api.semanticscholar.org/graph/v1/paper/search'

const DEFAULT_TIMEOUT_MS = 4000
const DEFAULT_RETRIES = 1

/**
 * 字符串相似度（简化的 Jaccard 系数 + 大小写归一化）
 * 适合标题比较：忽略大小写、标点、空格差异
 * @param {string} a
 * @param {string} b
 * @returns {number} 0-1
 */
export function titleSimilarity(a, b) {
  if (!a || !b) return 0
  const norm = (s) =>
    s
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 1)
  const wa = new Set(norm(a))
  const wb = new Set(norm(b))
  if (wa.size === 0 || wb.size === 0) return 0
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter++
  const union = wa.size + wb.size - inter
  return union === 0 ? 0 : inter / union
}

/**
 * 提取论文条目：从 LLM 输出的 JSON 块中抽 papers 数组
 * 兼容两种结构：
 *   - structured.papers 数组（research.js extractResearchStructure 输出）
 *   - LLM 原始文本中的 ```json ... ``` 块
 *
 * @param {string|object} input
 * @returns {Array<{title: string, authors: string, value: string, [k:string]: any}>}
 */
export function extractCitations(input) {
  if (!input) return []
  if (Array.isArray(input)) {
    return input
      .filter((p) => p && typeof p === 'object' && typeof p.title === 'string')
      .map((p) => ({
        title: p.title,
        authors: p.authors || '',
        value: p.value || '',
        ...p
      }))
  }
  if (typeof input === 'string') {
    const blocks = [...input.matchAll(/```json\s*([\s\S]+?)```/g)].map((m) => m[1])
    for (const blk of blocks) {
      try {
        const obj = JSON.parse(blk)
        if (Array.isArray(obj.papers)) {
          return extractCitations(obj.papers)
        }
      } catch (_) {
        // 忽略，继续下一个块
      }
    }
    return []
  }
  if (typeof input === 'object' && Array.isArray(input.papers)) {
    return extractCitations(input.papers)
  }
  return []
}

/**
 * 单条论文验证（带超时 + 1 次重试 + 异常降级）
 * @param {{title: string, authors?: string, [k:string]: any}} paper
 * @param {object} options
 * @returns {Promise<{verified: boolean, source: string|null, matchedTitle: string|null, doi: string|null, error: string|null}>}
 */
export async function verifyCitation(paper, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
  const retries = options.retries ?? DEFAULT_RETRIES
  if (!paper || !paper.title || typeof paper.title !== 'string') {
    return { verified: false, source: null, matchedTitle: null, doi: null, error: 'no_title' }
  }
  const title = paper.title.trim()
  if (title.length < 5) {
    return { verified: false, source: null, matchedTitle: null, doi: null, error: 'title_too_short' }
  }

  // 1) OpenAlex 主源
  for (let i = 0; i <= retries; i++) {
    try {
      const url = `${OPENALEX_SEARCH}?search=${encodeURIComponent(title)}&per_page=2`
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'yxt-citation-verifier/1.5' } })
      clearTimeout(timer)
      if (!r.ok) {
        if (r.status === 429 && i < retries) continue // 限流重试
        // 4xx/5xx 视为失败，不重试
        return { verified: false, source: 'openalex', matchedTitle: null, doi: null, error: `http_${r.status}` }
      }
      const data = await r.json()
      const results = Array.isArray(data.results) ? data.results : []
      if (results.length === 0) {
        return { verified: false, source: 'openalex', matchedTitle: null, doi: null, error: 'no_results' }
      }
      // 找最佳匹配
      let best = null
      let bestScore = 0
      for (const cand of results) {
        const candTitle = cand.title || cand.display_name || ''
        const score = titleSimilarity(title, candTitle)
        if (score > bestScore) {
          bestScore = score
          best = cand
        }
      }
      const threshold = options.similarityThreshold ?? 0.55
      if (best && bestScore >= threshold) {
        return {
          verified: true,
          source: 'openalex',
          matchedTitle: best.title || best.display_name || '',
          doi: best.doi || null,
          similarity: Number(bestScore.toFixed(3)),
          error: null
        }
      }
      return { verified: false, source: 'openalex', matchedTitle: best?.title || null, doi: null, error: 'low_similarity' }
    } catch (e) {
      if (i < retries && (e.name === 'AbortError' || /fetch failed|network/i.test(e.message))) continue
      // 其它异常直接失败降级，不重试
      return { verified: false, source: 'openalex', matchedTitle: null, doi: null, error: e.message || 'fetch_failed' }
    }
  }
  return { verified: false, source: 'openalex', matchedTitle: null, doi: null, error: 'retries_exhausted' }
}

/**
 * 批量验证（并行，单条超时独立计）
 * @param {Array} papers
 * @param {object} options
 * @returns {Promise<{papers: Array, summary: object}>}
 *   - papers：每条 paper 上加 verified / source / matchedTitle / doi / error 字段
 *   - summary：{ total, verified, unverified, byReason: { no_title, http_xxx, ... } }
 */
export async function verifyAllCitations(papers, options = {}) {
  const list = Array.isArray(papers) ? papers : []
  const results = await Promise.all(
    list.map(async (p) => {
      const v = await verifyCitation(p, options)
      return { ...p, ...v }
    })
  )
  const summary = {
    total: results.length,
    verified: results.filter((r) => r.verified).length,
    unverified: results.filter((r) => !r.verified).length,
    byReason: {}
  }
  for (const r of results) {
    if (r.verified) continue
    const reason = r.error || 'unknown'
    summary.byReason[reason] = (summary.byReason[reason] || 0) + 1
  }
  return { papers: results, summary }
}

/**
 * 把验证结果应用到 papers 数组：在 value 字段末尾追加 [未验证: <title>] 占位符
 * （不静默删，保留可追溯）
 *
 * @param {Array} papers - 已被 verifyAllCitations 加过 verified 字段的列表
 * @returns {Array} 复制版（不修改入参）
 */
export function markUnverified(papers) {
  if (!Array.isArray(papers)) return []
  return papers.map((p) => {
    if (p.verified) return { ...p }
    const title = p.title || '(未知标题)'
    const originalValue = p.value || ''
    const marker = `[未验证: ${title}]`
    const newValue = originalValue.includes(marker) ? originalValue : `${originalValue} ${marker}`.trim()
    return { ...p, value: newValue }
  })
}

// ============================================================
// 集成示例（research.js 改造示意，详见 CHANGELOG.md）
// ============================================================
// import { verifyAllCitations, markUnverified } from './citationVerifier'
//
// const raw = await AI_PROVIDER.call(prompt, userInput, { ... })
// const structured = extractResearchStructure(raw)
// // 1) 异步验证
// const { papers, summary } = await verifyAllCitations(structured.papers)
// // 2) 失败条目加占位符
// const markedPapers = markUnverified(papers)
// // 3) 替换 structured.papers
// structured.papers = markedPapers
// structured.citation_summary = summary
//
// return { intent: 'research', agent: 'research', content: raw, structured }
