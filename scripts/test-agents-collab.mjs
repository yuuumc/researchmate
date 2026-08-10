// ============================================================
// 5 Agent 协作联调测试（v3.4 8/9-8/10 P0 验收脚本）
// ============================================================
// 覆盖 v2 §7.4 6 个端到端演示场景 + §7.5 跨 Agent 状态一致性
// 用法：node scripts/test-agents-collab.mjs
//
// 默认调用本地 http://localhost:5173/api/chat
// 可通过环境变量 AGENT_API_URL 切换到 https://yanxintong.vercel.app/api/chat
// ============================================================

const API_URL = process.env.AGENT_API_URL || (process.env.AGENT_API_MOCK === '1' ? 'http://localhost:5175/api/chat' : 'http://localhost:5173/api/chat')
const TIMEOUT_MS = 60_000

// ============================================================
// 工具函数
// ============================================================

async function callChat({ prompt, userInput, options = {} }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ prompt, userInput, options }),
      signal: controller.signal
    })
    const data = await r.json().catch(() => ({}))
    return { ok: r.ok, status: r.status, data }
  } finally {
    clearTimeout(timer)
  }
}

function section(title) {
  console.log(`\n${'═'.repeat(70)}\n  ${title}\n${'═'.repeat(70)}`)
}

function ok(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`) }
function fail(msg) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`) }
function info(msg) { console.log(`  \x1b[36mℹ\x1b[0m ${msg}`) }
function warn(msg) { console.log(`  \x1b[33m!\x1b[0m ${msg}`) }
function trim(s, n = 200) { return (s || '').slice(0, n) }

function extractJsonBlock(text) {
  if (!text) return null
  const m = text.match(/```json\s*([\s\S]+?)```/) || text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[1] || m[0]) } catch { return null }
}

// ============================================================
// 5 Agent Prompt（精简版，与 src/prompts/*.md 对齐）
// ============================================================

const TUTOR_PROMPT = `你是研芯通的专业导师，负责回答工科专业课概念问题。
采用苏格拉底式教学法，引导学生自己推导。
输出 Markdown，严格基于知识库检索结果回答。`

const DIAGNOSE_PROMPT = `你是研芯通的学习诊断专家，负责分析学生错题和薄弱点。
执行 4 层根因链分析：表面 / 直接 / 中间 / 根本。
输出 Markdown + 末尾 JSON 块：
\`\`\`json
{
  "score": 55,
  "subject": "半导体物理",
  "weak_points": ["MOSFET 阈值电压"],
  "direct_causes": ["强反型判据不熟"],
  "middle_causes": ["表面势概念模糊"],
  "root_causes": ["泊松方程没学过"],
  "remediation": "补刘恩科《半导体物理》第 4 章"
}
\`\`\`
硬约束：score 必须与学生输入分数一致，不得编造。`

const PLANNER_PROMPT = `你是研芯通的成长规划师，根据学生诊断结果生成 4 周复习计划。

# 输出格式（严格遵守）
输出分两部分，缺一不可：
1. Markdown 正文（人类可读的计划说明）
2. 末尾追加 JSON 块（用 \`\`\`json 围栏包裹）：
\`\`\`json
{
  "target_stage": "intensive",
  "weeks": [{"week":1,"priority":"P0","tasks":["教材 3.2 节"],"daily":["09:00-11:00 教材"]}],
  "adjustments": {"keep":["每日教材复习"],"strengthen":["周末模拟卷"],"drop":["非重点章节"]}
}
\`\`\`

# 硬约束
- 必须输出 JSON 块，没有 JSON 块视为失败
- 任务必须具体可执行，紧急度分档基于诊断结果
- 即使级联场景也必须输出完整 JSON 块`

const ADMISSION_PROMPT = `你是研芯通的考研导航专家，从候选库中匹配 3 档院校（冲刺 / 稳妥 / 保底），每档 2 所。
硬约束：不得编造任何数字字段（分数线 / 报录比 / 概率 / 招生人数 / 年份）和 URL。
输出 Markdown + 末尾 JSON 块：
\`\`\`json
{
  "recommendations": [
    {"school":"复旦大学","tier":"冲刺","reason":"微电子专业强，长三角地区"}
  ]
}
\`\`\``
const ADMISSION_CANDIDATES = `# 院校候选库
[
  {"school":"复旦大学","region":"长三角","level":"985","major":"微电子学与固体电子学"},
  {"school":"上海交通大学","region":"长三角","level":"985","major":"集成电路工程"},
  {"school":"东南大学","region":"长三角","level":"985","major":"微电子学与固体电子学"},
  {"school":"南京大学","region":"长三角","level":"985","major":"集成电路工程"},
  {"school":"浙江大学","region":"长三角","level":"985","major":"微电子学与固体电子学"},
  {"school":"同济大学","region":"长三角","level":"985","major":"集成电路工程"}
]`

const CASCADE_DIAGNOSE_PROMPT = `${DIAGNOSE_PROMPT}`

// ============================================================
// 6 场景测试
// ============================================================

const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  scenes: []
}

async function scene1_concept() {
  section('场景 2：概念问题（Tutor Agent · deepseek-chat）')
  const r = await callChat({
    prompt: TUTOR_PROMPT,
    userInput: 'MOSFET 阈值电压怎么推导？',
    options: { model: 'deepseek-chat', temperature: 0.5, max_tokens: 1500 }
  })
  if (!r.ok || !r.data.content) {
    fail(`调用失败 HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`)
    results.failed++; results.scenes.push({ name: 'concept', pass: false }); return
  }
  ok('调用成功')
  info(`模型: ${r.data.model}`)
  info(`Token: total=${r.data.usage?.total_tokens ?? '—'}`)
  info(`回复片段: ${trim(r.data.content, 250)}`)
  // 验收：不直接给答案，引导推导
  const containsKeyword = /MOSFET|阈值电压|强反型|表面势|平带/.test(r.data.content)
  if (containsKeyword) ok('回复包含 MOSFET / 阈值电压 / 强反型等关键词')
  else { warn('回复未包含预期关键词'); results.warnings++ }
  results.passed++; results.scenes.push({ name: 'concept', pass: true })
}

async function scene2_diagnose() {
  section('场景 3：学习诊断（Diagnose Agent · deepseek-reasoner · 4 层根因链）')
  const r = await callChat({
    prompt: DIAGNOSE_PROMPT,
    userInput: '我半导体物理考了 55 分，第 5-7 章错了 4 题，MOSFET 阈值电压推导错，C-V 特性曲线判断错，短沟道效应不会',
    options: { model: 'deepseek-reasoner', temperature: 0.3, max_tokens: 2500 }
  })
  if (!r.ok || !r.data.content) {
    fail(`调用失败 HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`)
    results.failed++; results.scenes.push({ name: 'diagnose', pass: false }); return
  }
  ok('reasoner 调用成功')
  info(`模型: ${r.data.model}`)
  const json = extractJsonBlock(r.data.content)
  if (!json) {
    fail('未找到结构化 JSON 块')
    results.failed++; results.scenes.push({ name: 'diagnose', pass: false }); return
  }
  ok('JSON 块解析成功')
  info(`score: ${json.score} / subject: ${json.subject}`)
  info(`weak_points: ${(json.weak_points || []).join('、')}`)
  info(`root_causes: ${(json.root_causes || []).join('、')}`)

  // 验收点
  if (json.score === 55) ok('score === 55（与输入一致）')
  else fail(`score 期望 55，实际 ${json.score}`)
  if (Array.isArray(json.weak_points) && json.weak_points.length > 0) ok(`weak_points 非空 (${json.weak_points.length} 项)`)
  else fail('weak_points 为空')
  if (Array.isArray(json.root_causes) && json.root_causes.length > 0) ok(`root_causes 非空 (${json.root_causes.length} 项)`)
  else { warn('root_causes 为空'); results.warnings++ }
  if (json.remediation && json.remediation.length > 10) ok('remediation 已生成')
  else fail('remediation 缺失或过短')

  const allPass = json.score === 55 && Array.isArray(json.weak_points) && json.weak_points.length > 0
  if (allPass) { results.passed++; results.scenes.push({ name: 'diagnose', pass: true }) }
  else { results.failed++; results.scenes.push({ name: 'diagnose', pass: false }) }
}

async function scene3_plan() {
  section('场景 4：成长规划（Planner Agent · deepseek-chat · 4 周计划）')
  const r = await callChat({
    prompt: `${PLANNER_PROMPT}

# 学生画像
学生 ID: test-001
备考阶段: basic
薄弱知识点: MOSFET 阈值电压、C-V 特性、短沟道效应
最近诊断分数: 55`,
    userInput: '基于上次诊断（55 分，薄弱点：MOSFET 阈值电压、C-V 特性），帮我做下个月复习计划',
    options: { model: 'deepseek-chat', temperature: 0.6, max_tokens: 2500 }
  })
  if (!r.ok || !r.data.content) {
    fail(`调用失败 HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`)
    results.failed++; results.scenes.push({ name: 'plan', pass: false }); return
  }
  ok('调用成功')
  const json = extractJsonBlock(r.data.content)
  if (!json) {
    fail('未找到结构化 JSON 块')
    results.failed++; results.scenes.push({ name: 'plan', pass: false }); return
  }
  ok('JSON 块解析成功')
  info(`target_stage: ${json.target_stage}`)
  info(`weeks: ${json.weeks?.length ?? 0} 周`)
  if (Array.isArray(json.weeks) && json.weeks.length >= 1) ok(`weeks 非空 (${json.weeks.length} 周)`)
  else fail('weeks 为空')
  if (json.adjustments && (json.adjustments.keep?.length || json.adjustments.strengthen?.length || json.adjustments.drop?.length)) {
    ok(`adjustments 已生成 (keep=${json.adjustments.keep?.length ?? 0}, strengthen=${json.adjustments.strengthen?.length ?? 0}, drop=${json.adjustments.drop?.length ?? 0})`)
  } else { warn('adjustments 不完整'); results.warnings++ }

  // 验收点：任务必须具体可执行（含教材 / 题 / 时间段）
  const allTasks = (json.weeks || []).flatMap(w => w.tasks || [])
  const hasConcrete = allTasks.some(t => /教材|题|章节|页|习题|真题|模拟/.test(String(t)))
  if (hasConcrete) ok('任务包含具体教材/题号（可执行）')
  else { warn('任务偏抽象'); results.warnings++ }

  const allPass = Array.isArray(json.weeks) && json.weeks.length >= 1
  if (allPass) { results.passed++; results.scenes.push({ name: 'plan', pass: true }) }
  else { results.failed++; results.scenes.push({ name: 'plan', pass: false }) }
}

async function scene4_admission() {
  section('场景 5：考研导航（Admission Agent · 数字字段防泄漏）')
  const r = await callChat({
    prompt: `${ADMISSION_PROMPT}

${ADMISSION_CANDIDATES}`,
    userInput: '我双非前 30%，想去长三角读微电子，给我推荐冲刺 / 稳妥 / 保底各 2 所',
    options: { model: 'deepseek-chat', temperature: 0.4, max_tokens: 2000 }
  })
  if (!r.ok || !r.data.content) {
    fail(`调用失败 HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`)
    results.failed++; results.scenes.push({ name: 'admission', pass: false }); return
  }
  ok('调用成功')
  const json = extractJsonBlock(r.data.content)
  if (!json || !Array.isArray(json.recommendations)) {
    fail('未找到 recommendations 数组')
    results.failed++; results.scenes.push({ name: 'admission', pass: false }); return
  }
  ok(`推荐 ${json.recommendations.length} 所院校`)
  json.recommendations.forEach((rec, i) => {
    info(`  [${i + 1}] ${rec.school} · ${rec.tier} · ${trim(rec.reason, 80)}`)
  })

  // 验收点 1：覆盖 3 档
  const tiers = new Set(json.recommendations.map(r => r.tier))
  if (tiers.has('冲刺') && tiers.has('稳妥') && tiers.has('保底')) ok('3 档（冲刺/稳妥/保底）全覆盖')
  else { warn(`档位不全: ${[...tiers].join('/')}`); results.warnings++ }

  // 验收点 2：候选库内的院校（非编造）
  const knownSchools = ['复旦大学', '上海交通大学', '东南大学', '南京大学', '浙江大学', '同济大学']
  const allKnown = json.recommendations.every(r => knownSchools.includes(r.school))
  if (allKnown) ok('所有推荐院校都在候选库内（未编造）')
  else fail('存在候选库外的院校（可能编造）')

  // 验收点 3：reason 中不应出现编造数字
  const reasonText = json.recommendations.map(r => r.reason || '').join(' ')
  const hasLeak = /\b\d{2,3}\s*分(数线)?|\b\d{1,3}\s*%|\b20\d{2}\s*年|招(?:生)?\s*\d+\s*人/.test(reasonText)
  if (hasLeak) { warn('reason 中存在编造数字（前端需清洗）'); results.warnings++ }
  else ok('reason 中无编造数字')

  const allPass = allKnown && json.recommendations.length >= 3
  if (allPass) { results.passed++; results.scenes.push({ name: 'admission', pass: true }) }
  else { results.failed++; results.scenes.push({ name: 'admission', pass: false }) }
}

async function scene5_cascade() {
  section('场景 6：级联（Diagnose → Plan · 状态保持）')
  // 模拟 router 的 cascade 流程：先诊断，再用诊断结果驱动规划
  // 验证 weak_points 从诊断传到规划

  // Step 1: 诊断
  info('Step 1: 调用 Diagnose Agent...')
  const r1 = await callChat({
    prompt: CASCADE_DIAGNOSE_PROMPT,
    userInput: '我半导体物理考了 48 分，第 5 章 MOSFET 阈值电压推导错，第 7 章异质结不会，先帮我诊断再帮我做针对性计划',
    options: { model: 'deepseek-reasoner', temperature: 0.3, max_tokens: 2500 }
  })
  if (!r1.ok || !r1.data.content) {
    fail(`诊断调用失败 HTTP ${r1.status}`)
    results.failed++; results.scenes.push({ name: 'cascade', pass: false }); return
  }
  ok('Step 1 诊断成功')
  const diagJson = extractJsonBlock(r1.data.content)
  if (!diagJson) {
    fail('诊断 JSON 块缺失')
    results.failed++; results.scenes.push({ name: 'cascade', pass: false }); return
  }
  info(`诊断 score=${diagJson.score}, weak_points=${(diagJson.weak_points || []).join('、')}`)

  // Step 2: 用诊断结果驱动规划（模拟 cascade.js 的 planInput 构造）
  info('Step 2: 用诊断结果调用 Planner Agent...')
  const weakPoints = diagJson.weak_points || []
  const score = diagJson.score
  const planInput = `基于刚才的诊断${score != null ? `（分数 ${score}）` : ''}，薄弱点：${weakPoints.join('、') || '无'}。帮我做一份针对性复习计划，薄弱知识点优先 P0。`

  const r2 = await callChat({
    prompt: `${PLANNER_PROMPT}

# 学生画像（来自诊断阶段）
学生 ID: test-cascade
备考阶段: basic
薄弱知识点: ${weakPoints.join('、')}
最近诊断分数: ${score ?? '未知'}`,
    userInput: planInput,
    options: { model: 'deepseek-chat', temperature: 0.6, max_tokens: 2500 }
  })
  if (!r2.ok || !r2.data.content) {
    fail(`规划调用失败 HTTP ${r2.status}`)
    results.failed++; results.scenes.push({ name: 'cascade', pass: false }); return
  }
  ok('Step 2 规划成功')
  const planJson = extractJsonBlock(r2.data.content)
  if (!planJson) {
    fail('规划 JSON 块缺失')
    results.failed++; results.scenes.push({ name: 'cascade', pass: false }); return
  }
  info(`规划 weeks=${planJson.weeks?.length ?? 0}, target_stage=${planJson.target_stage}`)

  // 验收点 1：weak_points 从诊断传到规划（状态保持）
  const planText = JSON.stringify(planJson)
  const weakInPlan = weakPoints.some(w => planText.includes(w))
  if (weakInPlan) ok(`薄弱点已传入规划阶段（${weakPoints.filter(w => planText.includes(w)).join('、')}）`)
  else { warn('薄弱点未在规划中显式出现（可能被语义化）'); results.warnings++ }

  // 验收点 2：诊断和规划都成功
  ok('级联两阶段均成功执行（v2 §V7 状态保持）')
  results.passed++; results.scenes.push({ name: 'cascade', pass: true })
}

async function scene6_error_handling() {
  section('场景 7：错误处理（v3 §翻车点 11 安全验证）')
  // 测试 1：空 prompt
  const r1 = await callChat({ userInput: 'hello' })
  if (r1.status === 400 && r1.data.error === 'missing_prompt_or_userInput') {
    ok('空 prompt 返回 400 + missing_prompt_or_userInput')
  } else {
    fail(`空 prompt 期望 400，实际 ${r1.status}: ${JSON.stringify(r1.data).slice(0, 100)}`)
    results.failed++; results.scenes.push({ name: 'error', pass: false }); return
  }
  // 测试 2：空 userInput
  const r2 = await callChat({ prompt: 'hi' })
  if (r2.status === 400) {
    ok(`空 userInput 返回 400: ${r2.data.error}`)
  } else {
    fail(`空 userInput 期望 400，实际 ${r2.status}`)
    results.failed++; results.scenes.push({ name: 'error', pass: false }); return
  }
  // 测试 3：错误方法
  const r3 = await fetch(API_URL, { method: 'GET' })
  if (r3.status === 405) ok(`GET 方法返回 405: method_not_allowed`)
  else { warn(`GET 方法期望 405，实际 ${r3.status}`); results.warnings++ }

  results.passed++; results.scenes.push({ name: 'error', pass: true })
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗')
  console.log('║  研芯通 · 5 Agent 协作联调测试（v3.4 8/9-8/10 P0 验收）   ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  info(`API: ${API_URL}`)
  info(`超时: ${TIMEOUT_MS / 1000}s`)

  const scenes = [
    ['场景 2: 概念问题', scene1_concept],
    ['场景 3: 学习诊断', scene2_diagnose],
    ['场景 4: 成长规划', scene3_plan],
    ['场景 5: 考研导航', scene4_admission],
    ['场景 6: 级联', scene5_cascade],
    ['场景 7: 错误处理', scene6_error_handling]
  ]

  for (const [name, fn] of scenes) {
    try {
      await fn()
    } catch (e) {
      fail(`${name} 异常: ${e.message}`)
      results.failed++
    }
  }

  // 总结报告
  section('联调报告')
  const total = results.passed + results.failed
  const passRate = total > 0 ? Math.round(results.passed / total * 100) : 0
  console.log(`  通过: \x1b[32m${results.passed}\x1b[0m / ${total}`)
  console.log(`  失败: \x1b[31m${results.failed}\x1b[0m`)
  console.log(`  警告: \x1b[33m${results.warnings}\x1b[0m`)
  console.log(`  通过率: ${passRate}%`)
  console.log('')
  console.log('  场景明细:')
  results.scenes.forEach(s => {
    const mark = s.pass ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
    console.log(`    ${mark} ${s.name}`)
  })

  // v3.4 8/10 验收门槛：通过率 ≥ 5/6（≥ 83%）
  if (passRate >= 83) {
    console.log('\n  \x1b[32m✓ v3.4 8/9-8/10 验收通过（通过率 ≥ 83%）\x1b[0m\n')
    process.exit(0)
  } else {
    console.log('\n  \x1b[31m✗ v3.4 8/9-8/10 验收未通过（需 ≥ 83%）\x1b[0m\n')
    process.exit(1)
  }
}

main().catch(e => {
  console.error('\n\x1b[31m[FATAL]\x1b[0m', e)
  process.exit(2)
})
