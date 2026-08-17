// ============================================================
// B2 契约测试 — AI 白板推导
// ============================================================
// 测试范围：
//   1. 推导步骤解析（parseSteps / normalizeSteps / countSteps / getCurrentStep）
//   2. 公式标记提取（extractFormulas / hasFormulaMarkers）
//   3. 序列化/反序列化（serializeSteps / deserializeSteps）
//   4. 回放数据读取（deserializeSteps 边界）
//   5. 流式累积场景（增量解析）
// ============================================================

import {
  parseSteps,
  countSteps,
  getCurrentStep,
  normalizeSteps,
  extractFormulas,
  hasFormulaMarkers,
  serializeSteps,
  deserializeSteps,
} from '../src/utils/derivationNormalize.js'

let passed = 0
let failed = 0

function assert(cond, msg) {
  if (cond) {
    passed++
  } else {
    failed++
    console.error(`  ✗ FAIL: ${msg}`)
  }
}

function assertEq(actual, expected, msg) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++
  } else {
    failed++
    console.error(`  ✗ FAIL: ${msg}`)
    console.error(`    expected: ${JSON.stringify(expected)}`)
    console.error(`    actual:   ${JSON.stringify(actual)}`)
  }
}

// ============================================================
console.log('\n=== B2 契约测试 ===\n')

// ---- 1. parseSteps 基本解析 ----
console.log('1. parseSteps 基本解析')

const sampleText = `### 步骤 1：建立基本方程

根据半导体物理，本征载流子浓度定义为导带电子与价带空穴的平衡浓度。

$$n_i = \\sqrt{N_c N_v} \\exp\\left(-\\frac{E_g}{2kT}\\right)$$

### 步骤 2：代入参数

对于硅，$N_c = 2.8 \\times 10^{19}$，$N_v = 1.04 \\times 10^{19}$，$E_g = 1.12$ eV。

### 步骤 3：结论

本征载流子浓度 $n_i \\approx 1.0 \\times 10^{10}$ cm$^{-3}$。`

const steps = parseSteps(sampleText)
assert(steps.length === 3, 'parseSteps 应返回 3 步')
assertEq(steps[0].index, 1, '步骤1 index=1')
assert(steps[0].title === '建立基本方程', '步骤1 title')
assert(steps[0].content.includes('$$n_i'), '步骤1 含公式')
assertEq(steps[1].index, 2, '步骤2 index=2')
assert(steps[1].title === '代入参数', '步骤2 title')
assertEq(steps[2].index, 3, '步骤3 index=3')
assert(steps[2].title === '结论', '步骤3 title')

// ---- 2. parseSteps 空输入 ----
console.log('2. parseSteps 空输入')

assertEq(parseSteps(''), [], '空字符串 → []')
assertEq(parseSteps(null), [], 'null → []')
assertEq(parseSteps(undefined), [], 'undefined → []')

// ---- 3. parseSteps 无步骤标题 → 整段作为单步 ----
console.log('3. parseSteps 无步骤标题')

const noHeader = '这是一段没有步骤标题的文本，包含公式 $E = mc^2$。'
const noHeaderSteps = parseSteps(noHeader)
assert(noHeaderSteps.length === 1, '无标题 → 1 步')
assertEq(noHeaderSteps[0].index, 1, '单步 index=1')
assert(noHeaderSteps[0].content === noHeader, '内容完整')

// ---- 4. parseSteps 容错：不完整标题 ----
console.log('4. parseSteps 容错')

const partialText = `### 步骤 1：开始

内容 A

### 步骤 2：继续`
const partialSteps = parseSteps(partialText)
assert(partialSteps.length === 2, '不完整步骤 → 2 步')
assert(partialSteps[1].content === '', '步骤2 内容为空')

// ---- 5. countSteps 流式计数 ----
console.log('5. countSteps 流式计数')

assertEq(countSteps(''), 0, '空 → 0 步')
assertEq(countSteps('### 步骤 1：开始\n内容'), 1, '1 步')
assertEq(countSteps('### 步骤 1：A\n内容\n### 步骤 2：B'), 2, '2 步')
assertEq(countSteps('无标题文本'), 0, '无标题 → 0')

// ---- 6. getCurrentStep 当前步骤 ----
console.log('6. getCurrentStep')

const cs1 = getCurrentStep('### 步骤 1：A\n内容 A')
assert(cs1 !== null, 'getCurrentStep 非 null')
assertEq(cs1.index, 1, '当前步骤 index=1')
assert(cs1.title === 'A', '当前步骤 title=A')

const cs2 = getCurrentStep('### 步骤 1：A\n内容\n### 步骤 2：B\n内容 B')
assertEq(cs2.index, 2, '当前步骤 index=2')
assert(cs2.content.includes('内容 B'), '当前步骤内容正确')

assertEq(getCurrentStep(''), null, '空 → null')
assertEq(getCurrentStep(null), null, 'null → null')

// ---- 7. normalizeSteps 归一化 ----
console.log('7. normalizeSteps')

const unsorted = [
  { index: 3, title: 'C', content: 'ccc' },
  { index: 1, title: 'A', content: 'aaa' },
  { index: 2, title: 'B', content: 'bbb' },
]
const normalized = normalizeSteps(unsorted)
assertEq(normalized[0].index, 1, '归一化后 [0] index=1')
assertEq(normalized[1].index, 2, '归一化后 [1] index=2')
assertEq(normalized[2].index, 3, '归一化后 [2] index=3')
assert(normalized[0].title === 'A', '归一化后 [0] title=A')

// 去重
const dupes = [
  { index: 1, title: 'A', content: '' },
  { index: 1, title: 'A', content: '有内容' },
]
const deduped = normalizeSteps(dupes)
assert(deduped.length === 1, '去重后 1 步')
assert(deduped[0].content === '有内容', '保留有内容的')

// 空数组
assertEq(normalizeSteps([]), [], '空数组 → []')
assertEq(normalizeSteps(null), [], 'null → []')

// ---- 8. extractFormulas 公式提取 ----
console.log('8. extractFormulas')

const formulaSteps = [
  { content: '行间公式 $$n_i = \\sqrt{N_c N_v}$$ 和行内 $E_g = 1.12$' },
  { content: '无公式文本' },
]
const formulas = extractFormulas(formulaSteps)
assert(formulas.length >= 2, '至少 2 个公式')
assert(formulas.some(f => f.includes('n_i')), '含 n_i 公式')
assert(formulas.some(f => f.includes('E_g')), '含 E_g 公式')

assertEq(extractFormulas([]), [], '空 → []')
assertEq(extractFormulas(null), [], 'null → []')

// ---- 9. hasFormulaMarkers ----
console.log('9. hasFormulaMarkers')

assert(hasFormulaMarkers(formulaSteps) === true, '有公式 → true')
assert(hasFormulaMarkers([{ content: '无公式' }]) === false, '无公式 → false')
assert(hasFormulaMarkers([]) === false, '空 → false')

// ---- 10. serializeSteps / deserializeSteps ----
console.log('10. serializeSteps / deserializeSteps')

const originalSteps = [
  { index: 1, title: '开始', content: '内容 A $E=mc^2$' },
  { index: 2, title: '结束', content: '内容 B $$F=ma$$' },
]
const serialized = serializeSteps(originalSteps)
assert(typeof serialized === 'string', 'serialize → string')
assert(serialized.includes('开始'), '含 title')
assert(serialized.includes('E=mc^2'), '含公式')

const deserialized = deserializeSteps(serialized)
assert(deserialized.length === 2, 'deserialize → 2 步')
assertEq(deserialized[0].index, 1, '反序列化 [0] index=1')
assert(deserialized[0].title === '开始', '反序列化 [0] title')
assert(deserialized[0].content.includes('E=mc^2'), '反序列化 [0] content 含公式')

// ---- 11. deserializeSteps 边界 ----
console.log('11. deserializeSteps 边界')

assertEq(deserializeSteps(null), [], 'null → []')
assertEq(deserializeSteps(''), [], '空串 → []')
assertEq(deserializeSteps('invalid json'), [], '非法 JSON → []')
assertEq(deserializeSteps('{}'), [], '非数组 → []')
assertEq(deserializeSteps([]), [], '空数组 → []')

// 直接传数组
const directArray = [{ index: 1, title: 'A', content: 'B' }]
const fromArray = deserializeSteps(directArray)
assert(fromArray.length === 1, '数组直传 → 1 步')
assertEq(fromArray[0].index, 1, '数组直传 index=1')

// 缺字段补全
const incomplete = [{ title: 'A' }, {}]
const completed = deserializeSteps(incomplete)
assert(completed.length === 2, '缺字段 → 2 步')
assertEq(completed[0].index, 1, '缺字段 [0] index=1')
assertEq(completed[1].index, 2, '缺字段 [1] index=2')
assert(completed[0].title === 'A', '缺字段 [0] title=A')
assert(completed[1].title === '步骤 2', '缺字段 [1] title 默认')

// ---- 12. 流式增量解析模拟 ----
console.log('12. 流式增量解析模拟')

// 模拟逐步到达的文本
const chunks = [
  '### 步骤 1：建立方程\n\n根据',
  '半导体物理，本征载流子浓度为 $n_i$。\n\n',
  '### 步骤 2：代入数值\n\n代入 $N_c = 2.8',
  '\\times 10^{19}$。\n\n### 步骤 3：结论',
  '\n\n结果 $n_i \\approx 10^{10}$。',
]

let accumulated = ''
let lastStepCount = 0
for (const chunk of chunks) {
  accumulated += chunk
  const sc = countSteps(accumulated)
  assert(sc >= lastStepCount, `流式计数递增 (${sc} >= ${lastStepCount})`)
  lastStepCount = sc

  // 每次都能解析出步骤
  const currentSteps = parseSteps(accumulated)
  assert(currentSteps.length === sc, `parseSteps 与 countSteps 一致 (${currentSteps.length} === ${sc})`)
}

// 最终解析
const finalSteps = parseSteps(accumulated)
assert(finalSteps.length === 3, '最终 3 步')
assert(finalSteps[2].title === '结论', '最终步骤标题')
assert(hasFormulaMarkers(finalSteps), '最终含公式标记')

// ---- 13. 实际考研场景：MOSFET I-V 推导 ----
console.log('13. MOSFET I-V 推导场景')

const mosfetText = `### 步骤 1：MOSFET 工作区分析

考虑 NMOS 在饱和区的工作状态，漏极电流方程为：

$$I_D = \\frac{1}{2} \\mu_n C_{ox} \\frac{W}{L} (V_{GS} - V_{TH})^2$$

### 步骤 2：跨导推导

跨导 $g_m$ 定义为 $\\partial I_D / \\partial V_{GS}$：

$$g_m = \\mu_n C_{ox} \\frac{W}{L} (V_{GS} - V_{TH})$$

### 步骤 3：物理含义

跨导表征栅压对漏极电流的控制能力，$\\mu_n C_{ox}$ 是工艺增益参数。`

const mosfetSteps = parseSteps(mosfetText)
assert(mosfetSteps.length === 3, 'MOSFET 推导 3 步')
assert(mosfetSteps[0].content.includes('I_D'), '步骤1 含 I_D 公式')
assert(mosfetSteps[1].content.includes('g_m'), '步骤2 含 g_m 公式')
assert(hasFormulaMarkers(mosfetSteps), 'MOSFET 推导含公式标记')

const mosfetFormulas = extractFormulas(mosfetSteps)
assert(mosfetFormulas.length >= 3, 'MOSFET 至少 3 个公式')

// 序列化+反序列化往返
const mosfetSerialized = serializeSteps(mosfetSteps)
const mosfetRoundtrip = deserializeSteps(mosfetSerialized)
assert(mosfetRoundtrip.length === 3, '往返 3 步')
assert(mosfetRoundtrip[0].content.includes('I_D'), '往返步骤1 含公式')

// ---- 14. 步骤标题变体 ----
console.log('14. 步骤标题变体')

const variantText = `### 步骤1:基本方程

内容 A

### 步骤 2：代入

内容 B`

const variantSteps = parseSteps(variantText)
assert(variantSteps.length === 2, '标题变体 → 2 步')
assert(variantSteps[0].title === '基本方程', '变体 [0] title')
assert(variantSteps[1].title === '代入', '变体 [1] title')

// ---- 汇总 ----
console.log(`\n=== B2 契约测试结果：${passed} pass / ${failed} fail ===\n`)

if (failed > 0) {
  process.exit(1)
}
