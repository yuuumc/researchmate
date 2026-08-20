// ============================================================
// 向量记忆模块（P0-3 三层记忆）
// ============================================================
// 职责：基于 P0-1 的 textToVector 构建轻量个人记忆层
//   - 写入：诊断/计划/择校/问答结果 → 向量化 → localStorage 持久化
//   - 召回：用户输入 → 向量化 → 余弦相似度 Top-K → 注入 prompt 上下文
//
// 设计：
//   - 零新增 npm 依赖，复用 P0-1 的 vector.js（textToVector/cosineSimilarity/isZeroVector）
//   - localStorage 持久化，容量 200 条 + LRU 淘汰
//   - SSR 安全（typeof localStorage 检测 → no-op 降级）
//   - 未登录 userId 用 'default' 命名空间
// ============================================================

import { textToVector, cosineSimilarity, isZeroVector } from './vector.js'

// ============================================================
// 常量
// ============================================================
const STORAGE_KEY = 'vector_memory'
const MAX_CAPACITY = 200
const DEFAULT_MIN_SCORE = 0.06

// ============================================================
// SSR / 环境检测
// ============================================================
function hasLocalStorage() {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null
  } catch (_) {
    return false
  }
}

// ============================================================
// 持久化：读 / 写 localStorage
// ============================================================
function loadRaw() {
  if (!hasLocalStorage()) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []

    // v2 migration: re-vectorize memories stored with type-prefix vectors
    // (old addMemory used `${type} ${text}`, new uses `text` only)
    let needsMigration = false
    for (const m of arr) {
      if (m && m.text && !m._v2) { needsMigration = true; break }
    }
    if (needsMigration) {
      for (const m of arr) {
        if (m && m.text) {
          m.vector = Array.from(textToVector(m.text))
          m._v2 = true
        }
      }
      saveRaw(arr)
    }

    return arr
  } catch (e) {
    console.warn('[vectorMemory] load failed, resetting:', e.message)
    return []
  }
}

function saveRaw(memories) {
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memories))
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      // 配额满 → 淘汰最旧 20% 再试
      const trimmed = memories.slice(Math.floor(memories.length * 0.2))
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
      } catch (_) {
        console.warn('[vectorMemory] persist failed even after trim, giving up')
      }
    } else {
      console.warn('[vectorMemory] save failed:', e.message)
    }
  }
}

// ============================================================
// userId 命名空间
// ============================================================
function getUserId() {
  if (!hasLocalStorage()) return 'default'
  try {
    // 尝试从 localStorage 中已有的用户信息获取
    const userRaw = localStorage.getItem('user_id') || localStorage.getItem('auth_user_id')
    if (userRaw) return String(userRaw)
  } catch (_) { /* noop */ }
  return 'default'
}

// ============================================================
// 核心 API
// ============================================================

/**
 * 写入一条记忆
 * @param {string} type - 'diagnosis' | 'plan' | 'admission' | 'qa'
 * @param {string} text - 记忆文本（将向量化）
 * @param {object} [meta={}] - 附加元数据
 * @returns {object|null} 写入的记忆条目（失败返回 null）
 */
export function addMemory(type, text, meta = {}) {
  if (!hasLocalStorage()) return null
  if (!text || typeof text !== 'string' || !text.trim()) return null

  const memories = loadRaw()

  // 向量化（仅 text，不加 type 前缀——type 前缀会稀释 query 向量的余弦相似度）
  const vector = textToVector(text)
  if (isZeroVector(vector)) {
    // query 全停用词或空 → 不写入
    return null
  }

  // 转 Array 存储（Float64Array 不可直接 JSON 序列化）
  const vectorArray = Array.from(vector)

  const item = {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    text,
    vector: vectorArray,
    ts: Date.now(),
    userId: getUserId(),
    meta
  }

  memories.push(item)

  // LRU 淘汰：超过容量时移除最旧
  if (memories.length > MAX_CAPACITY) {
    memories.sort((a, b) => a.ts - b.ts)
    const excess = memories.length - MAX_CAPACITY
    memories.splice(0, excess)
  }

  saveRaw(memories)
  return item
}

/**
 * 召回相似记忆
 * @param {string} query - 查询文本
 * @param {object} [opts] - 选项
 * @param {number} [opts.topK=3] - 返回条数上限
 * @param {number} [opts.minScore=0.18] - 最低相似度阈值
 * @returns {Array<{id, type, text, score, ts, meta}>} 按分数降序
 */
export function queryMemory(query, opts = {}) {
  if (!hasLocalStorage()) return []
  const { topK = 3, minScore = DEFAULT_MIN_SCORE } = opts

  if (!query || typeof query !== 'string' || !query.trim()) return []

  const queryVec = textToVector(query)
  if (isZeroVector(queryVec)) return []

  const memories = loadRaw()
  if (memories.length === 0) return []

  const userId = getUserId()

  // 按用户过滤 + 计算相似度
  const scored = []
  for (const mem of memories) {
    // 只召回当前用户的记忆
    if (mem.userId && mem.userId !== userId) continue

    // 恢复 Float64Array
    const memVec = mem.vector
    if (!memVec || !Array.isArray(memVec) || memVec.length === 0) continue

    const sim = cosineSimilarity(queryVec, memVec)
    if (sim >= minScore) {
      scored.push({
        id: mem.id,
        type: mem.type,
        text: mem.text,
        score: Math.round(sim * 1000) / 1000, // 保留 3 位小数
        ts: mem.ts,
        meta: mem.meta || {}
      })
    }
  }

  // 降序排序：分数优先，同分取较新
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.ts - a.ts
  })

  return scored.slice(0, topK)
}

/**
 * 清空所有记忆（当前用户）
 */
export function clearMemory() {
  if (!hasLocalStorage()) return
  const memories = loadRaw()
  const userId = getUserId()
  const remaining = memories.filter(m => m.userId && m.userId !== userId)
  saveRaw(remaining)
}

/**
 * 获取记忆统计信息
 * @returns {{count: number, capacity: number, oldest: number|null, newest: number|null}}
 */
export function getMemoryStats() {
  if (!hasLocalStorage()) return { count: 0, capacity: MAX_CAPACITY, oldest: null, newest: null }
  const memories = loadRaw()
  const userId = getUserId()
  const userMems = memories.filter(m => !m.userId || m.userId === userId)

  if (userMems.length === 0) {
    return { count: 0, capacity: MAX_CAPACITY, oldest: null, newest: null }
  }

  let oldest = userMems[0].ts
  let newest = userMems[0].ts
  for (const m of userMems) {
    if (m.ts < oldest) oldest = m.ts
    if (m.ts > newest) newest = m.ts
  }

  return {
    count: userMems.length,
    capacity: MAX_CAPACITY,
    oldest,
    newest
  }
}
