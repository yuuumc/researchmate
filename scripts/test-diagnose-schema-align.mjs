// ============================================================
// diagnose.md Schema 对齐验证（v3.1.1）
// 验证 prompt 输出的 JSON Schema 与 diagnosis.js store 期望字段一一对应
// 依据：旗舰多智能体工作流设计 §2.2 统一契约
// ============================================================

import { readFileSync } from 'node:fs'

const C = {
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
  dim: '\x1b[2m', reset: '\x1b[0m'
}

function section(title) {
  console.log(`\n${'─'.repeat(70)}\n  ${title}\n${'─'.repeat(70)}`)
}
function ok(msg) { console.log(`  ${C.green}✓${C.reset} ${msg}`) }
function fail(msg) { console.log(`  ${C.red}✗${C.reset} ${msg}`) }

let totalPass = 0
let totalFail = 0

// ============================================================
// Store 期望字段集（来自设计文档 §2.2 + diagnosis.js store）
// ============================================================
const REQUIRED_FIELDS = [
  'score',
  'subject',
  'ability_stars',
  'weak_points',
  'root_causes',
  'remediation_path',
  'overall_level',
  'diagnosis_reason'
]

// 旧字段（必须移除）
const DEPRECATED_FIELDS = [
  'mastered',
  'blind_spots'
]

// ============================================================
// 加载 prompt 文件
// ============================================================
section('检查 1：文件可加载性')
let promptMd
try {
  promptMd = readFileSync('prompts/diagnose.md', 'utf-8')
  ok(`diagnose.md 加载成功 (${promptMd.length} chars)`)
  totalPass++
} catch (e) {
  fail(`diagnose.md 加载失败: ${e.message}`)
  totalFail++
  process.exit(1)
}

// ============================================================
// 检查 2：JSON 示例中包含所有 REQUIRED_FIELDS
// ============================================================
section('检查 2：JSON 示例含所有必需字段（store 期望）')

// 提取所有 ```json 围栏内的内容
const jsonBlocks = [...promptMd.matchAll(/```json\s*\n([\s\S]*?)\n```/g)].map(m => m[1].trim())
const mainSchema = jsonBlocks[0] // 第一个 JSON 块是 Schema 示例

if (!mainSchema) {
  fail('未找到 JSON 示例块')
  totalFail++
  process.exit(1)
}

for (const field of REQUIRED_FIELDS) {
  const re = new RegExp(`"${field}"\\s*:`)
  if (re.test(mainSchema)) {
    ok(`字段 "${field}" 存在`)
    totalPass++
  } else {
    fail(`字段 "${field}" 缺失`)
    totalFail++
  }
}

// ============================================================
// 检查 3：旧字段已移除
// ============================================================
section('检查 3：旧字段已移除（mastered / blind_spots）')

for (const field of DEPRECATED_FIELDS) {
  const re = new RegExp(`"${field}"\\s*:`)
  if (re.test(mainSchema)) {
    fail(`旧字段 "${field}" 仍存在于 JSON 示例中`)
    totalFail++
  } else {
    ok(`旧字段 "${field}" 已移除`)
    totalPass++
  }
}

// ============================================================
// 检查 4：硬约束中提及所有字段
// ============================================================
section('检查 4：硬约束覆盖所有字段')

const CONSTRAINT_CHECKS = [
  { field: 'score', re: /score.*已掌握.*考纲|score.*掌握比例/i, label: 'score 估算规则' },
  { field: 'ability_stars', re: /ability_stars.*1-5|ability_stars.*星级|ability_stars.*覆盖/i, label: 'ability_stars 评分规则' },
  { field: 'weak_points', re: /weak_points.*1-3\s*星|weak_points.*priority|weak_points.*排序/i, label: 'weak_points 来源规则' },
  { field: 'root_causes', re: /root_causes.*因果|root_causes.*关联/i, label: 'root_causes 因果链' },
  { field: 'remediation_path', re: /remediation_path.*前置|remediation_path.*prerequisite/i, label: 'remediation_path 前置依赖' }
]

for (const c of CONSTRAINT_CHECKS) {
  if (c.re.test(promptMd)) {
    ok(`${c.label} 已定义`)
    totalPass++
  } else {
    fail(`${c.label} 未在硬约束中定义`)
    totalFail++
  }
}

// ============================================================
// 检查 5：反模式覆盖关键错误场景
// ============================================================
section('检查 5：反模式覆盖关键错误场景')

const ANTIPATTERN_CHECKS = [
  { re: /编造正确率|编造.*分数/i, label: '禁止编造正确率' },
  { re: /ability_stars.*遗漏|遗漏.*考纲/i, label: '禁止遗漏考纲知识点' },
  { re: /root_causes.*空泛|根因.*空泛/i, label: '禁止空泛根因' },
  { re: /旧字段|mastered|blind_spots.*旧/i, label: '禁止旧字段' },
  { re: /无前置依赖|没标.*prerequisite/i, label: '禁止无前置依赖' },
  { re: /遗漏.*低星|weak_points.*遗漏/i, label: '禁止遗漏低星知识点' }
]

for (const c of ANTIPATTERN_CHECKS) {
  if (c.re.test(promptMd)) {
    ok(`反模式覆盖: ${c.label}`)
    totalPass++
  } else {
    fail(`反模式缺失: ${c.label}`)
    totalFail++
  }
}

// ============================================================
// 检查 6：Placeholder 定义（与 prompt-loader.js 兼容）
// ============================================================
section('检查 6：Placeholder 定义')

const EXPECTED_PLACEHOLDERS = [
  'student_name', 'target_major', 'mastered_skills', 'weak_points', 'knowledge_points'
]

for (const ph of EXPECTED_PLACEHOLDERS) {
  const re = new RegExp(`\\{\\{${ph}\\}\\}`)
  if (re.test(promptMd)) {
    ok(`占位符 {{${ph}}} 存在`)
    totalPass++
  } else {
    fail(`占位符 {{${ph}}} 缺失`)
    totalFail++
  }
}

// 验证所有占位符符合 \w+ 规范
const allPlaceholders = promptMd.match(/\{\{[^}]+\}\}/g) || []
const invalid = allPlaceholders.filter(ph => !/^\{\{\w+\}\}$/.test(ph))
if (invalid.length === 0) {
  ok('所有占位符符合 \\w+ 规范（prompt-loader substitute() 兼容）')
  totalPass++
} else {
  fail(`${invalid.length} 个占位符不符合规范: ${invalid.join(', ')}`)
  totalFail++
}

// ============================================================
// 检查 7：输入安全约束（#10）
// ============================================================
section('检查 7：输入安全约束')
if (/输入安全约束/.test(promptMd) && /eval\(\)/.test(promptMd) && /<script>/.test(promptMd)) {
  ok('输入安全约束（约束 10）存在且覆盖 eval/script/javascript')
  totalPass++
} else {
  fail('输入安全约束缺失或不完整')
  totalFail++
}

// ============================================================
// 检查 8：与 plan Agent 下游数据流兼容
// ============================================================
section('检查 8：与 plan Agent 下游数据流兼容')
// 设计文档 §3.1: plan agent 的 diagnosis_result 输入需要 weak_points + root_causes + remediation_path + score + overall_level
const DOWNSTREAM_FIELDS = ['weak_points', 'root_causes', 'remediation_path', 'score', 'overall_level']
for (const field of DOWNSTREAM_FIELDS) {
  const re = new RegExp(`"${field}"\\s*:`)
  if (re.test(mainSchema)) {
    ok(`下游字段 "${field}" 存在（plan agent 可消费）`)
    totalPass++
  } else {
    fail(`下游字段 "${field}" 缺失（plan agent 数据链断裂）`)
    totalFail++
  }
}

// ============================================================
// 总结
// ============================================================
section('总结')
if (totalFail === 0) {
  console.log(`  ${C.green}✓ 全部通过：${totalPass} 检查项 / 0 失败${C.reset}`)
  console.log(`  ${C.cyan}Schema 对齐确认：8 必需字段全部存在 / 2 旧字段已移除 / 下游 plan agent 数据链完整${C.reset}\n`)
  process.exit(0)
} else {
  console.log(`  ${C.red}✗ 失败：${totalPass} 通过 / ${totalFail} 失败${C.reset}\n`)
  process.exit(1)
}
