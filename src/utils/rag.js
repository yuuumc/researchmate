// ============================================================
// RAG 检索（v3 §Week 3 8/13 P0 升级版）
// ============================================================
// v1: 关键词匹配 + 3 级子串加权
// v3: TF-IDF + 子串加权（混合评分）+ 阈值过滤 + Top-K + 重排序
//
// 算法：
//   1. 预处理：建立倒排索引 + IDF 表（按 knowledgeBase 引用缓存）
//   2. 检索：
//      - TF-IDF 主分（语义相关性，区分常见词 vs 罕见词）
//      - 子串加权（专业术语精确匹配奖励，保留 v1 逻辑）
//      - 长度归一化（避免长切片先天占优）
//      - 混合得分 = 0.7 * tfidf_norm + 0.3 * substring_score
//   3. 阈值过滤：score < MIN_THRESHOLD 丢弃
//   4. Top-K 排序
//   5. 重排序：完全匹配关键词数优先（同分时 tiebreaker）
//
// 验证：20 题 hit@5 ≥ 0.8（详见 scripts/test-rag-hit5.mjs）
// ============================================================

import { extractKeywords } from './tokenize.js'

// ============================================================
// 常量
// ============================================================
const MIN_THRESHOLD = 0.05      // 低于此分数丢弃
const TFIDF_WEIGHT = 0.7        // TF-IDF 主分权重
const SUBSTRING_WEIGHT = 0.3    // 子串加权权重
const EXACT_BONUS = 0.15        // 完全匹配关键词奖励（用于重排序 tiebreaker）

// ============================================================
// 索引缓存（按 knowledgeBase 数组引用缓存，避免重复计算 IDF）
// ============================================================
const indexCache = new WeakMap()

/**
 * 构建 TF-IDF 索引
 * @param {Array} knowledgeBase
 * @returns {{idf: Map<string, number>, itemKeywords: Array<Set<string>>, itemTf: Array<Map<string, number>>, size: number}}
 */
function buildIndex(knowledgeBase) {
  const N = knowledgeBase.length
  const df = new Map()                  // 文档频率：keyword -> 出现该词的切片数
  const itemKeywords = []               // 每个切片的关键词 Set
  const itemTf = []                     // 每个切片的词频 Map

  for (const item of knowledgeBase) {
    const kws = item.keywords && item.keywords.length > 0
      ? item.keywords
      : extractKeywords(item.content || '')
    const kwSet = new Set(kws)
    const tf = new Map()
    for (const kw of kws) {
      tf.set(kw, (tf.get(kw) || 0) + 1)
    }
    itemKeywords.push(kwSet)
    itemTf.push(tf)
    // 更新 df
    for (const kw of kwSet) {
      df.set(kw, (df.get(kw) || 0) + 1)
    }
  }

  // IDF = log((N + 1) / (df + 1)) + 1  (加 1 平滑，避免 df=0 时除零)
  const idf = new Map()
  for (const [kw, d] of df) {
    idf.set(kw, Math.log((N + 1) / (d + 1)) + 1)
  }

  return { idf, itemKeywords, itemTf, size: N }
}

/**
 * 获取或构建索引（缓存命中直接返回）
 */
function getIndex(knowledgeBase) {
  if (!indexCache.has(knowledgeBase)) {
    indexCache.set(knowledgeBase, buildIndex(knowledgeBase))
  }
  return indexCache.get(knowledgeBase)
}

/**
 * 计算查询关键词对单个切片的 TF-IDF 得分
 * @param {Map<string, number>} queryTf - 查询词频
 * @param {Map<string, number>} idf - IDF 表
 * @param {Set<string>} itemKwSet - 切片关键词集合
 * @param {Map<string, number>} itemTf - 切片词频
 * @returns {{score: number, matched: string[]}}
 */
function computeTfIdfScore(queryKws, idf, itemKwSet, itemTf) {
  let score = 0
  const matched = []
  // 切片总词数（用于 TF 归一化）
  const itemTotal = Array.from(itemTf.values()).reduce((a, b) => a + b, 0) || 1

  for (const qkw of queryKws) {
    if (itemKwSet.has(qkw)) {
      // 完全匹配：tf * idf
      const tf = itemTf.get(qkw) / itemTotal
      const idfVal = idf.get(qkw) || 1
      score += tf * idfVal
      matched.push(qkw)
    }
  }
  return { score, matched }
}

/**
 * 计算子串加权得分（保留 v1 的 3 级加权，用于专业术语奖励）
 * @param {string[]} queryKws
 * @param {Set<string>} itemKwSet
 * @returns {{score: number, matched: string[]}}
 */
function computeSubstringScore(queryKws, itemKwSet) {
  let score = 0
  const matched = []
  const itemKws = Array.from(itemKwSet)
  for (const qkw of queryKws) {
    for (const ikw of itemKws) {
      if (qkw === ikw) {
        score += 1.0
        matched.push(ikw)
        break
      } else if (ikw.includes(qkw) && qkw.length >= 2) {
        // 查询词是切片词的子串（"费米" ⊂ "费米能级"）
        score += 0.8
        matched.push(ikw)
        break
      } else if (qkw.includes(ikw) && ikw.length >= 2) {
        // 切片词是查询词的子串（"PN结" ⊂ "PN结构"）
        score += 0.6
        matched.push(ikw)
        break
      }
    }
  }
  return { score, matched }
}

/**
 * 长度归一化：长切片先天包含更多关键词，需归一化
 * 归一化因子 = 1 + log(slice_length / avg_length)
 */
function normalizeByLength(score, contentLength, avgLength) {
  if (avgLength <= 0 || contentLength <= 0) return score
  const factor = 1 + Math.log(Math.max(1, contentLength / avgLength)) * 0.1
  return score / factor
}

/**
 * 检索 Top-K 相关切片（v3 TF-IDF + 重排序版）
 * @param {string} query - 用户查询
 * @param {Array<{id:string, content:string, keywords?:string[]}>} knowledgeBase - 知识库
 * @param {number} topK - 默认 5
 * @returns {Array} Top-K 切片，按相关度降序
 */
export function retrieve(query, knowledgeBase, topK = 5) {
  if (!query || !Array.isArray(knowledgeBase) || knowledgeBase.length === 0) {
    return []
  }

  const queryKws = extractKeywords(query)
  if (queryKws.length === 0) return []

  // 1. 获取索引（缓存）
  const { idf, itemKeywords, itemTf, size } = getIndex(knowledgeBase)

  // 2. 计算平均长度（用于归一化）
  const avgLength = knowledgeBase.reduce(
    (sum, item) => sum + (item.content?.length || 0), 0
  ) / size

  // 3. 对每个切片计算混合得分
  const scored = knowledgeBase.map((item, idx) => {
    const itemKwSet = itemKeywords[idx]
    const itemTfMap = itemTf[idx]

    // 3.1 TF-IDF 主分
    const tfidf = computeTfIdfScore(queryKws, idf, itemKwSet, itemTfMap)
    // 3.2 子串加权（专业术语奖励）
    const substr = computeSubstringScore(queryKws, itemKwSet)

    // 3.3 长度归一化 TF-IDF
    const contentLen = item.content?.length || 1
    const tfidfNorm = normalizeByLength(tfidf.score, contentLen, avgLength)

    // 3.4 子串得分归一化（除以查询词数，避免长查询先天高分）
    const substrNorm = queryKws.length > 0 ? substr.score / queryKws.length : 0

    // 3.5 混合得分
    const hybridScore = TFIDF_WEIGHT * tfidfNorm + SUBSTRING_WEIGHT * substrNorm

    // 3.6 完全匹配数（用于重排序 tiebreaker）
    const exactMatchCount = tfidf.matched.length

    // 3.7 最终得分 = 混合得分 + 完全匹配奖励
    const finalScore = hybridScore + EXACT_BONUS * exactMatchCount

    return {
      ...item,
      score: Number(finalScore.toFixed(4)),
      _tfidf_score: Number(tfidfNorm.toFixed(4)),
      _substr_score: Number(substrNorm.toFixed(4)),
      _exact_matches: exactMatchCount,
      _matched_keywords: [...new Set([...tfidf.matched, ...substr.matched])]
    }
  })

  // 4. 阈值过滤 + Top-K
  return scored
    .filter((item) => item.score >= MIN_THRESHOLD)
    .sort((a, b) => {
      // 重排序：分数降序，同分时完全匹配数多的优先
      if (b.score !== a.score) return b.score - a.score
      return b._exact_matches - a._exact_matches
    })
    .slice(0, topK)
}

/**
 * 把切片拼成上下文字符串（供 LLM prompt 用）
 * @param {Array} slices - retrieve 返回值
 * @returns {string}
 */
export function buildContext(slices) {
  if (!Array.isArray(slices) || slices.length === 0) return ''
  return slices
    .map((s, i) => `[${i + 1}] 来源：${s.source || '未知'}\n${s.content}`)
    .join('\n\n---\n\n')
}

/**
 * 清除索引缓存（知识库更新时调用）
 * @param {Array} knowledgeBase
 */
export function clearIndex(knowledgeBase) {
  indexCache.delete(knowledgeBase)
}
