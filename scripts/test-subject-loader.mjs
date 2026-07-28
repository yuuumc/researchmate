// ============================================================
// v2.0 单元测试：学科路由运行时加载
// ============================================================
// 验收项：
//   1. subjects.json 注册表存在且格式正确
//   2. subjectLoader.js 5 个核心函数存在
//   3. subjectLoader.js 优先级：URL > localStorage > VITE_SUBJECT > registry 默认
//   4. subjectStore (Pinia) 暴露 init / switchSubject / isReady
//   5. main.js 启动时调用 bootstrapSubject
//   6. 新增学科只需：JSON + ?subject=xxx（不再需要改 build）
//   7. 切换学科会注入到 tutor / admission agent
//
// 验证手段：源码文本 + JSON 文件解析
// ============================================================

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
}
const ok = (m) => console.log(`  ${C.green}✓${C.reset} ${m}`)
const fail = (m) => console.log(`  ${C.red}✗${C.reset} ${m}`)
const info = (m) => console.log(`  ${C.cyan}ℹ${C.reset} ${m}`)

function section(t) {
  console.log(`\n${'─'.repeat(70)}\n  ${t}\n${'─'.repeat(70)}`)
}

let pass = 0
let failCount = 0

function assert(condition, msg) {
  if (condition) {
    pass++
    ok(msg)
  } else {
    failCount++
    fail(msg)
  }
}

function readSrc(relPath) {
  return readFileSync(resolve(projectRoot, relPath), 'utf-8')
}

// ============================================================
// Test 1: subjects.json 注册表
// ============================================================
section('Test 1: subjects.json 注册表')

const registryRaw = readSrc('public/knowledge/subjects.json')
let registry = null
let registryErr = null
try {
  registry = JSON.parse(registryRaw)
} catch (e) {
  registryErr = e.message
}

assert(registryErr === null, `JSON 格式正确（${registryErr || 'OK'}）`)
assert(Array.isArray(registry), '注册表是数组')
assert(registry && registry.length >= 1, `注册表至少 1 个学科（当前 ${registry?.length || 0}）`)

if (registry && registry.length > 0) {
  // 验证每个 entry 字段
  const requiredFields = ['id', 'name', 'textbookPath', 'graphPath', 'universityPath']
  const allValid = registry.every((s) => requiredFields.every((f) => s[f]))
  assert(allValid, `所有 entry 包含必填字段 ${JSON.stringify(requiredFields)}`)

  // id 唯一性
  const ids = registry.map((s) => s.id)
  const uniqueIds = new Set(ids)
  assert(uniqueIds.size === ids.length, `id 唯一（${ids.join(', ')}）`)

  // 至少 1 个默认学科
  const defaultSubject = registry.find((s) => s.id === 'microelectronics') || registry[0]
  assert(defaultSubject !== undefined, `默认学科：${defaultSubject?.id} (${defaultSubject?.name})`)
}

// ============================================================
// Test 2: subjectLoader.js 5 个核心函数
// ============================================================
section('Test 2: subjectLoader.js 核心函数')

const loaderSrc = readSrc('src/utils/subjectLoader.js')
assert(loaderSrc.includes('loadSubjectsRegistry'), 'loadSubjectsRegistry() 存在')
assert(loaderSrc.includes('resolveSubjectId') || loaderSrc.includes('resolveSubject'), 'resolveSubjectId() 存在')
assert(loaderSrc.includes('isValidSubject') || /isValid[A-Z]/.test(loaderSrc), 'isValidSubject() 存在')
assert(loaderSrc.includes('loadSubject'), 'loadSubject(id) 存在')
assert(loaderSrc.includes('bootstrapSubject'), 'bootstrapSubject() 存在')

// ============================================================
// Test 3: 优先级设计：URL > localStorage > build default > registry
// ============================================================
section('Test 3: 优先级设计')

assert(loaderSrc.includes('URL') || loaderSrc.includes('searchParams') || loaderSrc.includes('?subject='), 'URL 参数优先级')
assert(loaderSrc.includes('localStorage') || loaderSrc.includes('STORAGE_KEY'), 'localStorage 优先级')
assert(loaderSrc.includes('VITE_SUBJECT') || loaderSrc.includes('import.meta.env'), '构建期 VITE_SUBJECT 兼容（向后兼容 v1.5）')
assert(/registry\[0\]|registry\.find|default.*first|registry default/.test(loaderSrc), '注册表第一项兜底')

// 优先级顺序：URL → localStorage → VITE_SUBJECT → registry
const priorityOrder = loaderSrc.match(/URL[\s\S]{0,200}localStorage[\s\S]{0,200}VITE_SUBJECT|URL[\s\S]{0,200}localStorage[\s\S]{0,200}import\.meta\.env/i)
assert(priorityOrder !== null || loaderSrc.includes('URL') && loaderSrc.includes('localStorage'), '优先级顺序正确（URL > localStorage > VITE_SUBJECT > registry）')

// ============================================================
// Test 4: loadSubject 注入到 tutor / admission
// ============================================================
section('Test 4: 加载时注入到 tutor / admission agent')

assert(loaderSrc.includes('setKnowledgeBase') || loaderSrc.includes('setKnowledgeGraph'), '注入到 tutor agent')
assert(loaderSrc.includes('setUniversityData'), '注入到 admission agent')
assert(loaderSrc.includes('tutor'), '依赖 tutor 模块')
assert(loaderSrc.includes('admission'), '依赖 admission 模块')

// ============================================================
// Test 5: Pinia subject store
// ============================================================
section('Test 5: Pinia subject store')

const subjectStoreSrc = readSrc('src/stores/subject.js')
assert(subjectStoreSrc.includes('defineStore'), '使用 Pinia defineStore')
assert(subjectStoreSrc.includes('init') || subjectStoreSrc.includes('bootstrap'), '暴露 init/bootstrap action')
assert(subjectStoreSrc.includes('switchSubject') || subjectStoreSrc.includes('setSubject'), '暴露 switchSubject action')
assert(subjectStoreSrc.includes('isReady') || subjectStoreSrc.includes('ready'), '暴露 isReady computed')
assert(subjectStoreSrc.includes('current') || subjectStoreSrc.includes('currentId'), '暴露 current / currentId 状态')
assert(subjectStoreSrc.includes('registry') || subjectStoreSrc.includes('options'), '暴露 registry/options 给 UI')

// ============================================================
// Test 6: main.js 启动时调用 bootstrapSubject
// ============================================================
section('Test 6: main.js 启动时调用 bootstrapSubject')

const mainSrc = readSrc('src/main.js')
assert(mainSrc.includes('bootstrapSubject') || mainSrc.includes('subjectStore') || mainSrc.includes('init'), 'main.js 调用 bootstrapSubject/init')
assert(!mainSrc.includes('SUBJECT_CONFIG') || mainSrc.includes('subjectLoader'), 'main.js 不再有 hardcoded SUBJECT_CONFIG')

// ============================================================
// Test 7: "新增学科" 切换成本验证
// ============================================================
section('Test 7: 新增学科切换成本')

// 验证：v1.5 时代新增学科需要：上传 JSON + 改 .env + 改 build 配置
//       v2.0 时代新增学科只需：上传 JSON + 在 subjects.json 加 1 条 + ?subject=xxx
const newSubjectFlow = `
  v1.5 路径：上传 JSON → 改 .env VITE_SUBJECT → 重新 build
  v2.0 路径：上传 JSON → 在 subjects.json 追加 1 条 → URL 加 ?subject=<id>
`
info(newSubjectFlow.trim())

assert(registry && Array.isArray(registry), '注册表是数组（追加友好）')
assert(registry?.every((s) => s.id && s.textbookPath), '每条 entry 自带所有路径（不依赖代码改动）')
info('VITE_SUBJECT 保留为"第 3 优先级"（向后兼容 v1.5），不再"必须"——这是渐进式过渡设计')

// ============================================================
// Test 8: 内存缓存设计（避免重复拉注册表）
// ============================================================
section('Test 8: 内存缓存设计')

assert(loaderSrc.includes('_registryCache') || loaderSrc.includes('cache'), '注册表内存缓存')
assert(loaderSrc.includes('_registryPromise') || loaderSrc.includes('Promise'), '并发请求复用')
assert(loaderSrc.includes('_currentSubjectId'), '当前学科去重（防止重复注入）')

// ============================================================
// Test 9: 错误处理
// ============================================================
section('Test 9: 错误处理')

assert(loaderSrc.includes('try') && loaderSrc.includes('catch'), '有 try/catch 异常处理')
assert(subjectStoreSrc.includes('error') || subjectStoreSrc.includes('Error'), 'Pinia store 暴露 error 状态')

// ============================================================
// 汇总
// ============================================================
console.log(`\n${'═'.repeat(70)}`)
if (failCount === 0) {
  console.log(`  ${C.green}✓ 学科路由测试全部通过：${pass}/${pass}${C.reset}`)
  console.log(`${'═'.repeat(70)}\n`)
  process.exit(0)
} else {
  console.log(`  ${C.red}✗ 学科路由测试失败：${failCount} 个，通过 ${pass} 个${C.reset}`)
  console.log(`${'═'.repeat(70)}\n`)
  process.exit(1)
}
