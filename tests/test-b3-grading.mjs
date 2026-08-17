// ============================================================
// B3 契约测试 — P2-3 容差裁定 + 变式题链路
// ============================================================
// 测试范围：
//   1. P2-3 数值容差（max(绝对容差, 相对容差 × |正确答案|)）
//   2. 边界断言（2.5→3.4 判错、24.2→25.3 判对）
//   3. 变式题数据归一化（variantNormalize）
//   4. 变式题校验（question_type 一致、correct_answer 非空、choice options 长度 4）
// ============================================================

import {
  gradeObjective,
  computeTolerance,
  ABS_TOLERANCE,
  REL_TOLERANCE,
  normalizeFillText,
  getCorrectedAnswer,
} from '../src/utils/grading.js'

import {
  normalizeVariant,
  validateVariant,
  buildVariantPrompt,
} from '../src/utils/variantNormalize.js'

let passed = 0
let failed = 0

function assert(cond, msg) {
  if (cond) { passed++ } else { failed++; console.error(`  ✗ FAIL: ${msg}`) }
}

function assertEq(actual, expected, msg) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++ }
  else {
    failed++
    console.error(`  ✗ FAIL: ${msg}`)
    console.error(`    expected: ${JSON.stringify(expected)}`)
    console.error(`    actual:   ${JSON.stringify(actual)}`)
  }
}

console.log('\n=== B3 契约测试 ===\n')

// ============================================================
// 1. P2-3 容差配置
// ============================================================
console.log('1. P2-3 容差配置')

assertEq(ABS_TOLERANCE, 0.5, '绝对容差 = 0.5')
assertEq(REL_TOLERANCE, 0.05, '相对容差 = 5%')

// ---- 2. computeTolerance ----
console.log('2. computeTolerance')

assertEq(computeTolerance(2.5), Math.max(0.5, 0.05 * 2.5), 'tolerance(2.5) = max(0.5, 0.125) = 0.5')
assert(computeTolerance(2.5) === 0.5, 'tolerance(2.5) = 0.5')
assertEq(computeTolerance(24.2), Math.max(0.5, 0.05 * 24.2), 'tolerance(24.2) = max(0.5, 1.21) = 1.21')
assert(computeTolerance(24.2) === 1.21, 'tolerance(24.2) = 1.21')
assertEq(computeTolerance(0), 0.5, 'tolerance(0) = 0.5 (绝对档兜底)')
assertEq(computeTolerance(100), 5, 'tolerance(100) = 5')
assertEq(computeTolerance(-10), 0.5, 'tolerance(-10) = 0.5 (绝对值 10×5%=0.5)')
assertEq(computeTolerance(10), 0.5, 'tolerance(10) = 0.5 (10×5%=0.5)')

// ---- 3. 边界断言（PM 指定） ----
console.log('3. 边界断言（PM 指定）')

// 正确答案 2.5 时 3.4 判错
const q25 = { correct_answer: '2.5', question_type: 'fill', stem: '计算值', options: null }
assert(gradeObjective(q25, '3.4') === false, '正确答案 2.5, 用户 3.4 → 判错')
// 正确答案 24.2 时 25.3 判对
const q242 = { correct_answer: '24.2', question_type: 'fill', stem: '计算值', options: null }
assert(gradeObjective(q242, '25.3') === true, '正确答案 24.2, 用户 25.3 → 判对')

// ---- 4. 更多容差边界 ----
console.log('4. 更多容差边界')

// 精确匹配
assert(gradeObjective(q25, '2.5') === true, '2.5 → 2.5 精确匹配 → 判对')
assert(gradeObjective(q242, '24.2') === true, '24.2 → 24.2 精确匹配 → 判对')

// 容差边界内
assert(gradeObjective(q25, '2.0') === true, '2.5 → 2.0 (diff=0.5≤0.5) → 判对')
assert(gradeObjective(q25, '3.0') === true, '2.5 → 3.0 (diff=0.5≤0.5) → 判对')
assert(gradeObjective(q242, '23.0') === true, '24.2 → 23.0 (diff=1.2≤1.21) → 判对')
assert(gradeObjective(q242, '25.41') === true, '24.2 → 25.41 (diff=1.21≤1.21) → 判对')

// 容差边界外
assert(gradeObjective(q25, '3.01') === false, '2.5 → 3.01 (diff=0.51>0.5) → 判错')
assert(gradeObjective(q242, '22.98') === false, '24.2 → 22.98 (diff=1.22>1.21) → 判错')
assert(gradeObjective(q242, '25.42') === false, '24.2 → 25.42 (diff=1.22>1.21) → 判错')

// 选择题不受数值容差影响
const qChoice = { correct_answer: 'A', question_type: 'choice', stem: '选择题', options: ['A. 1', 'B. 2', 'C. 3', 'D. 4'] }
assert(gradeObjective(qChoice, 'A') === true, '选择题 A → A 判对')
assert(gradeObjective(qChoice, 'B') === false, '选择题 A → B 判错')
assert(gradeObjective(qChoice, 'a') === true, '选择题 A → a 判对（大小写不敏感）')

// Bug4 订正：Wp/Wn
const qWpWn = { correct_answer: 'A', question_type: 'choice', stem: 'Wp/Wn 比值', options: ['A. 1', 'B. 2'] }
assert(gradeObjective(qWpWn, '2.5') === true, 'Wp/Wn 订正 → 2.5 判对')
assert(gradeObjective(qWpWn, '3.5') === false, 'Wp/Wn 订正 → 3.5 判错（diff=1.0>0.5）')

// ---- 5. 变式题归一化 ----
console.log('5. 变式题归一化')

const rawVariant = {
  stem: 'T=300K 时，求锗的本征载流子浓度 $n_i$。',
  question_type: 'fill',
  options: null,
  correct_answer: '约 $2.4\\times10^{13}\\,\\mathrm{cm^{-3}}$',
  explanation: '本题考查【载流子统计】...',
  knowledge_point: '载流子统计',
}

const normalized = normalizeVariant(rawVariant)
assert(normalized.stem !== '', '归一化后 stem 非空')
assert(normalized.question_type === 'fill', '归一化后 question_type=fill')
assert(normalized.correct_answer !== '', '归一化后 correct_answer 非空')
assert(normalized.options === null, 'fill 题 options=null')
assert(normalized.knowledge_point === '载流子统计', '归一化后 knowledge_point')

// choice 题归一化
const rawChoice = {
  stem: 'PN 结反偏增大时，耗尽层宽度如何变化？',
  question_type: 'choice',
  options: ['A. 增大', 'B. 减小', 'C. 不变', 'D. 先减后增'],
  correct_answer: 'A',
  explanation: '反偏使势垒升高...',
  knowledge_point: 'PN结',
}
const normChoice = normalizeVariant(rawChoice)
assert(normChoice.question_type === 'choice', 'choice 归一化')
assert(Array.isArray(normChoice.options) && normChoice.options.length === 4, 'choice options 长度 4')

// ---- 6. 变式题校验 ----
console.log('6. 变式题校验')

// 合法 fill
const validFill = validateVariant(rawVariant, 'fill')
assert(validFill.valid === true, '合法 fill 变式 → valid')
assertEq(validFill.errors.length, 0, '合法 fill 无错误')

// 合法 choice
const validChoice = validateVariant(rawChoice, 'choice')
assert(validChoice.valid === true, '合法 choice 变式 → valid')

// 题型不一致
const wrongType = validateVariant(rawVariant, 'choice')
assert(wrongType.valid === false, '题型不一致 → invalid')
assert(wrongType.errors.some(e => e.includes('question_type')), '错误含 question_type 不一致')

// correct_answer 为空
const noAnswer = validateVariant({ ...rawVariant, correct_answer: '' }, 'fill')
assert(noAnswer.valid === false, 'correct_answer 空 → invalid')

// choice options 不足 4
const shortOptions = validateVariant({
  ...rawChoice, options: ['A. 1', 'B. 2']
}, 'choice')
assert(shortOptions.valid === false, 'options < 4 → invalid')

// choice correct_answer 不在 ABCD
const badAnswer = validateVariant({
  ...rawChoice, correct_answer: 'E'
}, 'choice')
assert(badAnswer.valid === false, 'correct_answer=E → invalid')

// ---- 7. buildVariantPrompt ----
console.log('7. buildVariantPrompt')

const prompt = buildVariantPrompt({
  original_stem: '求硅的本征载流子浓度',
  knowledge_point: '载流子统计',
  question_type: 'fill',
  correct_answer: '1.0e10',
  variant_count: 1,
})

assert(typeof prompt === 'string', 'prompt → string')
assert(prompt.includes('载流子统计'), 'prompt 含知识点')
assert(prompt.includes('fill'), 'prompt 含题型')
assert(prompt.includes('1.0e10'), 'prompt 含原答案')
assert(prompt.includes('variant_questions'), 'prompt 含输出格式说明')

// ---- 8. normalizeVariant 边界 ----
console.log('8. normalizeVariant 边界')

assertEq(normalizeVariant(null), null, 'null → null')
assertEq(normalizeVariant({}), null, '空对象 → null')

const minimal = normalizeVariant({ stem: '题干', question_type: 'fill', correct_answer: '42' })
assert(minimal !== null, '最小 fill → 非 null')
assert(minimal.options === null, '最小 fill options=null')
assert(minimal.explanation === '', '最小 fill explanation=空串')

// ---- 9. 变式题不污染原题 ----
console.log('9. 变式题不污染原题')

// 模拟变式题判分：变式题有独立的 correct_answer，与原题无关
const originalQ = { correct_answer: '2.5', question_type: 'fill', stem: '原题', options: null }
const variantQ = normalizeVariant({
  stem: '变式题：求锗的本征载流子浓度',
  question_type: 'fill',
  options: null,
  correct_answer: '2.4e13',
  explanation: '...',
  knowledge_point: '载流子统计',
})

// 变式题用自己的 correct_answer 判分
assert(gradeObjective({ ...variantQ, correct_answer: variantQ.correct_answer }, '2.4e13') === true, '变式题用自身答案判对')
assert(gradeObjective({ ...variantQ, correct_answer: variantQ.correct_answer }, '999') === false, '变式题用自身答案判错')
// 原题不受影响
assert(gradeObjective(originalQ, '2.5') === true, '原题判分不受变式题影响')

// ---- 汇总 ----
console.log(`\n=== B3 契约测试结果：${passed} pass / ${failed} fail ===\n`)

if (failed > 0) {
  process.exit(1)
}
