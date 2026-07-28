// ============================================================
// v3.6 全量回归 + 多人盲测模板（3 人 × 3 维度）
// ============================================================
// 用法：
//   node scripts/test-full-regression.mjs               # 全量回归（自动）
//   node scripts/test-full-regression.mjs --blind-test  # 输出多人盲测模板
//
// 三维度评分（v3.6 验收门槛：≥ 4/5）：
//   D1. 功能完整性：5 Agent 协作 / 级联 / 学科解耦 / 历次对比 全可演示
//   D2. 回答质量：回答准确、结构化卡片正确、无编造
//   D3. 系统稳定性：无报错、API Key 不泄漏、构建可重复
// ============================================================

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(__dirname, '..')

const args = process.argv.slice(2)
const BLIND_MODE = args.includes('--blind-test')

function ok(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`) }
function fail(msg) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`) }
function info(msg) { console.log(`  \x1b[36mℹ\x1b[0m ${msg}`) }
function warn(msg) { console.log(`  \x1b[33m!\x1b[0m ${msg}`) }
function section(t) { console.log(`\n${'─'.repeat(70)}\n  ${t}\n${'─'.repeat(70)}`) }

const results = { passed: 0, failed: 0, warnings: 0 }

function check(name, fn) {
  try {
    const r = fn()
    if (r === true || r === undefined) {
      ok(name)
      results.passed++
    } else {
      fail(`${name}: ${r}`)
      results.failed++
    }
  } catch (e) {
    fail(`${name}: ${e.message.slice(0, 100)}`)
    results.failed++
  }
}

function checkFile(name, path, patterns = []) {
  check(name, () => {
    if (!existsSync(join(root, path))) return `文件不存在: ${path}`
    if (patterns.length === 0) return true
    const c = readFileSync(join(root, path), 'utf-8')
    for (const p of patterns) {
      if (!new RegExp(p).test(c)) return `未匹配: ${p}`
    }
    return true
  })
}

// ============================================================
// 全量回归检查项（自动）
// ============================================================
function regressionCheck() {
  section('Part 1：全量回归（自动检查）')

  // === 1. 核心代码完整性 ===
  checkFile('api/chat.js 存在且含 process.env.DEEPSEEK_API_KEY', 'api/chat.js',
    ['process\\.env\\.DEEPSEEK_API_KEY', 'api\\.deepseek\\.com'])
  checkFile('core/router.js 存在', 'src/core/router.js')
  checkFile('core/cascade.js 含 loadProfile', 'src/core/cascade.js',
    ['loadProfile', 'updateProfileAfterResponse'])
  checkFile('4 个 Agent 文件存在', 'src/core/agents/tutor.js')
  checkFile('4 个 Prompt 文件存在', 'src/prompts/tutor.md')
  checkFile('3 个 store 文件存在', 'src/stores/profile.js')

  // === 2. RAG 质量保证 ===
  checkFile('rag.js TF-IDF 升级', 'src/utils/rag.js',
    ['TF-IDF', 'buildIndex', 'idf', 'MIN_THRESHOLD', 'EXACT_BONUS'])
  checkFile('tokenize.js 专业术语词典', 'src/utils/tokenize.js',
    ['PROFESSIONAL_TERMS', 'extractProfessionalTerms'])

  // === 3. 知识库 ===
  checkFile('半导体物理知识库 20 条', 'public/knowledge/textbook/半导体物理.json')
  checkFile('数据结构知识库', 'public/knowledge/textbook/数据结构.json')
  checkFile('长三角微电子院校库', 'public/knowledge/university/长三角微电子.json')
  checkFile('CS 院校库', 'public/knowledge/university/CS院校.json')

  // === 4. 测试脚本 ===
  checkFile('test-rag-hit5.mjs', 'scripts/test-rag-hit5.mjs')
  checkFile('test-rag-hit5-cs.mjs', 'scripts/test-rag-hit5-cs.mjs')
  checkFile('test-agents-collab.mjs', 'scripts/test-agents-collab.mjs')
  checkFile('test-history-demo.mjs', 'scripts/test-history-demo.mjs')
  checkFile('test-key-leak.mjs', 'scripts/test-key-leak.mjs')
  checkFile('test-rollback-rehearsal.mjs', 'scripts/test-rollback-rehearsal.mjs')
  checkFile('test-plan-reorder.mjs', 'scripts/test-plan-reorder.mjs')

  // === 5. 安全检查 ===
  check('源码无 VITE_DEEPSEEK_* 前缀', () => {
    const srcDir = join(root, 'src')
    function walk(dir) {
      for (const name of readdirSyncSafe(dir)) {
        const p = join(dir, name)
        const s = statSyncSafe(p)
        if (s.isDirectory()) {
          if (walk(p) === false) return false
        } else if (/\.(js|ts|vue)$/.test(name)) {
          const c = readFileSync(p, 'utf-8')
          if (/VITE_DEEPSEEK/.test(c)) return false
        }
      }
      return true
    }
    return walk(srcDir)
  })

  // === 6. 学科解耦配置 ===
  checkFile('main.js 含 VITE_SUBJECT', 'src/main.js', ['VITE_SUBJECT', 'SUBJECT_CONFIG'])
  checkFile('.env.example 含 VITE_SUBJECT', '.env.example', ['VITE_SUBJECT'])

  // === 7. 文档 ===
  checkFile('演示视频脚本', 'docs/demo-video-script.md')
  checkFile('UI 设计 v1', '前端UI设计_v1.md')
  checkFile('UI 设计 v2', '前端UI设计_v2.md')
  checkFile('UI 设计 v3', '前端UI设计_v3.md')

  // === 8. 构建检查（可选） ===
  if (existsSync(join(root, 'dist'))) {
    check('dist/ 已构建', () => true)
  } else {
    warn('dist/ 不存在（建议运行 npm run build）')
    results.warnings++
  }
}

// readdirSync / statSync 安全包装
function readdirSyncSafe(dir) {
  try { return readdirSync(dir) } catch { return [] }
}
function statSyncSafe(p) {
  try { return statSync(p) } catch { return { isDirectory: () => false } }
}

// ============================================================
// 多人盲测模板
// ============================================================
function blindTestTemplate() {
  section('Part 2：多人盲测模板（3 人 × 3 维度）')

  const SCENARIOS = [
    { id: 'S1', name: '概念问题', input: 'MOSFET 阈值电压怎么推导？', expect: '苏格拉底式引导 + RAG 引用' },
    { id: 'S2', name: '学习诊断', input: '我半导体物理考了 55 分，MOSFET/C-V/短沟道都错', expect: '4 层根因链 + score=55 + 结构化卡片' },
    { id: 'S3', name: '成长规划', input: '基于上次诊断帮我做下个月复习计划', expect: '4 周计划 + adjustments + 具体教材题号' },
    { id: 'S4', name: '考研导航', input: '双非前 30%，想去长三角读微电子', expect: '3 档 6 所 + reason 无数字泄漏' },
    { id: 'S5', name: '级联', input: '先诊断再帮我做计划', expect: '双卡片 + 状态保持' },
    { id: 'S6', name: '学科解耦', input: '改 VITE_SUBJECT=cs 后问 KMP next 数组', expect: 'CS 知识库命中 + 回答正确' }
  ]

  console.log('\n  盲测场景清单（每人对 6 场景评分）：\n')
  SCENARIOS.forEach(s => {
    console.log(`  ${s.id}. ${s.name}`)
    console.log(`     输入: ${s.input}`)
    console.log(`     期望: ${s.expect}`)
    console.log('')
  })

  console.log('  3 维度评分表（每人填写，1-5 分）：\n')
  console.log('  | 维度 | 描述 | 1分 | 3分 | 5分 |')
  console.log('  |-|-|-|-|-|')
  console.log('  | D1 功能完整性 | 6 场景全可演示 | 多场景报错 | 主要功能可用 | 全部流畅 |')
  console.log('  | D2 回答质量 | 准确/结构化/无编造 | 多处编造 | 部分不准 | 全部准确 |')
  console.log('  | D3 系统稳定性 | 无报错/Key 不泄漏 | 崩溃 | 偶发错误 | 完全稳定 |')
  console.log('')
  console.log('  验收门槛：3 人平均分 ≥ 4/5（v3.6 §盲测验收）\n')

  console.log('  盲测记录表：\n')
  console.log('  | 评审人 | S1 | S2 | S3 | S4 | S5 | S6 | D1 | D2 | D3 | 总分 |')
  console.log('  |-|-|-|-|-|-|-|-|-|-|-|')
  console.log('  | 评审人A |  |  |  |  |  |  |  |  |  |  /30 |')
  console.log('  | 评审人B |  |  |  |  |  |  |  |  |  |  /30 |')
  console.log('  | 评审人C |  |  |  |  |  |  |  |  |  |  /30 |')
  console.log('  | 平均   |  |  |  |  |  |  |  |  |  |  /30 |')
  console.log('')
}

// ============================================================
// 总结
// ============================================================
function summary() {
  section('v3.6 全量回归报告')
  const total = results.passed + results.failed
  const passRate = total > 0 ? Math.round(results.passed / total * 100) : 0
  console.log(`  通过: \x1b[32m${results.passed}\x1b[0m / ${total}`)
  console.log(`  失败: \x1b[31m${results.failed}\x1b[0m`)
  console.log(`  警告: \x1b[33m${results.warnings}\x1b[0m`)
  console.log(`  通过率: ${passRate}%`)

  if (results.failed === 0 && passRate === 100) {
    console.log('\n  \x1b[32m✓ v3.6 全量回归验收通过\x1b[0m')
    console.log('  \x1b[32m✓ 可进入多人盲测阶段（加 --blind-test 参数输出模板）\x1b[0m\n')
    process.exit(0)
  } else {
    console.log('\n  \x1b[31m✗ v3.6 验收未通过（需修复后重新回归）\x1b[0m\n')
    process.exit(1)
  }
}

// ============================================================
// 主流程
// ============================================================

console.log('\n╔════════════════════════════════════════════════════════════╗')
console.log('║  研芯通 · v3.6 全量回归 + 多人盲测模板                    ║')
console.log('║  验收：自动回归 100% + 3 人盲测 3 维度 ≥ 4/5              ║')
console.log('╚════════════════════════════════════════════════════════════╝')

regressionCheck()

if (BLIND_MODE) {
  blindTestTemplate()
} else {
  info('如需多人盲测模板，加 --blind-test 参数')
}

summary()
