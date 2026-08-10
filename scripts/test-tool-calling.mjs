// ============================================================
// P0-2 D1: 工具调用框架测试
// ============================================================
// 测试范围（D1 基础测试）：
//   1. 工具注册与查询
//   2. query_university stub
//   3. recommend_papers stub
//   4. generate_plan stub
//   5. store_progress 持久化
//   6. search_knowledge stub fallback（无 KB）
//   7. 超时保护
//   8. 失败降级（unknown tool / handler error）
//
// D3 将追加：
//   - INTENT_PROMPT 返回非法 JSON / tool 缺失 / tool_args 不完整 三类兜底（补充要求 #1）
//   - search_knowledge + mock GraphRAG 注入测试
//   - 全 Agent 覆盖集成测试
// ============================================================

import { registerTool, callTool, getToolSchemas } from '../src/core/tools/index.js'
import { parseIntentResult } from '../src/core/tools/intentParser.js'

let passed = 0
let failed = 0
const failures = []

function assert(condition, label) {
  if (condition) {
    passed++
  } else {
    failed++
    failures.push(label)
    console.error(`  FAIL: ${label}`)
  }
}

function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    passed++
  } else {
    failed++
    failures.push(label)
    console.error(`  FAIL: ${label}`)
    console.error(`    expected: ${JSON.stringify(expected)}`)
    console.error(`    actual:   ${JSON.stringify(actual)}`)
  }
}

// ============================================================
// 1. 工具注册与查询
// ============================================================
console.log('\n[1] 工具注册与查询')

const schemas = getToolSchemas()
assert(typeof schemas === 'object', 'getToolSchemas 返回对象')
assert(schemas.query_university !== undefined, 'query_university 已注册')
assert(schemas.recommend_papers !== undefined, 'recommend_papers 已注册')
assert(schemas.generate_plan !== undefined, 'generate_plan 已注册')
assert(schemas.store_progress !== undefined, 'store_progress 已注册')
assert(schemas.search_knowledge !== undefined, 'search_knowledge 已注册')
assert(schemas.query_university.mounted_on === 'admission', 'query_university 挂载 admission')
assert(schemas.search_knowledge.mounted_on === 'tutor', 'search_knowledge 挂载 tutor')
assert(schemas.search_knowledge.timeout === 3000, 'search_knowledge 超时 3s')
console.log(`  5 个工具已注册，schemas 获取正常`)

// ============================================================
// 2. query_university stub
// ============================================================
console.log('\n[2] query_university stub')

{
  // 无过滤 → 全部 10 所
  const res = await callTool('query_university', {})
  assert(res.ok === true, 'query_university 无参数 ok')
  assert(res.data.count === 10, 'query_university 返回 10 所院校')
  assert(res.data.universities[0].school === '浙江大学', '第一所是浙江大学')
  assert(res.data.universities[0].score_line === 360, '浙大分数线 360')
  assert(res.data.universities[9].level === '双非', '最后一所是双非')

  // 按地区过滤
  const shanghaiRes = await callTool('query_university', { region: '上海' })
  assert(shanghaiRes.ok === true, 'query_university 上海过滤 ok')
  assert(shanghaiRes.data.count === 5, '上海有 5 所院校')
  assert(shanghaiRes.data.universities.every(u => u.region === '上海'), '全是上海院校')

  // 按 level 过滤
  const c9Res = await callTool('query_university', { level: '985' })
  assert(c9Res.data.count === 8, '985 院校 8 所')

  // 按专业过滤
  const microRes = await callTool('query_university', { major: '微电子' })
  assert(microRes.data.count === 3, '微电子专业 3 所')

  // 组合过滤
  const comboRes = await callTool('query_university', { region: '南京', level: '985' })
  assert(comboRes.data.count === 2, '南京985 2 所')
  console.log(`  无过滤10 / 上海5 / 985×8 / 微电子3 / 南京985×2`)
}

// ============================================================
// 3. recommend_papers stub
// ============================================================
console.log('\n[3] recommend_papers stub')

{
  // 无过滤 → 全部 8 篇
  const res = await callTool('recommend_papers', {})
  assert(res.ok === true, 'recommend_papers 无参数 ok')
  assert(res.data.count === 8, '返回 8 篇论文')
  assert(res.data.papers[0].title === 'Attention Is All You Need', '第一篇是 Transformer')
  assert(res.data.papers[0].url !== undefined, '论文有 url 字段')

  // 按方向过滤
  const aiChipRes = await callTool('recommend_papers', { direction: 'AI芯片' })
  assert(aiChipRes.data.count === 5, 'AI芯片方向 5 篇')

  const semiRes = await callTool('recommend_papers', { direction: '半导体' })
  assert(semiRes.data.count === 2, '半导体方向 2 篇')

  // 无匹配
  const noMatchRes = await callTool('recommend_papers', { direction: '量子计算' })
  assert(noMatchRes.data.count === 0, '量子计算方向 0 篇')
  console.log(`  全部8 / AI芯片5 / 半导体2 / 量子计算0`)
}

// ============================================================
// 4. generate_plan stub
// ============================================================
console.log('\n[4] generate_plan stub')

{
  // 默认 12 周
  const res = await callTool('generate_plan', {})
  assert(res.ok === true, 'generate_plan 默认 ok')
  assert(res.data.total_weeks === 12, '默认 12 周')
  assert(res.data.weekly_plan.length === 12, 'weekly_plan 长度 12')
  assert(res.data.weekly_plan[0].phase === '基础巩固', '第1周基础巩固')
  assert(res.data.weekly_plan[11].phase === '冲刺模拟', '第12周冲刺模拟')
  assert(Array.isArray(res.data.weekly_plan[0].tasks), '每日任务数组')
  assert(res.data.weekly_plan[0].tasks.length === 3, '每天 3 个任务')

  // 自定义周数
  const customRes = await callTool('generate_plan', { weeks: 4, stage: 'sprint', weak_topics: ['半导体物理', '数电'] })
  assert(customRes.data.total_weeks === 4, '自定义 4 周')
  assert(customRes.data.stage === 'sprint', '阶段 sprint')
  assert(customRes.data.weak_topics.length === 2, '薄弱项 2 个')
  assert(customRes.data.weekly_plan[0].focus.includes('半导体物理'), '第1周攻克半导体物理')
  assert(customRes.data.weekly_plan[1].focus.includes('数电'), '第2周攻克数电')

  // 边界：0 周 → 1 周
  const zeroRes = await callTool('generate_plan', { weeks: 0 })
  assert(zeroRes.data.total_weeks === 1, '0周→clamp到1周')

  // 边界：超大周数 → 52 周
  const hugeRes = await callTool('generate_plan', { weeks: 999 })
  assert(hugeRes.data.total_weeks === 52, '999周→clamp到52周')
  console.log(`  默认12周 / 自定义4周+薄弱 / clamp边界正常`)
}

// ============================================================
// 5. store_progress 持久化
// ============================================================
console.log('\n[5] store_progress 持久化')

{
  // mock localStorage（Node 环境）
  const _store = {}
  globalThis.localStorage = {
    getItem: (k) => _store[k] || null,
    setItem: (k, v) => { _store[k] = v },
    removeItem: (k) => { delete _store[k] },
    clear: () => { Object.keys(_store).forEach(k => delete _store[k]) }
  }

  // 清空历史
  globalThis.localStorage.clear()

  // 写入第一条
  const res1 = await callTool('store_progress', { type: 'diagnose', data: { score: 55, subject: '半导体物理' } })
  assert(res1.ok === true, 'store_progress 第一次写入 ok')
  assert(res1.data.stored === true, 'stored=true')
  assert(res1.data.total === 1, 'total=1')

  // 写入第二条
  const res2 = await callTool('store_progress', { type: 'plan', data: { weeks: 12 } })
  assert(res2.data.total === 2, 'total=2')

  // 验证 localStorage 持久化
  const history = JSON.parse(globalThis.localStorage.getItem('tool_progress_history'))
  assert(history.length === 2, 'localStorage 中 2 条记录')
  assert(history[0].type === 'diagnose', '第一条 type=diagnose')
  assert(history[0].data.score === 55, '第一条 score=55')
  assert(history[1].type === 'plan', '第二条 type=plan')
  assert(typeof history[0].ts === 'number', '记录有 ts 时间戳')

  // FIFO 淘汰测试（写入 >100 条）
  for (let i = 0; i < 105; i++) {
    await callTool('store_progress', { type: 'qa', data: { idx: i } })
  }
  const finalHistory = JSON.parse(globalThis.localStorage.getItem('tool_progress_history'))
  assert(finalHistory.length === 100, 'FIFO 淘汰后保持 100 条')
  console.log(`  写入+读取+FIFO淘汰(100) 全通过`)
}

// ============================================================
// 6. search_knowledge stub fallback（无 KB）
// ============================================================
console.log('\n[6] search_knowledge stub fallback')

{
  // 无 KB → stub fallback
  const res = await callTool('search_knowledge', { query: 'MOSFET 阈值电压' })
  assert(res.ok === true, 'search_knowledge 无KB ok（降级不报错）')
  assert(res.data.count === 0, '无KB返回0条')
  assert(res.data.slices.length === 0, 'slices 空数组')
  assert(res.data.message.includes('stub fallback') || res.data.message.includes('未注入'), '有 fallback 说明')

  // 空 query
  const emptyRes = await callTool('search_knowledge', { query: '' })
  assert(emptyRes.ok === true, 'search_knowledge 空query ok')
  assert(emptyRes.data.count === 0, '空query返回0条')
  assert(emptyRes.data.message === 'empty query', '空query有提示')

  // 有 KB 但无 retrieveFn
  const noFnRes = await callTool('search_knowledge', {
    query: '半导体'
  }, {
    knowledgeBase: [{ id: '1', content: 'test' }]
  })
  assert(noFnRes.data.message.includes('未注入'), '有KB无函数→提示未注入')

  // 有 KB + mock retrieveFn → 正常返回
  const mockFn = (query, kb, graph, opts) => ({
    slices: [
      { id: 's1', content: 'MOSFET阈值电压是开始导电的栅压', score: 0.85 },
      { id: 's2', content: '阈值电压与氧化层厚度有关', score: 0.72 }
    ],
    ragContext: 'MOSFET相关知识点'
  })
  const mockRes = await callTool('search_knowledge', {
    query: 'MOSFET',
    topK: 2
  }, {
    knowledgeBase: [{ id: '1', content: 'test' }],
    graphRagRetrieve: mockFn
  })
  assert(mockRes.ok === true, 'search_knowledge mock注入 ok')
  assert(mockRes.data.count === 2, 'mock返回2条')
  assert(mockRes.data.slices[0].id === 's1', '第一条slice id=s1')
  assert(mockRes.data.slices[0].content.length <= 200, 'content 截断 ≤200')
  assert(mockRes.data.ragContext.length <= 500, 'ragContext 截断 ≤500')
  console.log(`  无KB降级 / 空query / 无函数 / mock注入 全通过`)
}

// ============================================================
// 7. 超时保护
// ============================================================
console.log('\n[7] 超时保护')

{
  // 注册一个慢工具
  registerTool('slow_tool', async () => {
    await new Promise(r => setTimeout(r, 5000))
    return { late: true }
  }, { timeout: 200, description: '测试超时' })

  const t0 = Date.now()
  const res = await callTool('slow_tool', {})
  const elapsed = Date.now() - t0

  assert(res.ok === false, '慢工具超时 ok=false')
  assert(res.error.includes('timeout'), '错误信息含 timeout')
  assert(elapsed < 1000, `超时在 <1s 内返回（实际 ${elapsed}ms）`)

  // options.timeout 覆盖 schema.timeout
  registerTool('medium_tool', async () => {
    await new Promise(r => setTimeout(r, 500))
    return { done: true }
  }, { timeout: 50, description: '测试覆盖超时' })

  // schema timeout=50ms → 应超时
  const timeoutRes = await callTool('medium_tool', {})
  assert(timeoutRes.ok === false, 'schema timeout=50ms → 超时')

  // options timeout=2000 → 不超时
  const okRes = await callTool('medium_tool', {}, { timeout: 2000 })
  assert(okRes.ok === true, 'options timeout=2000 覆盖 → 成功')
  assert(okRes.data.done === true, '返回正确数据')
  console.log(`  慢工具超时 / schema timeout / options覆盖 全通过`)
}

// ============================================================
// 8. 失败降级
// ============================================================
console.log('\n[8] 失败降级')

{
  // unknown tool
  const unknownRes = await callTool('nonexistent_tool', {})
  assert(unknownRes.ok === false, 'unknown tool ok=false')
  assert(unknownRes.error.includes('unknown_tool'), '错误含 unknown_tool')
  assert(unknownRes.tool === 'nonexistent_tool', '返回 tool 名')

  // handler 抛异常
  registerTool('error_tool', async () => {
    throw new Error('intentional error')
  }, { timeout: 1000, description: '测试异常' })

  const errorRes = await callTool('error_tool', {})
  assert(errorRes.ok === false, 'error tool ok=false')
  assert(errorRes.error === 'intentional error', '错误信息透传')
  assert(errorRes.tool === 'error_tool', '返回 tool 名')

  // handler 返回非 Promise（同步异常）
  registerTool('sync_error_tool', async () => {
    const x = undefined
    return x.nonexistent.prop  // TypeError
  }, { timeout: 1000, description: '同步异常' })

  const syncErrorRes = await callTool('sync_error_tool', {})
  assert(syncErrorRes.ok === false, 'sync error tool ok=false')
  assert(syncErrorRes.error.length > 0, '有错误信息')
  console.log(`  unknown tool / handler异常 / 同步异常 全降级不崩`)
}

// ============================================================
// 9. callTool 返回结构一致性
// ============================================================
console.log('\n[9] callTool 返回结构一致性')

{
  const res = await callTool('query_university', { region: '上海' })
  assert(res.tool === 'query_university', '返回含 tool 字段')
  assert(typeof res.elapsedMs === 'number', '返回含 elapsedMs')
  assert(res.elapsedMs >= 0, 'elapsedMs ≥ 0')
  assert(res.elapsedMs < 1000, `elapsedMs < 1000（stub应该很快，实际 ${res.elapsedMs}ms）`)
  console.log(`  返回结构 {ok, data, tool, elapsedMs} 一致`)
}

// ============================================================
// [10] D3: INTENT_PROMPT 解析兜底（三种异常降级）
// ============================================================
console.log('\n[10] D3: INTENT_PROMPT 解析兜底（三种异常降级）')

{
  const VALID_INTENTS = ['concept', 'diagnose', 'plan', 'admission', 'research', 'cascade']
  const VALID_TOOLS = getToolSchemas()

  // 正常返回（intent + tool + tool_args 齐全）
  const ok1 = parseIntentResult('{"intent":"admission","tool":"query_university","tool_args":{"region":"上海"}}', {
    validIntents: VALID_INTENTS, validTools: VALID_TOOLS, fallbackIntent: 'concept'
  })
  assert(ok1.intent === 'admission', '正常：intent=admission')
  assert(ok1.tool === 'query_university', '正常：tool=query_university')
  assert(ok1.tool_args.region === '上海', '正常：tool_args.region=上海')
  assert(ok1.degraded === null, '正常：degraded=null')

  // 兜底 1: JSON parse 失败
  const f1 = parseIntentResult('这不是JSON', {
    validIntents: VALID_INTENTS, validTools: VALID_TOOLS, fallbackIntent: 'concept'
  })
  assert(f1.intent === 'concept', 'JSON失败：intent 退化为 concept')
  assert(f1.tool === null, 'JSON失败：tool=null')
  assert(f1.tool_args === null, 'JSON失败：tool_args=null')
  assert(f1.degraded === 'json_parse_failed', 'JSON失败：degraded=json_parse_failed')

  // 兜底 1b: 部分损坏 JSON
  const f1b = parseIntentResult('{intent: admission, broken', {
    validIntents: VALID_INTENTS, validTools: VALID_TOOLS, fallbackIntent: 'concept'
  })
  assert(f1b.tool === null && f1b.degraded === 'json_parse_failed', '损坏JSON：降级 json_parse_failed')

  // 兜底 2: tool 字段缺失
  const f2 = parseIntentResult('{"intent":"concept"}', {
    validIntents: VALID_INTENTS, validTools: VALID_TOOLS, fallbackIntent: 'concept'
  })
  assert(f2.intent === 'concept', 'tool缺失：intent 保留 concept')
  assert(f2.tool === null, 'tool缺失：tool=null')
  assert(f2.degraded === 'tool_missing', 'tool缺失：degraded=tool_missing')

  // 兜底 2b: tool 非字符串
  const f2b = parseIntentResult('{"intent":"plan","tool":123,"tool_args":{}}', {
    validIntents: VALID_INTENTS, validTools: VALID_TOOLS, fallbackIntent: 'concept'
  })
  assert(f2b.tool === null && f2b.degraded === 'tool_missing', 'tool非字符串：降级 tool_missing')

  // 兜底 2c: tool 未注册
  const f2c = parseIntentResult('{"intent":"research","tool":"nonexistent_tool","tool_args":{}}', {
    validIntents: VALID_INTENTS, validTools: VALID_TOOLS, fallbackIntent: 'concept'
  })
  assert(f2c.intent === 'research', 'tool未注册：intent 保留 research')
  assert(f2c.tool === null, 'tool未注册：tool=null')
  assert(f2c.degraded === 'tool_not_registered', 'tool未注册：degraded=tool_not_registered')

  // 兜底 3: tool_args 不完整（缺失）
  const f3 = parseIntentResult('{"intent":"admission","tool":"query_university"}', {
    validIntents: VALID_INTENTS, validTools: VALID_TOOLS, fallbackIntent: 'concept'
  })
  assert(f3.intent === 'admission', 'tool_args缺失：intent 保留 admission')
  assert(f3.tool === null, 'tool_args缺失：tool=null')
  assert(f3.degraded === 'tool_args_incomplete', 'tool_args缺失：degraded=tool_args_incomplete')

  // 兜底 3b: tool_args 非对象（字符串）
  const f3b = parseIntentResult('{"intent":"plan","tool":"generate_plan","tool_args":"weeks=4"}', {
    validIntents: VALID_INTENTS, validTools: VALID_TOOLS, fallbackIntent: 'concept'
  })
  assert(f3b.tool === null && f3b.degraded === 'tool_args_incomplete', 'tool_args非对象：降级 tool_args_incomplete')

  // 兜底 3c: tool_args 是数组
  const f3c = parseIntentResult('{"intent":"research","tool":"recommend_papers","tool_args":[1,2]}', {
    validIntents: VALID_INTENTS, validTools: VALID_TOOLS, fallbackIntent: 'concept'
  })
  assert(f3c.tool === null && f3c.degraded === 'tool_args_incomplete', 'tool_args数组：降级 tool_args_incomplete')

  // 空 tool_args {} 视为完整（无必填参数的工具）
  const ok2 = parseIntentResult('{"intent":"admission","tool":"query_university","tool_args":{}}', {
    validIntents: VALID_INTENTS, validTools: VALID_TOOLS, fallbackIntent: 'concept'
  })
  assert(ok2.tool === 'query_university', '空tool_args{}：tool 保留（无必填参数）')
  assert(ok2.degraded === null, '空tool_args{}：degraded=null')

  // intent 非法 → fallback 但不阻断 tool
  const ok3 = parseIntentResult('{"intent":"unknown","tool":"query_university","tool_args":{"region":"南京"}}', {
    validIntents: VALID_INTENTS, validTools: VALID_TOOLS, fallbackIntent: 'concept'
  })
  assert(ok3.intent === 'concept', 'intent非法：退化为 concept')
  assert(ok3.tool === 'query_university', 'intent非法但tool合法：tool 保留')
  assert(ok3.degraded === null, 'intent非法但tool合法：degraded=null')

  console.log('  三种兜底 + 边界 共 22 项全通过')
}

// ============================================================
// [11] D3: tool_call 完整链路（调用 → 结果摘要 → 超时/失败）
// ============================================================
console.log('\n[11] D3: tool_call 调用链路 + 结果摘要')

{
  // query_university 正常调用
  const res = await callTool('query_university', { region: '南京', level: '985' })
  assert(res.ok === true, 'tool_call query_university ok')
  assert(res.data.count === 2, 'tool_call 返回 2 所南京985')
  assert(res.tool === 'query_university', 'tool_call 返回 tool 名')
  assert(typeof res.elapsedMs === 'number', 'tool_call 返回 elapsedMs')

  // search_knowledge mock 注入 → 完整链路
  const mockFn = (query, kb, graph, opts) => ({
    slices: [
      { id: 's1', content: 'MOSFET阈值电压推导', score: 0.9 },
      { id: 's2', content: '氧化层厚度影响', score: 0.7 }
    ],
    ragContext: 'MOSFET相关'
  })
  const skRes = await callTool('search_knowledge', { query: 'MOSFET', topK: 2 }, {
    knowledgeBase: [{ id: '1', content: 'test' }],
    graphRagRetrieve: mockFn
  })
  assert(skRes.ok === true, 'tool_call search_knowledge ok')
  assert(skRes.data.count === 2, 'tool_call search_knowledge 返回 2 条')
  assert(skRes.data.slices[0].id === 's1', 'tool_call 第一条 s1')

  // 工具超时 → 失败
  registerTool('d3_slow', async () => {
    await new Promise(r => setTimeout(r, 2000))
    return { late: true }
  }, { timeout: 100, description: 'D3超时测试' })
  const slowRes = await callTool('d3_slow', {})
  assert(slowRes.ok === false, 'tool_call 超时 ok=false')
  assert(slowRes.error.includes('timeout'), 'tool_call 超时错误含 timeout')

  // 工具异常 → 失败
  registerTool('d3_err', async () => { throw new Error('D3 intentional') }, { timeout: 1000, description: 'D3异常测试' })
  const errRes = await callTool('d3_err', {})
  assert(errRes.ok === false, 'tool_call 异常 ok=false')
  assert(errRes.error === 'D3 intentional', 'tool_call 异常信息透传')

  console.log('  query_university / search_knowledge / 超时 / 异常 全通过')
}


// ============================================================
// 结果汇总
// ============================================================
console.log('\n' + '='.repeat(60))
console.log(`📊 结果：${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('❌ 失败项：')
  failures.forEach(f => console.log(`   - ${f}`))
  process.exit(1)
} else {
  console.log('🎉 全部通过！')
}
