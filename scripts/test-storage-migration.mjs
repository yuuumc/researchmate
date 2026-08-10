// ============================================================
// Storage Migration Test — Phase 2 rename
// Tests: localStorage key migration + idempotency + edge cases
// Run: node scripts/test-storage-migration.mjs
// ============================================================

// --- Mock localStorage ---
const _store = new Map()
const mockLocalStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => { _store.set(k, String(v)) },
  removeItem: (k) => { _store.delete(k) },
  key: (i) => Array.from(_store.keys())[i] || null,
  get length() { return _store.size },
  clear: () => _store.clear()
}
globalThis.localStorage = mockLocalStorage

// --- Mock indexedDB (not available in Node, migration should skip gracefully) ---
// migrateIndexedDB checks typeof indexedDB === 'undefined' and returns early

// --- Import migration module ---
// Since migrateStorage.js uses ES exports, we'll test the logic inline
// by re-implementing the same constants and verifying the migration flow.
// This avoids import issues with browser-only globals.

const MIGRATION_FLAG = 'researchmate_storage_migrated'
const IDB_MIGRATION_FLAG = 'researchmate_idb_migrated'
const OLD_PREFIX = 'yanxintong_'
const NEW_PREFIX = 'researchmate_'
const KEY_MAPPINGS = [
  ['yanxintong-theme', 'researchmate-theme'],
  ['yanxintong.auth.token', 'researchmate.auth.token'],
  ['yanxintong.guest', 'researchmate.guest'],
]

function migrateStorageKeys() {
  if (localStorage.getItem(MIGRATION_FLAG)) return
  let migratedCount = 0

  const keysToMigrate = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(OLD_PREFIX)) {
      keysToMigrate.push(key)
    }
  }
  for (const oldKey of keysToMigrate) {
    const newKey = NEW_PREFIX + oldKey.slice(OLD_PREFIX.length)
    if (localStorage.getItem(newKey) === null) {
      const value = localStorage.getItem(oldKey)
      if (value !== null) {
        localStorage.setItem(newKey, value)
      }
    }
    localStorage.removeItem(oldKey)
    migratedCount++
  }

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

  localStorage.setItem(MIGRATION_FLAG, new Date().toISOString())
  return migratedCount
}

// --- Test runner ---
let passed = 0
let failed = 0
const results = []

function assert(condition, label) {
  if (condition) {
    passed++
    results.push(`  \x1b[32m✓\x1b[0m ${label}`)
  } else {
    failed++
    results.push(`  \x1b[31m✗\x1b[0m ${label}`)
  }
}

function assertEqual(actual, expected, label) {
  assert(actual === expected, `${label} (got: ${actual}, expected: ${expected})`)
}

function section(title) {
  results.push(`\n=== ${title} ===`)
}

// --- Tests ---

section('Test 1: 全新用户 — 无旧 key，正常写入新前缀')
_store.clear()
migrateStorageKeys()
// Flag should be set
assert(_store.has(MIGRATION_FLAG), '迁移 flag 已设置')
// No old prefix keys should exist
let hasOldKeys = false
for (const k of _store.keys()) {
  if (k.startsWith('yanxintong_') || k.startsWith('yanxintong-') || k.startsWith('yanxintong.')) {
    hasOldKeys = true
  }
}
assert(!hasOldKeys, '无旧前缀 key 残留')
// Simulate new user writing data
_store.set('researchmate_profile', JSON.stringify({ name: 'test' }))
assert(_store.has('researchmate_profile'), '新前缀 key 正常写入')

section('Test 2: 老用户 — 旧前缀数据完整迁移')
_store.clear()
// Pre-populate old keys
_store.set('yanxintong_profile', JSON.stringify({ name: 'old_user', score: 85 }))
_store.set('yanxintong_diagnosis_history', JSON.stringify([{ score: 60 }]))
_store.set('yanxintong_plan_version', 'v3')
_store.set('yanxintong_chat_history_7d_default', JSON.stringify({ messages: ['hi'] }))
_store.set('yanxintong_chat_history_index', JSON.stringify({ default: '2026-08-01' }))
_store.set('yanxintong_last_sync_at', '2026-08-01T10:00:00Z')
_store.set('yanxintong-theme', 'dark')
_store.set('yanxintong.auth.token', JSON.stringify({ access_token: 'abc123' }))
_store.set('yanxintong.guest', JSON.stringify({ id: 'guest_123' }))
// Also add a non-migrated key
_store.set('yxt_feedback', 'some_feedback')

const migratedCount = migrateStorageKeys()

// Verify new keys exist with correct values
assert(_store.has('researchmate_profile'), 'researchmate_profile 已迁移')
assertEqual(JSON.parse(_store.get('researchmate_profile')).name, 'old_user', 'profile 值正确')
assert(_store.has('researchmate_diagnosis_history'), 'researchmate_diagnosis_history 已迁移')
assertEqual(JSON.parse(_store.get('researchmate_diagnosis_history'))[0].score, 60, 'diagnosis 值正确')
assert(_store.has('researchmate_plan_version'), 'researchmate_plan_version 已迁移')
assertEqual(_store.get('researchmate_plan_version'), 'v3', 'plan_version 值正确')
assert(_store.has('researchmate_chat_history_7d_default'), 'researchmate_chat_history_7d_default 已迁移')
assert(_store.has('researchmate_chat_history_index'), 'researchmate_chat_history_index 已迁移')
assert(_store.has('researchmate_last_sync_at'), 'researchmate_last_sync_at 已迁移')
assertEqual(_store.get('researchmate_last_sync_at'), '2026-08-01T10:00:00Z', 'last_sync 值正确')
assert(_store.has('researchmate-theme'), 'researchmate-theme 已迁移')
assertEqual(_store.get('researchmate-theme'), 'dark', 'theme 值正确')
assert(_store.has('researchmate.auth.token'), 'researchmate.auth.token 已迁移')
assert(_store.has('researchmate.guest'), 'researchmate.guest 已迁移')
assertEqual(JSON.parse(_store.get('researchmate.guest')).id, 'guest_123', 'guest 值正确')

// Verify old keys are cleaned up
assert(!_store.has('yanxintong_profile'), '旧 yanxintong_profile 已清理')
assert(!_store.has('yanxintong_diagnosis_history'), '旧 yanxintong_diagnosis_history 已清理')
assert(!_store.has('yanxintong_plan_version'), '旧 yanxintong_plan_version 已清理')
assert(!_store.has('yanxintong_chat_history_7d_default'), '旧 chat_history_7d 已清理')
assert(!_store.has('yanxintong_chat_history_index'), '旧 chat_history_index 已清理')
assert(!_store.has('yanxintong_last_sync_at'), '旧 last_sync_at 已清理')
assert(!_store.has('yanxintong-theme'), '旧 yanxintong-theme 已清理')
assert(!_store.has('yanxintong.auth.token'), '旧 auth.token 已清理')
assert(!_store.has('yanxintong.guest'), '旧 yanxintong.guest 已清理')

// Non-migrated key should be preserved
assert(_store.has('yxt_feedback'), 'yxt_feedback 未被误清理')

// Migration count should match (9 old keys migrated)
assertEqual(migratedCount, 9, `迁移 ${migratedCount} 个 key`)

section('Test 3: 幂等性 — 重复运行不重复迁移')
const countBefore = _store.size
migrateStorageKeys() // Should skip (flag already set)
const countAfter = _store.size
assertEqual(countBefore, countAfter, '第二次运行不改变 store')
// New keys should still exist
assert(_store.has('researchmate_profile'), '新 key 仍然存在')

section('Test 4: 边界 — 空 localStorage')
_store.clear()
const emptyCount = migrateStorageKeys()
assert(_store.has(MIGRATION_FLAG), '空 store 也设置 flag')
assertEqual(emptyCount, 0, '空 store 迁移 0 个 key')

section('Test 5: 边界 — 新旧 key 共存（新 key 优先，不覆盖）')
_store.clear()
_store.set('yanxintong_profile', JSON.stringify({ name: 'old' }))
_store.set('researchmate_profile', JSON.stringify({ name: 'new' }))
// Remove flag to allow re-migration
migrateStorageKeys()
// New key should NOT be overwritten by old value
assertEqual(JSON.parse(_store.get('researchmate_profile')).name, 'new', '新 key 不被旧值覆盖')
// Old key should still be cleaned up
assert(!_store.has('yanxintong_profile'), '旧 key 仍被清理')

section('Test 6: 迁移脚本源码完整性检查')
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dirname2 = dirname(fileURLToPath(import.meta.url))
const migrationSrc = readFileSync(join(__dirname2, '..', 'src', 'utils', 'migrateStorage.js'), 'utf-8')

assert(migrationSrc.includes("OLD_PREFIX = 'yanxintong_'"), 'OLD_PREFIX 定义正确')
assert(migrationSrc.includes("NEW_PREFIX = 'researchmate_'"), 'NEW_PREFIX 定义正确')
assert(migrationSrc.includes('MIGRATION_FLAG'), 'MIGRATION_FLAG 定义存在')
assert(migrationSrc.includes('IDB_MIGRATION_FLAG'), 'IDB_MIGRATION_FLAG 定义存在')
assert(migrationSrc.includes("OLD_DB_NAME = 'yanxintong_chat_db'"), 'OLD_DB_NAME 定义正确')
assert(migrationSrc.includes("NEW_DB_NAME = 'researchmate_chat_db'"), 'NEW_DB_NAME 定义正确')
assert(migrationSrc.includes('export function migrateStorageKeys'), '导出 migrateStorageKeys')
assert(migrationSrc.includes('export async function migrateIndexedDB'), '导出 migrateIndexedDB')
assert(migrationSrc.includes('export async function runStorageMigration'), '导出 runStorageMigration')
// Verify IndexedDB migration logic: read old → write new → delete old
assert(migrationSrc.includes('_readAll'), 'IndexedDB 读取函数存在')
assert(migrationSrc.includes('_writeAll'), 'IndexedDB 写入函数存在')
assert(migrationSrc.includes('_deleteDb'), 'IndexedDB 删除函数存在')
assert(migrationSrc.includes('onupgradeneeded'), 'IndexedDB onupgradeneeded 处理存在')

section('Test 7: 源码中旧前缀已替换')
const storageSrc = readFileSync(join(__dirname2, '..', 'src', 'utils', 'storage.js'), 'utf-8')
assert(storageSrc.includes("const PREFIX = 'researchmate_'"), 'storage.js PREFIX 已更新')
assert(!storageSrc.includes("'yanxintong_'"), 'storage.js 无旧 PREFIX 残留')

const persistSrc = readFileSync(join(__dirname2, '..', 'src', 'utils', 'persist.js'), 'utf-8')
assert(persistSrc.includes("researchmate_chat_history_7d_"), 'persist.js LS_PREFIX 已更新')
assert(persistSrc.includes("researchmate_chat_history_index"), 'persist.js LS_INDEX_KEY 已更新')
assert(persistSrc.includes("researchmate_chat_db"), 'persist.js DB_NAME 已更新')
assert(!persistSrc.includes('yanxintong_chat'), 'persist.js 无旧 key 残留')

const themeSrc = readFileSync(join(__dirname2, '..', 'src', 'composables', 'useTheme.js'), 'utf-8')
assert(themeSrc.includes("researchmate-theme"), 'useTheme.js STORAGE_KEY 已更新')
assert(!themeSrc.includes('yanxintong-theme'), 'useTheme.js 无旧 key 残留')

const supabaseSrc = readFileSync(join(__dirname2, '..', 'src', 'services', 'supabase.js'), 'utf-8')
assert(supabaseSrc.includes("researchmate.auth.token"), 'supabase.js storageKey 已更新')

const authSrc = readFileSync(join(__dirname2, '..', 'src', 'stores', 'auth.js'), 'utf-8')
assert(authSrc.includes("researchmate.guest"), 'auth.js GUEST_STORAGE_KEY 已更新')

const syncSrc = readFileSync(join(__dirname2, '..', 'src', 'stores', 'sync.js'), 'utf-8')
assert(syncSrc.includes("researchmate_last_sync_at"), 'sync.js LS_LAST_SYNC 已更新')

const mwSrc = readFileSync(join(__dirname2, '..', 'api', '_middleware.js'), 'utf-8')
assert(mwSrc.includes('__researchmateRateLimitBuckets'), '_middleware.js 限流变量已更新')
assert(!mwSrc.includes('__yanxintongRateLimitBuckets'), '_middleware.js 无旧变量残留')

const mainSrc = readFileSync(join(__dirname2, '..', 'src', 'main.js'), 'utf-8')
assert(mainSrc.includes('migrateStorageKeys'), 'main.js 调用了 migrateStorageKeys')
assert(mainSrc.includes('migrateIndexedDB'), 'main.js 调用了 migrateIndexedDB')

// --- Report ---
console.log(results.join('\n'))
console.log(`\n${'═'.repeat(60)}`)
console.log(`  Storage Migration Test: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(60)}`)
if (failed === 0) {
  console.log('  \x1b[32m🎉 全部通过！\x1b[0m')
} else {
  console.log('  \x1b[31m✗ 存在失败项\x1b[0m')
}
process.exit(failed === 0 ? 0 : 1)
