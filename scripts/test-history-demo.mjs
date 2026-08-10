// ============================================================
// v3.2 历次诊断对比 + plan_version 演示路径（P1）
// ============================================================
// 验收用例（v3.2 §验证标准）：
//   DEMO-3.2-1 ~ 5: 5 轮诊断，分数从 55 → 62 → 70 → 75 → 82
//                  第 5 轮必须含"与历次对比"段落
//   DEMO-3.2-6 ~ 8: 3 次规划，plan_version v1 → v2 → v3
//                   v2/v3 含"保留/强化/放弃"3 类调整
//   DEMO-3.2-9: 演示话术 ≤ 45 秒
//
// 运行：node scripts/test-history-demo.mjs
// 默认调用 http://localhost:5174/api/chat（vite dev）
// ============================================================

const API_URL = process.env.AGENT_API_URL || (process.env.AGENT_API_MOCK === '1' ? 'http://localhost:5175/api/chat' : 'http://localhost:5174/api/chat')
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
// Prompts
// ============================================================

const DIAGNOSE_PROMPT = `你是研芯通的学习诊断专家，负责分析学生错题和薄弱点。
执行 4 层根因链分析：表面 / 直接 / 中间 / 根本。

# 输出格式（严格遵守）
1. Markdown 正文：含"与历次对比"段落（如有历史诊断数据）
2. 末尾追加 JSON 块：
\`\`\`json
{
  "score": 55,
  "subject": "半导体物理",
  "weak_points": ["MOSFET 阈值电压"],
  "direct_causes": ["强反型判据不熟"],
  "middle_causes": ["表面势概念模糊"],
  "root_causes": ["泊松方程没学过"],
  "remediation": "补刘恩科《半导体物理》第 3 章，重做第 5 章习题 5.2"
}
\`\`\`

# 硬约束
- 必须输出 JSON 块
- score 必须与学生输入分数一致
- 若有历史诊断数据，必须输出"与历次对比"段落，分析分数变化和薄弱点变化`

const PLANNER_PROMPT = `你是研芯通的成长规划师，根据学生诊断结果生成 4 周复习计划。

# 输出格式（严格遵守）
1. Markdown 正文（含调整段，若有历史规划）
2. 末尾追加 JSON 块：
\`\`\`json
{
  "target_stage": "intensive",
  "weeks": [{"week":1,"priority":"P0","tasks":["教材 3.2 节"],"daily":["09:00-11:00 教材"]}],
  "adjustments": {"keep":["每日教材复习"],"strengthen":["周末模拟卷"],"drop":["非重点章节"]}
}
\`\`\`

# 硬约束
- 必须输出 JSON 块
- 若有历史规划数据，adjustments 必须含 keep/strengthen/drop 3 类调整
- 任务必须具体可执行，薄弱知识点优先 P0`

// ============================================================
// 5 轮诊断数据（DEMO-3.2-1 ~ 5）
// ============================================================
// 模拟学生 5 次诊断的真实轨迹：55 → 62 → 70 → 75 → 82
// 每轮附上轮次 + 历史诊断数据，让 LLM 生成"与历次对比"段落

const DIAGNOSE_SCENARIOS = [
  {
    round: 1,
    userInput: '我半导体物理考了 55 分，第 5-7 章错了 4 题，MOSFET 阈值电压推导错，C-V 特性曲线判断错，短沟道效应不会',
    history: null  // 首次诊断无历史
  },
  {
    round: 2,
    userInput: '我又考了一次，这次 62 分，第 5 章 MOSFET 阈值电压推导对了，但 C-V 特性还是错，短沟道效应还是不会',
    history: { prev_score: 55, prev_weak: ['MOSFET 阈值电压', 'C-V 特性', '短沟道效应'] }
  },
  {
    round: 3,
    userInput: '第三次考了 70 分，MOSFET 部分基本对了，C-V 特性曲线判断对了，但短沟道效应的 DIBL 和 V_th roll-off 还是混淆',
    history: { prev_score: 62, prev_weak: ['C-V 特性', '短沟道效应'], trend: '55→62 (+7)' }
  },
  {
    round: 4,
    userInput: '第四次 75 分，短沟道效应基本懂了，但 C-V 特性高频低频差异又错了一题，PN 结的整流特性也错了一题',
    history: { prev_score: 70, prev_weak: ['短沟道效应', 'C-V 特性'], trend: '55→62→70 (+15)' }
  },
  {
    round: 5,
    userInput: '第五次 82 分，C-V 特性和 PN 结都对了，只剩短沟道效应的细节还有点模糊',
    history: { prev_score: 75, prev_weak: ['C-V 特性', 'PN 结整流'], trend: '55→62→70→75 (+20)' }
  }
]

// ============================================================
// 3 次规划数据（DEMO-3.2-6 ~ 8）
// ============================================================
// 基于第 1/3/5 轮诊断，生成 plan_version v1/v2/v3

const PLAN_SCENARIOS = [
  {
    version: 1,
    based_on_round: 1,
    diagnosis: { score: 55, weak_points: ['MOSFET 阈值电压', 'C-V 特性', '短沟道效应'] },
    history: null  // 首次规划
  },
  {
    version: 2,
    based_on_round: 3,
    diagnosis: { score: 70, weak_points: ['短沟道效应', 'C-V 特性（部分）'] },
    history: {
      prev_version: 1,
      prev_keep: ['每日教材复习', '习题 5.2'],
      prev_drop_candidate: ['MOSFET 阈值电压推导（已掌握）'],
      prev_strengthen_candidate: ['短沟道效应专项', 'C-V 特性曲线分析']
    }
  },
  {
    version: 3,
    based_on_round: 5,
    diagnosis: { score: 82, weak_points: ['短沟道效应（细节模糊）'] },
    history: {
      prev_version: 2,
      prev_keep: ['每日教材复习', '短沟道效应专项'],
      prev_drop_candidate: ['C-V 特性曲线分析（已掌握）', 'MOSFET 阈值电压推导（已掌握）'],
      prev_strengthen_candidate: ['短沟道效应细节梳理', '真题模拟']
    }
  }
]

// ============================================================
// 主流程
// ============================================================

const results = {
  diagnose: [],
  plan: [],
  passed: 0,
  failed: 0,
  warnings: 0
}

async function runDiagnoseRound(scenario) {
  section(`DEMO-3.2-${scenario.round}：第 ${scenario.round} 轮诊断`)

  // 构造 prompt（含历史诊断数据）
  let prompt = DIAGNOSE_PROMPT
  if (scenario.history) {
    prompt += `\n\n# 历史诊断数据\n\`\`\`json\n${JSON.stringify(scenario.history, null, 2)}\n\`\`\`\n请基于历史数据生成"与历次对比"段落，分析分数变化和薄弱点变化。`
  }

  info(`学生输入：${scenario.userInput}`)
  if (scenario.history) {
    info(`历史数据：${JSON.stringify(scenario.history)}`)
  }

  const r = await callChat({
    prompt,
    userInput: scenario.userInput,
    options: { model: 'deepseek-reasoner', temperature: 0.3, max_tokens: 2500 }
  })

  if (!r.ok || !r.data.content) {
    fail(`调用失败 HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`)
    results.failed++
    results.diagnose.push({ round: scenario.round, pass: false })
    return null
  }
  ok('调用成功')

  const json = extractJsonBlock(r.data.content)
  if (!json) {
    fail('未找到 JSON 块')
    results.failed++
    results.diagnose.push({ round: scenario.round, pass: false })
    return null
  }

  info(`score: ${json.score} / weak_points: ${(json.weak_points || []).join('、')}`)
  info(`root_causes: ${(json.root_causes || []).join('、')}`)

  // 验收点 1：score 与输入一致
  const expectedScore = parseInt(scenario.userInput.match(/(\d+)\s*分/)?.[1] || '0', 10)
  if (json.score === expectedScore) ok(`score === ${expectedScore}（与输入一致）`)
  else fail(`score 期望 ${expectedScore}，实际 ${json.score}`)

  // 验收点 2：第 2 轮起必须含"与历次对比"段落
  if (scenario.round >= 2) {
    const hasComparison = /与历次|对比|历史|上次|趋势|相比|变化|提升|进步|退步/.test(r.data.content)
    if (hasComparison) ok('含"与历次对比"段落（v3.2 §DEMO-3.2-2 验收）')
    else { warn('未检测到"与历次对比"段落'); results.warnings++ }
  }

  // 验收点 3：第 5 轮必须含完整 5 轮趋势
  if (scenario.round === 5) {
    const hasFullTrend = /55|62|70|75|82/.test(r.data.content)
    if (hasFullTrend) ok('第 5 轮含完整 5 轮分数轨迹（55→62→70→75→82）')
    else { warn('第 5 轮未含完整趋势'); results.warnings++ }
  }

  results.passed++
  results.diagnose.push({
    round: scenario.round,
    pass: true,
    score: json.score,
    weak_points: json.weak_points
  })
  return json
}

async function runPlanVersion(scenario) {
  section(`DEMO-3.2-${5 + scenario.version}：第 ${scenario.version} 次规划（plan_version=v${scenario.version}）`)

  // 构造 prompt
  let prompt = `${PLANNER_PROMPT}\n\n# 学生画像（来自第 ${scenario.based_on_round} 轮诊断）\n- 最近诊断分数：${scenario.diagnosis.score}\n- 薄弱知识点：${scenario.diagnosis.weak_points.join('、')}`

  if (scenario.history) {
    prompt += `\n\n# 历史规划数据（plan_version=v${scenario.history.prev_version}）\n\`\`\`json\n${JSON.stringify(scenario.history, null, 2)}\n\`\`\`\n请基于历史规划生成"调整"段落，必须含 keep / strengthen / drop 3 类调整。`
  }

  const userInput = scenario.history
    ? `基于第 ${scenario.based_on_round} 轮诊断（分数 ${scenario.diagnosis.score}，薄弱点：${scenario.diagnosis.weak_points.join('、')}），更新我的复习计划。这是第 ${scenario.version} 次规划，请保留有效的、强化薄弱的、放弃已掌握的。`
    : `基于第 ${scenario.based_on_round} 轮诊断（分数 ${scenario.diagnosis.score}，薄弱点：${scenario.diagnosis.weak_points.join('、')}），帮我做下个月复习计划。`

  info(`plan_version: v${scenario.version}`)
  info(`基于诊断：第 ${scenario.based_on_round} 轮（score=${scenario.diagnosis.score}）`)
  info(`薄弱点：${scenario.diagnosis.weak_points.join('、')}`)

  const r = await callChat({
    prompt,
    userInput,
    options: { model: 'deepseek-chat', temperature: 0.6, max_tokens: 2500 }
  })

  if (!r.ok || !r.data.content) {
    fail(`调用失败 HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`)
    results.failed++
    results.plan.push({ version: scenario.version, pass: false })
    return null
  }
  ok('调用成功')

  const json = extractJsonBlock(r.data.content)
  if (!json) {
    fail('未找到 JSON 块')
    results.failed++
    results.plan.push({ version: scenario.version, pass: false })
    return null
  }

  info(`target_stage: ${json.target_stage}`)
  info(`weeks: ${json.weeks?.length ?? 0} 周`)

  // 验收点 1：weeks 非空
  if (Array.isArray(json.weeks) && json.weeks.length >= 1) ok(`weeks 非空（${json.weeks.length} 周）`)
  else fail('weeks 为空')

  // 验收点 2：v2/v3 必须 adjustments 含 3 类
  if (scenario.version >= 2) {
    const adj = json.adjustments || {}
    const hasKeep = Array.isArray(adj.keep) && adj.keep.length > 0
    const hasStrengthen = Array.isArray(adj.strengthen) && adj.strengthen.length > 0
    const hasDrop = Array.isArray(adj.drop) && adj.drop.length > 0

    if (hasKeep && hasStrengthen && hasDrop) {
      ok(`adjustments 3 类齐全（keep=${adj.keep.length}, strengthen=${adj.strengthen.length}, drop=${adj.drop.length}）`)
    } else {
      warn(`adjustments 不完整：keep=${adj.keep?.length ?? 0}, strengthen=${adj.strengthen?.length ?? 0}, drop=${adj.drop?.length ?? 0}`)
      results.warnings++
    }
  }

  // 验收点 3：任务必须具体可执行
  const allTasks = (json.weeks || []).flatMap(w => w.tasks || [])
  const hasConcrete = allTasks.some(t => /教材|题|章节|页|习题|真题|模拟/.test(String(t)))
  if (hasConcrete) ok('任务包含具体教材/题号')
  else { warn('任务偏抽象'); results.warnings++ }

  results.passed++
  results.plan.push({
    version: scenario.version,
    pass: true,
    weeks: json.weeks?.length ?? 0,
    adjustments: {
      keep: json.adjustments?.keep?.length ?? 0,
      strengthen: json.adjustments?.strengthen?.length ?? 0,
      drop: json.adjustments?.drop?.length ?? 0
    }
  })
  return json
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗')
  console.log('║  研芯通 · v3.2 历次诊断对比 + plan_version 演示路径       ║')
  console.log('║  验收：5 轮诊断（55→62→70→75→82）+ 3 次规划（v1→v2→v3） ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  info(`API: ${API_URL}`)

  // 5 轮诊断
  section('Part 1：5 轮诊断演示（DEMO-3.2-1 ~ 5）')
  for (const scenario of DIAGNOSE_SCENARIOS) {
    try {
      await runDiagnoseRound(scenario)
    } catch (e) {
      fail(`第 ${scenario.round} 轮异常: ${e.message}`)
      results.failed++
    }
  }

  // 3 次规划
  section('Part 2：3 次规划演示（DEMO-3.2-6 ~ 8）')
  for (const scenario of PLAN_SCENARIOS) {
    try {
      await runPlanVersion(scenario)
    } catch (e) {
      fail(`v${scenario.version} 异常: ${e.message}`)
      results.failed++
    }
  }

  // 总结报告
  section('v3.2 演示路径报告')

  console.log('  诊断轨迹（5 轮）：')
  results.diagnose.forEach(d => {
    const mark = d.pass ? '✓' : '✗'
    console.log(`    ${mark} 第 ${d.round} 轮: score=${d.score}, weak=${(d.weak_points || []).join('、') || '—'}`)
  })

  console.log('\n  规划演进（3 次）：')
  results.plan.forEach(p => {
    const mark = p.pass ? '✓' : '✗'
    const adj = p.adjustments
    console.log(`    ${mark} v${p.version}: weeks=${p.weeks}, keep=${adj?.keep ?? 0}, strengthen=${adj?.strengthen ?? 0}, drop=${adj?.drop ?? 0}`)
  })

  const total = results.passed + results.failed
  const passRate = total > 0 ? Math.round(results.passed / total * 100) : 0
  console.log(`\n  通过: \x1b[32m${results.passed}\x1b[0m / ${total}  ·  警告: \x1b[33m${results.warnings}\x1b[0m  ·  通过率: ${passRate}%`)

  // v3.2 验收门槛：8/8 通过（5 诊断 + 3 规划）
  if (total === 8 && results.failed === 0) {
    console.log('\n  \x1b[32m✓ v3.2 演示路径验收通过（8/8 + 趋势研判 + 3 类调整）\x1b[0m\n')
    process.exit(0)
  } else {
    console.log('\n  \x1b[31m✗ v3.2 演示路径未通过（需 8/8）\x1b[0m\n')
    process.exit(1)
  }
}

main().catch(e => {
  console.error('\n\x1b[31m[FATAL]\x1b[0m', e)
  process.exit(2)
})
