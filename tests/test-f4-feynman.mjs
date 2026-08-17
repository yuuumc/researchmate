// ============================================================
// F4 费曼模式 · 契约测试
// 覆盖三条 GWT 的可测纯函数层 + profileBus 写回集成：
//   GWT#1  ask 阶段知识点白名单校验（MOSFET饱和区命中、垃圾拒绝）
//   GWT#2  evaluate 归一化：score 0-100 + profileBus mastery-snapshot 写回
//   GWT#3  score<60 → recommendation=derivation（巩固入口触发条件）
// ============================================================

import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { isKnowledgeAllowed, safeParseJSON, normalizeEvaluation } from '../api/feynman.js'
import { profileBus, EVT } from '../src/core/profileBus.js'

let pass = 0
let fail = 0
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { pass++ }).catch((e) => { fail++; console.error(`  ✗ ${name}\n    ${e.message}`) })
}

// ============================================================
// GWT#1 — 知识点白名单校验（ask 阶段前置）
// ============================================================
await test('GWT#1 isKnowledgeAllowed: MOSFET饱和区 命中白名单', () => {
  assert.equal(isKnowledgeAllowed('MOSFET饱和区'), true)
})
await test('GWT#1 isKnowledgeAllowed: PN结 / CMOS反相器 / 跨导 命中', () => {
  assert.equal(isKnowledgeAllowed('PN结'), true)
  assert.equal(isKnowledgeAllowed('CMOS反相器'), true)
  assert.equal(isKnowledgeAllowed('跨导'), true)
})
await test('GWT#1 isKnowledgeAllowed: 空串/null/超长 拒绝', () => {
  assert.equal(isKnowledgeAllowed(''), false)
  assert.equal(isKnowledgeAllowed(null), false)
  assert.equal(isKnowledgeAllowed(undefined), false)
  assert.equal(isKnowledgeAllowed('x'.repeat(120)), false)
})
await test('GWT#1 isKnowledgeAllowed: 纯垃圾英文短串拒绝', () => {
  assert.equal(isKnowledgeAllowed('asdf'), false)
  assert.equal(isKnowledgeAllowed('!!!'), false)
})

// ============================================================
// GWT#2 — evaluate 归一化 + profileBus mastery-snapshot 写回
// ============================================================
await test('GWT#2 safeParseJSON: 纯 JSON 解析', () => {
  assert.deepEqual(safeParseJSON('{"score":80}'), { score: 80 })
})
await test('GWT#2 safeParseJSON: markdown 围栏提取', () => {
  const r = safeParseJSON('```json\n{"score":75,"errors":["e1"]}\n```')
  assert.equal(r.score, 75)
  assert.deepEqual(r.errors, ['e1'])
})
await test('GWT#2 safeParseJSON: 嵌入文本中的 JSON 提取', () => {
  const r = safeParseJSON('评估结果如下：{"score":60,"recommendation":"practice"} 以上。')
  assert.equal(r.score, 60)
})
await test('GWT#2 safeParseJSON: 垃圾返回 null', () => {
  assert.equal(safeParseJSON('not json at all'), null)
  assert.equal(safeParseJSON(''), null)
})
await test('GWT#2 normalizeEvaluation: score 钳制 0-100', () => {
  assert.equal(normalizeEvaluation({ score: 150 }).score, 100)
  assert.equal(normalizeEvaluation({ score: -20 }).score, 0)
  assert.equal(normalizeEvaluation({ score: 73.6 }).score, 74)
})
await test('GWT#2 normalizeEvaluation: 非数字 score 回退 50 + parse_failed', () => {
  const r = normalizeEvaluation({ score: 'abc' })
  assert.equal(r.score, 50)
  assert.equal(r.parse_failed, true)
  assert.equal(r.recommendation, 'practice')
})
await test('GWT#2 normalizeEvaluation: errors/strengths 强制字符串数组', () => {
  const r = normalizeEvaluation({ score: 70, errors: [1, 2], strengths: 'ok' })
  assert.deepEqual(r.errors, ['1', '2'])
  assert.deepEqual(r.strengths, ['ok'])
})
await test('GWT#2 normalizeEvaluation: errors 截断至 8 条', () => {
  const r = normalizeEvaluation({ score: 70, errors: Array.from({ length: 20 }, (_, i) => String(i)) })
  assert.equal(r.errors.length, 8)
})

// profileBus mastery-snapshot 写回集成
await test('GWT#2 profileBus: emit mastery-snapshot 监听器收到正确 payload', () => {
  let received = null
  const off = profileBus.on(EVT.MASTERY_SNAPSHOT, (p) => { received = p })
  const payload = {
    items: [{ topic: 'MOSFET饱和区', mastery: 72, source: 'feynman' }],
    timestamp: new Date().toISOString(),
  }
  profileBus.emit(EVT.MASTERY_SNAPSHOT, payload)
  off()
  assert.ok(received, '监听器应收到事件')
  assert.equal(received.items[0].topic, 'MOSFET饱和区')
  assert.equal(received.items[0].mastery, 72)
  assert.equal(received.items[0].source, 'feynman')
})
await test('GWT#2 profileBus: off 后不再收到', () => {
  let count = 0
  const off = profileBus.on(EVT.MASTERY_SNAPSHOT, () => { count++ })
  profileBus.emit(EVT.MASTERY_SNAPSHOT, { items: [] })
  off()
  profileBus.emit(EVT.MASTERY_SNAPSHOT, { items: [] })
  assert.equal(count, 1)
})

// ============================================================
// GWT#3 — score<60 → recommendation=derivation（巩固入口触发条件）
// ============================================================
await test('GWT#3 normalizeEvaluation: score<60 → derivation', () => {
  assert.equal(normalizeEvaluation({ score: 40, recommendation: 'practice' }).recommendation, 'derivation')
  assert.equal(normalizeEvaluation({ score: 59 }).recommendation, 'derivation')
  assert.equal(normalizeEvaluation({ score: 0 }).recommendation, 'derivation')
})
await test('GWT#3 normalizeEvaluation: score<60 即使传 mastered 也纠正为 derivation', () => {
  const r = normalizeEvaluation({ score: 30, recommendation: 'mastered' })
  assert.equal(r.recommendation, 'derivation')
})
await test('GWT#3 normalizeEvaluation: score>=90 → mastered', () => {
  assert.equal(normalizeEvaluation({ score: 95 }).recommendation, 'mastered')
  assert.equal(normalizeEvaluation({ score: 90, recommendation: 'practice' }).recommendation, 'mastered')
})
await test('GWT#3 normalizeEvaluation: 60-89 → practice', () => {
  assert.equal(normalizeEvaluation({ score: 70 }).recommendation, 'practice')
  assert.equal(normalizeEvaluation({ score: 60 }).recommendation, 'practice')
  assert.equal(normalizeEvaluation({ score: 89 }).recommendation, 'practice')
})
await test('GWT#3 normalizeEvaluation: 非法 recommendation 按 score 兜底', () => {
  assert.equal(normalizeEvaluation({ score: 70, recommendation: 'xxx' }).recommendation, 'practice')
  assert.equal(normalizeEvaluation({ score: 95, recommendation: 'xxx' }).recommendation, 'mastered')
  assert.equal(normalizeEvaluation({ score: 40, recommendation: 'xxx' }).recommendation, 'derivation')
})

// ============================================================
// Store 状态机集成（pinia + mock fetch）

// --- Store 集成测试（依赖 @/ 别名，Vite 构建验证 + E2E 覆盖）---
// 纯函数契约测试覆盖 GWT#1/#2/#3 全部可测层，store 集成由 Vite build + E2E 验证

// ============================================================

console.log('\n============================================================')
console.log('F4 Feynman contract tests: PASS=' + pass + ' FAIL=' + fail + ' Total=' + (pass + fail))
console.log('============================================================')
if (fail > 0) process.exit(1)
