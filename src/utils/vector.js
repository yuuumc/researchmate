// ============================================================
// 特征哈希向量模块（P0-1 GraphRAG 双路融合）
// ============================================================
// 从 knowledgeGraph.js 提取的独立向量工具模块。
// 提供文本→向量化 + 余弦相似度计算，供 graphRag.js 融合检索使用。
//
// 算法：bag-of-words 特征哈希（FNV-1a），L2 归一化。
// 零依赖、浏览器端可用、同义词/近义表述因共享词落在相近方向。
// 非真 embedding，但够演示；后续可叠加 Supabase pgvector 增强。
// ============================================================

import { tokenize } from './tokenize.js'

// ============================================================
// 常量
// ============================================================
export const VECTOR_DIM = 256          // 特征哈希向量维度（内存 / 区分度折中）
const HASH_SEED = 42                   // 固定种子，保证同文本向量稳定

/**
 * 字符串哈希（FNV-1a 变体，带种子，保证稳定）
 * @param {string} str
 * @param {number} [seed=42]
 * @returns {number} 无符号 32 位整数
 */
export function fnv1a(str, seed = HASH_SEED) {
  let h = 2166136261 ^ seed
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * 把文本转成 L2 归一化的特征哈希向量
 * @param {string} text
 * @returns {Float64Array} 长度 VECTOR_DIM
 */
export function textToVector(text) {
  const vec = new Float64Array(VECTOR_DIM)
  if (!text || typeof text !== 'string') return vec

  const tokens = tokenize(text)
  for (const tk of tokens) {
    const idx = fnv1a(tk) % VECTOR_DIM
    vec[idx] += 1
  }

  // L2 归一化
  let norm = 0
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= norm
  }
  return vec
}

/**
 * 两个向量的余弦相似度
 * @param {Float64Array|number[]} a
 * @param {Float64Array|number[]} b
 * @returns {number} [-1, 1]
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * 判断向量是否全零（无有效 token）
 * @param {Float64Array} vec
 * @returns {boolean}
 */
export function isZeroVector(vec) {
  if (!vec) return true
  for (let i = 0; i < vec.length; i++) {
    if (vec[i] !== 0) return false
  }
  return true
}

/**
 * Min-Max 归一化一组分数到 [0, 1]
 * 如果所有分数相同（max === min），统一归为 0.5（避免除零）
 * @param {number[]} scores
 * @returns {number[]}
 */
export function minMaxNormalize(scores) {
  if (!scores || scores.length === 0) return []
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  if (max === min) return scores.map(() => 0.5)
  return scores.map(s => (s - min) / (max - min))
}
