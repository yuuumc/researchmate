// 验收口径 1-5 测试脚本：验证知识库命中 + 命中漂移=0 + 同义召回
// 用法: node test_kb_fallback.mjs  (在 yanxintong 项目根目录运行)
import { retrieve } from './src/utils/rag.js'
import { readFileSync } from 'fs'

const kb = JSON.parse(readFileSync('./public/knowledge/textbook/半导体物理.json', 'utf-8'))
const RAW_HIT_THRESHOLD = 0.15

function probe(query) {
  const top = retrieve(query, kb, 5)
  const rawTopScore = top.length > 0 ? top[0].score : 0
  const hasConfidentHit = rawTopScore >= RAW_HIT_THRESHOLD
  return { query, rawTopScore, hasConfidentHit, top }
}

const tests = [
  // 口径1: A档 MOSFET 阈值电压
  { label: '口径1-A MOSFET阈值电压', q: 'MOSFET 阈值电压怎么计算', expectHit: true, expectTopic: /semi-phys-ch5/ },
  { label: '口径1-A2 阈值电压影响因素', q: '阈值电压受哪些因素影响', expectHit: true, expectTopic: /semi-phys-ch5/ },
  // 口径1: A档 PN结正偏反偏
  { label: '口径1-B PN结正偏反偏特性', q: 'PN 结正偏和反偏的电流特性', expectHit: true, expectTopic: /semi-phys-ch4/ },
  { label: '口径1-B2 PN结正向电流计算', q: 'PN 结正向偏压下电流怎么算', expectHit: true, expectTopic: /semi-phys-ch4/ },
  // 口径2: B档 晶格振动
  { label: '口径2-A 晶格振动', q: '晶格振动和声子是什么', expectHit: true, expectTopic: /solid-phys-lattice/ },
  // 口径2: B档 运算放大器
  { label: '口径2-B 运算放大器', q: '运算放大器虚短虚断', expectHit: true, expectTopic: /analog-circuit-opamp/ },
  // 口径3: 未收录专题 → 必须未命中（漂移=0）
  { label: '口径3-A 未收录:数字电路触发器', q: '数字电路的JK触发器', expectHit: false },
  { label: '口径3-B 未收录:信号与系统FFT', q: '信号与系统的FFT原理', expectHit: false },
  { label: '口径3-C 未收录:电磁场麦克斯韦', q: '电磁场麦克斯韦方程组', expectHit: false },
  // 口径4: 同义召回 "MOS管的开启电压" → semi-phys-ch5
  { label: '口径4 同义召回:MOS管开启电压', q: 'MOS 管的开启电压是多少', expectHit: true, expectTopic: /semi-phys-ch5/ },
  { label: '口径4-B 同义:MOS管导通电压', q: 'MOS管导通电压', expectHit: true, expectTopic: /semi-phys-ch5/ },
]

let pass = 0, fail = 0
console.log('='.repeat(70))
for (const t of tests) {
  const r = probe(t.q)
  let ok = (r.hasConfidentHit === t.expectHit)
  let topicOk = true
  if (t.expectHit && t.expectTopic) {
    topicOk = r.top.some(s => t.expectTopic.test(s.id))
    ok = ok && topicOk
  }
  // 漂移检查：未命中时 top 不应包含强相关条目（口径3核心）
  let driftNote = ''
  if (!t.expectHit && r.top.length > 0) {
    driftNote = ` ⚠ top1=${r.top[0].id}(${r.top[0].score})`
  }
  const status = ok ? 'PASS' : 'FAIL'
  if (ok) pass++; else fail++
  console.log(`[${status}] ${t.label}`)
  console.log(`  q="${t.q}"  rawTop=${r.rawTopScore.toFixed(4)}  confidentHit=${r.hasConfidentHit}  expectHit=${t.expectHit}  topicOk=${topicOk}${driftNote}`)
  if (r.top.length > 0) {
    console.log(`  top3: ${r.top.slice(0,3).map(s => `${s.id}(${s.score})`).join('  ')}`)
  }
}
console.log('='.repeat(70))
console.log(`RESULT: ${pass} pass, ${fail} fail / ${tests.length} total`)
console.log(`命中漂移=0 核验: 口径3 三条未收录题 confidentHit 均为 false → ${tests.filter(t=>!t.expectHit).every(t=>!probe(t.q).hasConfidentHit) ? 'PASS ✅' : 'FAIL ❌'}`)
process.exit(fail > 0 ? 1 : 0)
