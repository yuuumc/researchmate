// ============================================================
// E2E Mock Server（零真实 API 调用的 /api/chat 替身）
// ============================================================
// 用途：CI / 本地 E2E 测试的 LLM 替身，监听 5175 端口。
//   POST /api/chat 按 prompt 关键词返回 canned JSON 响应：
//     - 学习诊断（含 4 层根因链 JSON 块，score 从 userInput 提取）
//     - 成长规划（含 weeks/adjustments JSON 块，薄弱点从 prompt 回显）
//     - 考研导航（3 档院校推荐 JSON 块，无编造数字）
//     - 专业导师概念讲解（Markdown，含 MOSFET/阈值电压等关键词）
//   错误语义与真实 api/chat.js 对齐：
//     - 缺 prompt/userInput → 400 missing_prompt_or_userInput
//     - GET → 405 method_not_allowed
// 运行：node scripts/mock-server.mjs  （MOCK_PORT 可改端口，默认 5175）
// 零外部依赖，不发起任何出站请求。
// ============================================================

import http from 'node:http'

const PORT = Number(process.env.MOCK_PORT || 5175)

// 半导体物理概念词库：用于从 userInput / prompt 中提取薄弱点并回显
const CONCEPT_BANK = [
  'MOSFET 阈值电压', 'C-V 特性', '短沟道效应', '异质结', 'PN 结',
  'DIBL', '泊松方程', '表面势', '强反型', '平带', 'MOSFET'
]

let requestCount = 0

function extractScore(userInput) {
  const m = String(userInput || '').match(/(\d+)\s*分/)
  return m ? parseInt(m[1], 10) : 55
}

function extractConcepts(text, fallback) {
  const hits = CONCEPT_BANK.filter(c => String(text || '').includes(c))
  // 'MOSFET 阈值电压' 命中时去掉泛化的 'MOSFET'，避免重复
  const dedup = hits.filter(c => !(c === 'MOSFET' && hits.includes('MOSFET 阈值电压')))
  return dedup.length > 0 ? dedup : fallback
}

function estimateUsage(text) {
  const completion = Math.max(1, Math.ceil(String(text).length / 2))
  const prompt = 512
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion }
}

// ------------------------------------------------------------
// 各类 canned 响应构造
// ------------------------------------------------------------

function buildDiagnose(prompt, userInput) {
  const score = extractScore(userInput)
  const weakPoints = extractConcepts(userInput, ['MOSFET 阈值电压', 'C-V 特性'])
  const hasHistory = /历史诊断数据|prev_score/.test(prompt || '')
  const comparison = hasHistory
    ? `\n\n## 与历次对比\n\n分数轨迹：55→62→70→75→${score}，整体呈提升趋势。与上次相比，已掌握的薄弱点减少，剩余薄弱点集中在 ${weakPoints.join('、')}。`
    : ''
  const json = {
    score,
    subject: '半导体物理',
    weak_points: weakPoints,
    direct_causes: [`${weakPoints[0]}相关判据不熟`],
    middle_causes: ['表面势与能带图概念模糊'],
    root_causes: ['泊松方程与电动力学基础缺失'],
    remediation: '补刘恩科《半导体物理》第 4 章表面势小节，重做第 5 章习题 5.2，整理错题归因表'
  }
  const md = `# 学习诊断报告\n\n本次得分 **${score} 分**（半导体物理）。\n\n## 4 层根因链\n\n- 表面：${weakPoints.join('、')} 相关题目失分\n- 直接：${json.direct_causes[0]}\n- 中间：${json.middle_causes[0]}\n- 根本：${json.root_causes[0]}${comparison}\n\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\``
  return md
}

function buildPlanner(prompt, userInput) {
  const weakPoints = extractConcepts(`${prompt}\n${userInput}`, ['MOSFET 阈值电压', 'C-V 特性'])
  const score = extractScore(userInput)
  const weeks = [1, 2, 3, 4].map(w => ({
    week: w,
    priority: w <= 2 ? 'P0' : 'P1',
    tasks: w <= 2
      ? weakPoints.map(wp => `教材第 ${w + 3} 章：${wp} 专项 + 习题 ${w}.2`)
      : [`真题模拟卷第 ${w - 2} 套（限时 3 小时）`, `错题归因复盘（章节 ${w + 3}）`],
    daily: ['09:00-11:00 教材精读', '14:00-16:00 习题训练', '20:00-21:00 错题复盘']
  }))
  const json = {
    target_stage: 'intensive',
    weeks,
    adjustments: {
      keep: ['每日教材复习', '错题归因表'],
      strengthen: weakPoints.map(wp => `${wp} 专项训练`),
      drop: ['已掌握章节的重复刷题']
    }
  }
  return `# 4 周复习计划\n\n基于最近诊断（${score} 分），薄弱知识点 ${weakPoints.join('、')} 优先安排 P0。\n\n## 调整说明\n\n- 保留：${json.adjustments.keep.join('、')}\n- 强化：${json.adjustments.strengthen.join('、')}\n- 放弃：${json.adjustments.drop.join('、')}\n\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\``
}

function buildAdmission() {
  const json = {
    recommendations: [
      { school: '复旦大学', tier: '冲刺', reason: '微电子学科实力强，长三角地区，与考生地域偏好匹配' },
      { school: '浙江大学', tier: '冲刺', reason: '微电子学与固体电子学方向平台好，竞争较激烈' },
      { school: '东南大学', tier: '稳妥', reason: '微电子传统强校，招生规模相对稳定' },
      { school: '上海交通大学', tier: '稳妥', reason: '集成电路工程方向与考生背景契合' },
      { school: '南京大学', tier: '保底', reason: '集成电路工程方向录取波动小，作为兜底' },
      { school: '同济大学', tier: '保底', reason: '长三角区位符合偏好，竞争压力相对较小' }
    ]
  }
  return `# 考研院校推荐\n\n按冲刺 / 稳妥 / 保底三档推荐，均来自候选库，具体分数线以官方公布为准。\n\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\``
}

function buildTutor() {
  return `# 概念讲解：MOSFET 阈值电压\n\n## 前置知识检查\n\n在推导 MOSFET 阈值电压之前，先确认你是否理解表面势与平带电压的含义。\n\n## 阶梯引导\n\n1. 回顾强反型判据：表面势达到两倍费米势时，表面反型层形成\n2. 从平带出发，考虑栅氧化层压降与半导体表面压降的分配\n3. 将耗尽层电荷用表面势表示，联立求解阈值电压\n\n## 关键提示\n\n阈值电压由平带电压、表面势、耗尽层电荷三项共同决定；强反型条件是推导的核心。`
}

function buildGeneric(userInput) {
  return `这是对「${String(userInput || '').slice(0, 50)}」的模拟回复（mock-server 通用形态）。`
}

function routeKind(prompt) {
  const p = String(prompt || '')
  if (p.includes('学习诊断')) return 'diagnose'
  if (p.includes('成长规划师') || p.includes('复习计划') && p.includes('规划')) return 'planner'
  if (p.includes('考研导航')) return 'admission'
  if (p.includes('专业导师')) return 'tutor'
  return 'generic'
}

// ------------------------------------------------------------
// HTTP 服务
// ------------------------------------------------------------

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  const closeHdr = { 'Connection': 'close' }

  if (req.method === 'GET' && url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...closeHdr })
    res.end(JSON.stringify({ status: 'ok', mock: true, requests: requestCount }))
    return
  }

  if (url.pathname !== '/api/chat') {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', ...closeHdr })
    res.end(JSON.stringify({ error: 'not_found' }))
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', ...closeHdr })
    res.end(JSON.stringify({ error: 'method_not_allowed' }))
    return
  }

  let raw = ''
  req.on('data', chunk => { raw += chunk })
  req.on('end', () => {
    requestCount++
    let body
    try {
      body = JSON.parse(raw || '{}')
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...closeHdr })
      res.end(JSON.stringify({ error: 'invalid_json' }))
      return
    }

    const { prompt, userInput, options = {} } = body
    if (!prompt || !userInput) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...closeHdr })
      res.end(JSON.stringify({ error: 'missing_prompt_or_userInput' }))
      return
    }

    const kind = routeKind(prompt)
    let content
    if (kind === 'diagnose') content = buildDiagnose(prompt, userInput)
    else if (kind === 'planner') content = buildPlanner(prompt, userInput)
    else if (kind === 'admission') content = buildAdmission()
    else if (kind === 'tutor') content = buildTutor()
    else content = buildGeneric(userInput)

    const model = options.model || 'mock-model'
    console.log(`[mock] #${requestCount} kind=${kind} model=${model} input=${String(userInput).slice(0, 30)}`)
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...closeHdr })
    res.end(JSON.stringify({
      content,
      model: `mock/${model}`,
      usage: estimateUsage(content)
    }))
  })
})

server.listen(PORT, () => {
  console.log(`[mock-server] listening on http://localhost:${PORT} (零真实 API 调用)`)
})

process.on('SIGTERM', () => server.close(() => process.exit(0)))
process.on('SIGINT', () => server.close(() => process.exit(0)))
