// ============================================================
// 对话历史持久化（v1.5 新增）
// ============================================================
// 双层存储：
//   1. localStorage 7 天热数据：key = researchmate_chat_history_7d_<userId>
//      - 写入即带 TTL（expireAt）
//   2. IndexedDB 长期归档：researchmate_chat_db → 'history' object store
//      - 按月分桶（YYYY-MM），便于查询
//
// 公开 API：
//   saveRecent(userId, messages)        保存最近会话到 localStorage
//   loadRecent(userId)                  读取 7 天内有效记录
//   clearExpiredRecent()                清理过期项（启动时调用）
//   archiveAll(userId, messages)        长期归档到 IndexedDB
//   loadAll(userId)                     读取全部历史
//   loadByMonth(userId, 'YYYY-MM')      按月读取
// ============================================================

const LS_PREFIX = 'researchmate_chat_history_7d_'
const LS_INDEX_KEY = 'researchmate_chat_history_index'  // 记录哪些 userId 有数据（用于清理）
const DB_NAME = 'researchmate_chat_db'
const DB_VERSION = 1
const STORE = 'history'

// ============== localStorage 7d ==============

function lsKey(userId) {
  return `${LS_PREFIX}${userId || 'default'}`
}

function readLs(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    console.error('[persist] localStorage read failed:', e)
    return null
  }
}

function writeLs(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (e) {
    if (e?.name === 'QuotaExceededError') {
      console.warn('[persist] localStorage 配额超限，清理最旧记录')
      evictOldestLs()
      try {
        localStorage.setItem(key, JSON.stringify(value))
        return true
      } catch (e2) {
        console.error('[persist] localStorage 写入仍失败:', e2)
        return false
      }
    }
    console.error('[persist] localStorage write failed:', e)
    return false
  }
}

function evictOldestLs() {
  try {
    const all = Object.keys(localStorage)
      .filter((k) => k.startsWith(LS_PREFIX))
      .map((k) => {
        try { return { k, data: JSON.parse(localStorage.getItem(k)) } } catch { return null }
      })
      .filter(Boolean)
      .filter((x) => x.data?.savedAt)
      .sort((a, b) => new Date(a.data.savedAt) - new Date(b.data.savedAt))
    if (all.length > 0) {
      localStorage.removeItem(all[0].k)
    }
  } catch (e) {
    console.error('[persist] evictOldestLs failed:', e)
  }
}

function touchIndex(userId) {
  try {
    const idx = readLs(LS_INDEX_KEY) || {}
    idx[userId || 'default'] = new Date().toISOString()
    localStorage.setItem(LS_INDEX_KEY, JSON.stringify(idx))
  } catch {}
}

/**
 * 保存最近 7 天对话
 * @param {string} userId
 * @param {Array} messages - 完整消息数组
 */
export function saveRecent(userId, messages) {
  if (!Array.isArray(messages)) return false
  const now = Date.now()
  const data = {
    userId: userId || 'default',
    messages,
    savedAt: new Date(now).toISOString(),
    expireAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    version: 1
  }
  const ok = writeLs(lsKey(userId), data)
  if (ok) touchIndex(userId)
  return ok
}

/**
 * 读取 7 天内有效记录
 * @param {string} userId
 * @returns {Array|null} messages 数组或 null
 */
export function loadRecent(userId) {
  const data = readLs(lsKey(userId))
  if (!data) return null
  // TTL 检查
  if (data.expireAt && new Date(data.expireAt).getTime() < Date.now()) {
    try { localStorage.removeItem(lsKey(userId)) } catch {}
    return null
  }
  return Array.isArray(data.messages) ? data.messages : null
}

/**
 * 清理过期的 7 天记录（启动时调用）
 */
export function clearExpiredRecent() {
  try {
    const now = Date.now()
    Object.keys(localStorage)
      .filter((k) => k.startsWith(LS_PREFIX))
      .forEach((k) => {
        try {
          const d = JSON.parse(localStorage.getItem(k))
          if (d?.expireAt && new Date(d.expireAt).getTime() < now) {
            localStorage.removeItem(k)
          }
        } catch {}
      })
  } catch (e) {
    console.error('[persist] clearExpiredRecent failed:', e)
  }
}

// ============== IndexedDB 长期 ==============

let _dbPromise = null

function openDb() {
  if (_dbPromise) return _dbPromise
  if (typeof indexedDB === 'undefined') {
    _dbPromise = Promise.resolve(null)
    return _dbPromise
  }
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' })
        os.createIndex('userId', 'userId', { unique: false })
        os.createIndex('month', 'month', { unique: false })
        os.createIndex('savedAt', 'savedAt', { unique: false })
      }
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = (e) => {
      console.warn('[persist] IndexedDB 打开失败，将降级为 localStorage:', e.target.error)
      resolve(null)
    }
  })
  return _dbPromise
}

function monthKey(iso) {
  return (iso || new Date().toISOString()).slice(0, 7)
}

function genId(userId, month) {
  return `${userId || 'default'}__${month || monthKey()}`
}

/**
 * 归档当前会话到 IndexedDB（按月分桶）
 * @param {string} userId
 * @param {Array} messages
 */
export async function archiveAll(userId, messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false
  try {
    const db = await openDb()
    if (!db) return false
    const now = new Date()
    const month = monthKey(now.toISOString())
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      const os = tx.objectStore(STORE)
      const record = {
        id: genId(userId, month),
        userId: userId || 'default',
        month,
        // v2.5.1 hotfix: Vue 响应式 Proxy 无法被 IndexedDB structured clone，
        // 先 JSON 往返打平成普通对象再 put（否则 DataCloneError）
        messages: JSON.parse(JSON.stringify(messages)),
        savedAt: now.toISOString(),
        size: messages.length
      }
      const req = os.put(record)
      req.onsuccess = () => resolve(true)
      req.onerror = () => {
        console.warn('[persist] IndexedDB 写入失败:', req.error)
        resolve(false)
      }
    })
  } catch (e) {
    console.error('[persist] archiveAll failed:', e)
    return false
  }
}

/**
 * 读取全部历史（按 savedAt 升序）
 * @param {string} userId
 * @returns {Array} 全部消息（按月合并、按时间排序）
 */
export async function loadAll(userId) {
  try {
    const db = await openDb()
    if (!db) return []
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const os = tx.objectStore(STORE)
      const idx = os.index('userId')
      const req = idx.getAll(userId || 'default')
      req.onsuccess = () => {
        const records = req.result || []
        // 多月合并
        const all = records
          .sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt))
          .flatMap((r) => r.messages || [])
        resolve(all)
      }
      req.onerror = () => resolve([])
    })
  } catch (e) {
    console.error('[persist] loadAll failed:', e)
    return []
  }
}

/**
 * 按月读取
 * @param {string} userId
 * @param {string} month - 'YYYY-MM'
 */
export async function loadByMonth(userId, month) {
  try {
    const db = await openDb()
    if (!db) return []
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const os = tx.objectStore(STORE)
      const req = os.get(genId(userId, month))
      req.onsuccess = () => {
        const rec = req.result
        resolve(Array.isArray(rec?.messages) ? rec.messages : [])
      }
      req.onerror = () => resolve([])
    })
  } catch (e) {
    console.error('[persist] loadByMonth failed:', e)
    return []
  }
}

/**
 * 列出已有月份
 */
export async function listMonths(userId) {
  try {
    const db = await openDb()
    if (!db) return []
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const os = tx.objectStore(STORE)
      const idx = os.index('userId')
      const req = idx.getAll(userId || 'default')
      req.onsuccess = () => {
        const months = (req.result || [])
          .map((r) => r.month)
          .filter(Boolean)
          .sort()
        resolve(months)
      }
      req.onerror = () => resolve([])
    })
  } catch (e) {
    console.error('[persist] listMonths failed:', e)
    return []
  }
}
