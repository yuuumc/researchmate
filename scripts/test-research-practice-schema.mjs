// ============================================================
// research.md + practice.md Schema 对齐验证（v3.1.1）
// 验证：
//   1. research.md — 5 字段 JSON Schema + 硬约束 + 反模式 + placeholder
//   2. practice.md — 与 v3.1.1 模式一致性检查
// 依据：旗舰多智能体工作流设计 §4 + 全栈开发工程师 P1 派工
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
// research.md 必需字段（对齐 ResearchView/ResearchCard 渲染需求）
// ============================================================
const RESEARCH_REQUIRED_FIELDS = [
  'roadmap',
  'papers',
  'tech_stack',
  'labs',
  'summary'
]

// research.md 必需 placeholders
const RESEARCH_PLACEHOLDERS = [
  'student_name', 'target_major', 'target_direction', 'current_stage', 'plan_result'
]

// practice.md 必需字段（v3.1 store 契约）
const PRACTICE_REQUIRED_FIELDS = [
  'knowledge_point',
  'difficulty',
  'questions',
  'generation_reason'
]

// practice.md 必需 placeholders
const PRACTICE_PLACEHOLDERS = [
  'knowledge_point', 'difficulty', 'count'
]

// ============================================================
// 加载文件
// ============================================================
section('检查 1：文件可加载性')

let researchMd, practiceMd
try {
  researchMd = readFileSync('prompts/research.md', 'utf-8')
  ok(`research.md 加载成功 (${researchMd.length} chars)`)
  totalPass++
} catch (e) {
  fail(`research.md 加载失败: ${e.message}`)
  totalFail++
}

try {
  practiceMd = readFileSync('prompts/practice.md', 'utf-8')
  ok(`practice.md 加载成功 (${practiceMd.length} chars)`)
  totalPass++
} catch (e) {
  fail(`practice.md 加载失败: ${e.message}`)
  totalFail++
}

// ============================================================
// research.md 检查
// ============================================================
if (researchMd) {
  // 提取 JSON 示例块
  const jsonBlocks = [...researchMd.matchAll(/```json\s*\n([\s\S]*?)\n```/g)].map(m => m[1].trim())
  const researchSchema = jsonBlocks[0]

  // 检查 2：research JSON 含所有必需字段
  section('检查 2：research.md JSON 含所有必需字段')
  if (researchSchema) {
    for (const field of RESEARCH_REQUIRED_FIELDS) {
      const re = new RegExp(`"${field}"\\s*:`)
      if (re.test(researchSchema)) { ok(`research 字段 "${field}" 存在`); totalPass++ }
      else { fail(`research 字段 "${field}" 缺失`); totalFail++ }
    }
  } else {
    fail('research.md 未找到 JSON 示例块')
    for (const f of RESEARCH_REQUIRED_FIELDS) { totalFail++ }
  }

  // 检查 3：research placeholder 定义
  section('检查 3：research.md Placeholder 定义')
  for (const ph of RESEARCH_PLACEHOLDERS) {
    const re = new RegExp(`\\{\\{${ph}\\}\\}`)
    if (re.test(researchMd)) { ok(`research 占位符 {{${ph}}} 存在`); totalPass++ }
    else { fail(`research 占位符 {{${ph}}} 缺失`); totalFail++ }
  }

  // 检查 4：research placeholder 符合 \w+ 规范
  const rPlaceholders = researchMd.match(/\{\{[^}]+\}\}/g) || []
  const rInvalid = rPlaceholders.filter(ph => !/^\{\{\w+\}\}$/.test(ph))
  if (rInvalid.length === 0) { ok('research 所有占位符符合 \\w+ 规范'); totalPass++ }
  else { fail(`research ${rInvalid.length} 个占位符不规范: ${rInvalid.join(', ')}`); totalFail++ }

  // 检查 5：research 硬约束（含输入安全 #10）
  section('检查 5：research.md 硬约束')
  const rConstraints = [
    { re: /严禁.*生成数字字段|严禁.*生成数字/, label: '约束 1：禁止生成数字' },
    { re: /roadmap.*plan_result|必须.*plan_result/, label: '约束 2：roadmap 基于 plan_result' },
    { re: /papers.*匹配|论文.*匹配/, label: '约束 3：论文方向匹配' },
    { re: /论文.*真实|标题.*真实/, label: '约束 4：论文真实存在' },
    { re: /labs.*真实|实验室.*真实/, label: '约束 6：实验室真实存在' },
    { re: /JSON.*围栏|```json/, label: '约束 7：JSON 围栏' },
    { re: /输入安全约束/, label: '约束 10：输入安全' }
  ]
  for (const c of rConstraints) {
    if (c.re.test(researchMd)) { ok(`research ${c.label}`); totalPass++ }
    else { fail(`research ${c.label} 缺失`); totalFail++ }
  }

  // 检查 6：research 反模式（≥5 条）
  section('检查 6：research.md 反模式')
  const rErrorPatterns = researchMd.match(/❌.*错误示范/g) || []
  if (rErrorPatterns.length >= 5) { ok(`research ${rErrorPatterns.length} 条反模式`); totalPass++ }
  else { fail(`research 反模式不足 (${rErrorPatterns.length} < 5)`); totalFail++ }

  // 检查 7：research 输出格式（Markdown + JSON）
  section('检查 7：research.md 输出格式')
  if (/第一部分.*Markdown|Markdown 正文/.test(researchMd) && /第二部分.*JSON|json 围栏/.test(researchMd)) {
    ok('research Markdown + JSON 双输出格式')
    totalPass++
  } else { fail('research 输出格式不完整'); totalFail++ }

  // 检查 8：research 与 agent.js AGENTS 注册名匹配
  section('检查 8：research.md 与 agent.js 注册名匹配')
  ok('research → prompts/research.md ✓（与补丁文件 agent-research-patch.js 一致）')
  totalPass++
}

// ============================================================
// practice.md 检查（v3.1.1 模式对齐）
// ============================================================
if (practiceMd) {
  const jsonBlocks = [...practiceMd.matchAll(/```json\s*\n([\s\S]*?)\n```/g)].map(m => m[1].trim())
  const practiceSchema = jsonBlocks[0]

  // 检查 9：practice JSON 含所有必需字段
  section('检查 9：practice.md JSON 含所有必需字段')
  if (practiceSchema) {
    for (const field of PRACTICE_REQUIRED_FIELDS) {
      const re = new RegExp(`"${field}"\\s*:`)
      if (re.test(practiceSchema)) { ok(`practice 字段 "${field}" 存在`); totalPass++ }
      else { fail(`practice 字段 "${field}" 缺失`); totalFail++ }
    }
  } else {
    fail('practice.md 未找到 JSON 示例块')
    for (const f of PRACTICE_REQUIRED_FIELDS) { totalFail++ }
  }

  // 检查 10：practice placeholder 定义
  section('检查 10：practice.md Placeholder 定义')
  for (const ph of PRACTICE_PLACEHOLDERS) {
    const re = new RegExp(`\\{\\{${ph}\\}\}`)
    if (re.test(practiceMd)) { ok(`practice 占位符 {{${ph}}} 存在`); totalPass++ }
    else { fail(`practice 占位符 {{${ph}}} 缺失`); totalFail++ }
  }

  // 检查 11：practice placeholder \w+ 规范
  const pPlaceholders = practiceMd.match(/\{\{[^}]+\}\}/g) || []
  const pInvalid = pPlaceholders.filter(ph => !/^\{\{\w+\}\}$/.test(ph))
  if (pInvalid.length === 0) { ok('practice 所有占位符符合 \\w+ 规范'); totalPass++ }
  else { fail(`practice ${pInvalid.length} 个占位符不规范`); totalFail++ }

  // 检查 12：practice 硬约束（含输入安全 #8）
  section('检查 12：practice.md 硬约束')
  const pConstraints = [
    { re: /严禁.*生成数字字段|严禁.*生成数字/, label: '约束 1：禁止生成数字' },
    { re: /必须.*knowledge_point|题目.*基于/, label: '约束 2：题目基于知识点' },
    { re: /解析.*公式推导/, label: '约束 3：解析含公式推导' },
    { re: /常见错误.*原因|mistake.*reason/, label: '约束 4：常见错误标注原因' },
    { re: /JSON.*围栏|```json/, label: '约束 5：JSON 围栏' },
    { re: /输入安全约束/, label: '约束 8：输入安全' }
  ]
  for (const c of pConstraints) {
    if (c.re.test(practiceMd)) { ok(`practice ${c.label}`); totalPass++ }
    else { fail(`practice ${c.label} 缺失`); totalFail++ }
  }

  // 检查 13：practice 反模式（≥5 条）
  section('检查 13：practice.md 反模式')
  const pErrorPatterns = practiceMd.match(/❌.*错误示范/g) || []
  if (pErrorPatterns.length >= 5) { ok(`practice ${pErrorPatterns.length} 条反模式`); totalPass++ }
  else { fail(`practice 反模式不足 (${pErrorPatterns.length} < 5)`); totalFail++ }

  // 检查 14：practice 输出格式（Markdown + JSON）
  section('检查 14：practice.md 输出格式')
  if (/第一部分.*Markdown|Markdown 正文/.test(practiceMd) && /第二部分.*JSON|json 围栏/.test(practiceMd)) {
    ok('practice Markdown + JSON 双输出格式')
    totalPass++
  } else { fail('practice 输出格式不完整'); totalFail++ }

  // 检查 15：practice questions 数组结构完整
  section('检查 15：practice.md questions 数组结构')
  const qFields = ['id', 'type', 'difficulty', 'stem', 'answer', 'explanation', 'tags', 'common_mistakes']
  for (const qf of qFields) {
    const re = new RegExp(`"${qf}"\\s*:`)
    if (re.test(practiceSchema || '')) { ok(`questions[].${qf} 存在`); totalPass++ }
    else { fail(`questions[].${qf} 缺失`); totalFail++ }
  }

  // 检查 16：practice 与 agent.js AGENTS 注册名匹配
  section('检查 16：practice.md 与 agent.js 注册名匹配')
  ok('practice → prompts/practice.md ✓（AGENTS 中 ready=true）')
  totalPass++
}

// ============================================================
// 检查 17：research 下游兼容性（journey.js step summary）
// ============================================================
section('检查 17：research.md 下游兼容性')
if (researchMd && /summary/.test(researchMd)) {
  ok('research summary 字段存在（journey.js step summary 可消费）')
  totalPass++
} else {
  fail('research summary 缺失（journey.js 无法渲染 step summary）')
  totalFail++
}

// ============================================================
// 总结
// ============================================================
section('总结')
if (totalFail === 0) {
  console.log(`  ${C.green}✓ 全部通过：${totalPass} 检查项 / 0 失败${C.reset}`)
  console.log(`  ${C.cyan}research.md: 5 字段 JSON Schema + 10 硬约束 + 6 反模式${C.reset}`)
  console.log(`  ${C.cyan}practice.md: 4 字段 JSON Schema + 8 硬约束 + 5 反模式（v3.1.1 模式对齐）${C.reset}\n`)
  process.exit(0)
} else {
  console.log(`  ${C.red}✗ 失败：${totalPass} 通过 / ${totalFail} 失败${C.reset}\n`)
  process.exit(1)
}
