// ============================================================
// B5 架构看板契约测试
// 覆盖：architecture.js 纯函数的关键分支
// 运行：node tests/test-b5.mjs（ECS /root/yanxintong 下）
// 注：用相对路径 import，避开 Vite @ 别名
// ============================================================
import {
  normalizeTrace,
  aggregateByAgent,
  overviewStats,
  fmtDuration,
  fmtTime,
  fmtPercent,
  fmtTokens,
  statusMeta,
  roleMeta,
  extractLinks,
  AGENT_ROLE_META
} from '../src/utils/architecture.js'

let pass = 0
let fail = 0
function ok(name, cond, extra = '') {
  if (cond) {
    pass++
    // console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.error(`  ✕ ${name} ${extra}`)
  }
}

console.log('\n[B5] 架构看板契约测试\n')

// ---- normalizeTrace ----
console.log('normalizeTrace')
const n1 = normalizeTrace({ id: 't1', agent_role: 'diagnose', action: 'diagnose', status: 'done', created_at: '2026-08-17T03:00:00Z' })
ok('保留已有字段', n1.id === 't1' && n1.agent_role === 'diagnose')
const n2 = normalizeTrace(null)
ok('null 输入给安全默认', n2.status === 'done' && n2.tool_calls_trace.length === 0 && n2.usage === null)
const n3 = normalizeTrace({ tool_calls_trace: 'not-array', usage: 'x' })
ok('非法类型字段降级', n3.tool_calls_trace.length === 0 && n3.usage === null)
const n4 = normalizeTrace({ agent: 'tutor' })  // 兼容 agent 别名
ok('兼容 agent 别名字段', n4.agent_role === 'tutor')

// ---- aggregateByAgent ----
console.log('aggregateByAgent')
const traces = [
  { id: 'a', agent_role: 'diagnose', status: 'done', created_at: '2026-08-17T01:00:00Z', usage: { total_tokens: 100 } },
  { id: 'b', agent_role: 'diagnose', status: 'error', created_at: '2026-08-17T03:00:00Z', usage: { total_tokens: 50 } },
  { id: 'c', agent_role: 'tutor', status: 'done', created_at: '2026-08-17T02:00:00Z', usage: { total_tokens: 80 } },
  { id: 'd', agent_role: 'tutor', status: 'done', created_at: '2026-08-17T04:00:00Z' }
]
const agg = aggregateByAgent(traces)
ok('按角色聚合且按调用数降序', agg.length === 2 && agg[0].role === 'diagnose' && agg[0].total === 2)
ok('成功率计算正确', agg[0].successRate === 0.5)
ok('最近活跃取最大时间', agg[0].lastActive === '2026-08-17T03:00:00Z')
ok('累计 tokens（含缺失 usage 跳过）', agg[0].totalTokens === 150 && agg[1].totalTokens === 80)
ok('未知状态不归入 done/error/running', agg[0].error === 1 && agg[0].done === 1)
ok('空输入返回空数组', aggregateByAgent([]).length === 0)
ok('null 输入返回空数组', aggregateByAgent(null).length === 0)

// ---- overviewStats ----
console.log('overviewStats')
const st = overviewStats(traces)
ok('总调用数', st.totalCalls === 4)
ok('Agent 角色数', st.agentCount === 2)
ok('成功率 = done/total', st.successRate === 0.75)
ok('最近调用时间', st.lastCallAt === '2026-08-17T04:00:00Z')
const st0 = overviewStats([])
ok('空列表成功率 0', st0.successRate === 0 && st0.lastCallAt === null)

// ---- fmtDuration ----
console.log('fmtDuration')
ok('<1000ms 显示 ms', fmtDuration(500) === '500ms')
ok('>=1000ms 显示 s 保留 1 位', fmtDuration(2500) === '2.5s')
ok('null 返回空串', fmtDuration(null) === '')
ok('非数字返回空串', fmtDuration('x') === '')

// ---- fmtTime ----
console.log('fmtTime')
ok('格式 MM-DD HH:mm', /^\d{2}-\d{2} \d{2}:\d{2}$/.test(fmtTime('2026-08-17T03:30:00Z')))
ok('空输入返回空串', fmtTime(null) === '')
ok('非法日期返回空串', fmtTime('not-a-date') === '')

// ---- statusMeta ----
console.log('statusMeta')
ok('done → is-done', statusMeta('done').className === 'is-done')
ok('error → is-error', statusMeta('error').className === 'is-error')
ok('running → is-running', statusMeta('running').className === 'is-running')
ok('未知状态 → is-unknown', statusMeta('foo').className === 'is-unknown')

// ---- roleMeta ----
console.log('roleMeta')
ok('已知角色命中 META', roleMeta('diagnose').label === '诊断 Agent')
ok('未知角色走 fallback 保留原名', roleMeta('newbot').label === 'newbot')
ok('大小写不敏感', roleMeta('TUTOR').label === '导师 Agent')
ok('空角色走 fallback', roleMeta(null).label === '未知 Agent')

// ---- extractLinks ----
console.log('extractLinks')
ok('提取 http 链接', extractLinks('见 https://example.com/x 详情').length === 1)
ok('多链接去重', extractLinks('a https://a.com b https://a.com').length === 1)
ok('无链接返回空', extractLinks('无链接文本').length === 0)
ok('空输入返回空', extractLinks(null).length === 0)

// ---- fmtPercent / fmtTokens ----
console.log('fmtPercent / fmtTokens')
ok('fmtPercent 整数百分比', fmtPercent(0.5) === '50%')
ok('fmtPercent 非数返回 —', fmtPercent('x') === '—')
ok('fmtTokens 取 total_tokens', fmtTokens({ total_tokens: 120 }) === '120 tokens')
ok('fmtTokens 无 usage 返回空', fmtTokens(null) === '')

// ---- 边界：unknown 角色也被聚合 ----
console.log('边界场景')
const mixed = aggregateByAgent([
  { agent_role: 'custom-agent', status: 'done' },
  { agent_role: 'custom-agent', status: 'running' }
])
ok('未知角色正常聚合', mixed.length === 1 && mixed[0].total === 2 && mixed[0].running === 1)
ok('ARCHITECTURE META 已登记 router 角色', !!AGENT_ROLE_META.router)

// ---- 汇总 ----
console.log(`\n${pass} pass / ${fail} fail`)
if (fail > 0) {
  console.error('B5 契约测试存在失败项')
  process.exit(1)
}
console.log('\nB5 契约测试全部通过 ✅')
