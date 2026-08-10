// ============================================================
// Storage Key 迁移脚本（改名 phase 2）
// ============================================================
// 一次性迁移：yanxintong_* → researchmate_*
// 在 app 启动时调用，localStorage 同步迁移 + IndexedDB 异步迁移。
// 幂等：已迁移过则跳过（通过 flag 标记）。
// ============================================================

const MIGRATION_FLAG = 'researchmate_storage_migrated'
const IDB_MIGRATION_FLAG = 'researchmate_idb_migrated'
const OLD_PREFIX = 'yanxintong_'
const NEW_PREFIX = 'researchmate_'

// 非前缀格式的旧 key → 新 key 显式映射
const KEY_MAPPINGS = [
  ['yanxintong-theme', 'researchmate-theme'],
  ['yanxintong.auth.token', 'researchmate.auth.token'],
  ['yanxintong.guest', 'researchmate.guest'],
]

// IndexedDB
const OLD_DB_NAME = 'yanxintong_chat_db'
const NEW_DB_NAME = 'researchmate_chat_db'
const DB_VERSION = 1
const STORE = 'history'

/**
 * 迁移 localStorage：扫描所有 yanxintong_ 前缀 key → researchmate_ 前缀，
 * 以及非前缀格式的显式映射 key。
 * 同步执行，在 app.mount() 之前调用。
 * 幂等：通过 MIGRATION_FLAG 防止重复执行。
 */
export function migrateStorageKeys() {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem(MIGRATION_FLAG)) return

  let migratedCount = 0

  // 1. 前缀 key 迁移：yanxintong_* → researchmate_*
  const keysToMigrate = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(OLD_PREFIX)) {
      keysToMigrate.push(key)
    }
  }
  for (const oldKey of keysToMigrate) {
    const newKey = NEW_PREFIX + oldKey.slice(OLD_PREFIX.length)
    // 仅在新 key 不存在时复制（避免覆盖已写入的新数据）
    if (localStorage.getItem(newKey) === null) {
      const value = localStorage.getItem(oldKey)
      if (value !== null) {
        localStorage.setItem(newKey, value)
      }
    }
    localStorage.removeItem(oldKey)
    migratedCount++
  }

  // 2. 非前缀 key 显式迁移
  for (const [oldKey, newKey] of KEY_MAPPINGS) {
    const value = localStorage.getItem(oldKey)
    if (value !== null) {
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, value)
      }
      localStorage.removeItem(oldKey)
      migratedCount++
    }
  }

  // 3. 标记迁移完成
  localStorage.setItem(MIGRATION_FLAG, new Date().toISOString())

  if (migratedCount > 0) {
    console.info(
      `[migrateStorage] localStorage: ${migratedCount} keys migrated ` +
      `from yanxintong_* to researchmate_*`
    )
  }
}

/**
 * 迁移 IndexedDB：yanxintong_chat_db → researchmate_chat_db
 * 读取旧库全部记录 → 写入新库 → 删除旧库。
 * 异步执行，在 bootstrap() 中非阻塞调用。
 * 幂等：通过 IDB_MIGRATION_FLAG 防止重复执行。
 */
export async function migrateIndexedDB() {
  if (typeof indexedDB === 'undefined') return
  if (localStorage.getItem(IDB_MIGRATION_FLAG)) return

  try {
    // 尝试打开旧库（不存在则 onerror → resolve(null)）
    const oldDb = await _openDb(OLD_DB_NAME)
    if (!oldDb) {
      // 旧库不存在，无需迁移
      localStorage.setItem(IDB_MIGRATION_FLAG, new Date().toISOString())
      return
    }

    // 读取旧库全部记录
    const records = await _readAll(oldDb)
    oldDb.close()

    if (records.length === 0) {
      // 旧库为空，直接删除
      await _deleteDb(OLD_DB_NAME)
      localStorage.setItem(IDB_MIGRATION_FLAG, new Date().toISOString())
      return
    }

    // 打开新库（不存在则创建，触发 onupgradeneeded 建 object store）
    const newDb = await _openDb(NEW_DB_NAME)
    if (!newDb) {
      console.warn('[migrateStorage] Failed to open new IndexedDB, keeping old DB')
      return
    }

    // 写入全部记录到新库
    const writeOk = await _writeAll(newDb, records)
    newDb.close()

    if (!writeOk) {
      console.warn('[migrateStorage] Failed to write records to new DB, keeping old DB')
      return
    }

    // 删除旧库
    await _deleteDb(OLD_DB_NAME)

    localStorage.setItem(IDB_MIGRATION_FLAG, new Date().toISOString())
    console.info(
      `[migrateStorage] IndexedDB: ${records.length} records migrated ` +
      `from ${OLD_DB_NAME} to ${NEW_DB_NAME}`
    )
  } catch (e) {
    console.error('[migrateStorage] IndexedDB migration failed:', e)
    // 不设 flag，下次启动重试
  }
}

/**
 * 完整迁移入口：localStorage（同步）+ IndexedDB（异步）。
 * 也可单独调用 migrateStorageKeys() 或 migrateIndexedDB()。
 */
export async function runStorageMigration() {
  try {
    migrateStorageKeys()
    await migrateIndexedDB()
  } catch (e) {
    console.error('[migrateStorage] Migration failed:', e)
  }
}

// ============== 内部辅助函数 ==============

function _openDb(name) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(name, DB_VERSION)
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
      req.onerror = () => resolve(null)
    } catch (e) {
      resolve(null)
    }
  })
}

function _readAll(db) {
  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE)) {
        resolve([])
        return
      }
      const tx = db.transaction(STORE, 'readonly')
      const os = tx.objectStore(STORE)
      const req = os.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => resolve([])
    } catch (e) {
      resolve([])
    }
  })
}

function _writeAll(db, records) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const os = tx.objectStore(STORE)
      for (const record of records) {
        os.put(record)
      }
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    } catch (e) {
      resolve(false)
    }
  })
}

function _deleteDb(name) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
      req.onblocked = () => resolve(false)
    } catch (e) {
      resolve(false)
    }
  })
}
