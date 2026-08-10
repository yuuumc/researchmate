// ============================================================
// 向量模块验证脚本（P0-1 GraphRAG 双路融合）
// ============================================================
// 验证 vector.js 的 textToVector / cosineSimilarity / minMaxNormalize
//
// 运行：node scripts/test-vector.mjs
// ============================================================

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 动态导入源码
const vectorUrl = new URL('../src/utils/vector.js', import.meta.url)
const tokenizeUrl = new URL('../src/utils/tokenize.js', import.meta.url)
const { textToVector, cosineSimilarity, minMaxNormalize, isZeroVector, fnv1a, VECTOR_DIM } = await import(vectorUrl.href)
await import(tokenizeUrl.href) // ensure tokenize is loaded

let passed = 0
let failed = 0

function assert(name, cond, detail = '') {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

console.log('═══════════════════════════════════════════════════════════════')
console.log('  向量模块验证 · test-vector.mjs')
console.log('═══════════════════════════════════════════════════════════════\n')

// ============================================================
// 1. textToVector 基本属性
// ============================================================
console.log('▸ 1. textToVector 基本属性')

const vec1 = textToVector('MOSFET 阈值电压')
assert('向量维度 = VECTOR_DIM', vec1.length === VECTOR_DIM, `got ${vec1.length}`)
assert('向量非全零', !isZeroVector(vec1))
assert('向量是 Float64Array', vec1 instanceof Float64Array)

// L2 归一化验证
let l2norm = 0
for (let i = 0; i < vec1.length; i++) l2norm += vec1[i] * vec1[i]
l2norm = Math.sqrt(l2norm)
assert('L2 归一化（norm ≈ 1）', Math.abs(l2norm - 1) < 0.01, `norm=${l2norm}`)

// 空文本
const emptyVec = textToVector('')
assert('空文本 → 全零向量', isZeroVector(emptyVec))

// null/undefined
assert('null → 全零向量', isZeroVector(textToVector(null)))
assert('undefined → 全零向量', isZeroVector(textToVector(undefined)))

// ============================================================
// 2. 确定性（同文本 → 同向量）
// ============================================================
console.log('\n▸ 2. 确定性')

const vec2 = textToVector('MOSFET 阈值电压')
let sameCount = 0
for (let i = 0; i < vec1.length; i++) {
  if (vec1[i] === vec2[i]) sameCount++
}
assert('同文本 → 同向量（逐字节一致）', sameCount === VECTOR_DIM)

// ============================================================
// 3. 余弦相似度
// ============================================================
console.log('\n▸ 3. 余弦相似度')

// 相同文本 → similarity = 1
const simSelf = cosineSimilarity(vec1, vec2)
assert('同文本相似度 = 1.0', Math.abs(simSelf - 1.0) < 0.01, `got ${simSelf}`)

// 相似文本 → 高相似度
const vecSimilar = textToVector('MOSFET 的阈值电压推导')
const simSimilar = cosineSimilarity(vec1, vecSimilar)
assert('相似文本相似度 > 0.5', simSimilar > 0.5, `got ${simSimilar}`)

// 不同文本 → 低相似度
const vecDifferent = textToVector('太阳能电池工作原理')
const simDiff = cosineSimilarity(vec1, vecDifferent)
assert('不同文本相似度 < 0.3', simDiff < 0.3, `got ${simDiff}`)

// 全零向量 → similarity = 0
const simZero = cosineSimilarity(emptyVec, vec1)
assert('全零向量相似度 = 0', simZero === 0)

// ============================================================
// 4. FNV-1a 哈希稳定性
// ============================================================
console.log('\n▸ 4. FNV-1a 哈希稳定性')

const h1 = fnv1a('MOSFET')
const h2 = fnv1a('MOSFET')
assert('同字符串同哈希', h1 === h2)
assert('哈希在 [0, 2^32) 范围内', h1 >= 0 && h1 < 4294967296)

const h3 = fnv1a('mosfet')
assert('大小写不同 → 哈希不同', h1 !== h3)

// ============================================================
// 5. minMaxNormalize
// ============================================================
console.log('\n▸ 5. minMaxNormalize')

const norm1 = minMaxNormalize([1, 2, 3, 4, 5])
assert('归一化到 [0, 1]', norm1[0] === 0 && norm1[4] === 1, `got [${norm1.join(', ')}]`)
assert('中间值 = 0.5', norm1[2] === 0.5, `got ${norm1[2]}`)

const norm2 = minMaxNormalize([3, 3, 3])
assert('全相同 → 全 0.5', norm2.every(v => v === 0.5), `got [${norm2.join(', ')}]`)

const norm3 = minMaxNormalize([])
assert('空数组 → 空数组', norm3.length === 0)

const norm4 = minMaxNormalize([5])
assert('单元素 → 0.5', norm4[0] === 0.5)

// ============================================================
// 6. 语义近邻验证（GraphRAG 核心能力）
// ============================================================
console.log('\n▸ 6. 语义近邻验证')

const queries = [
  { a: '阈值电压怎么推导', b: 'V_th 的计算公式', desc: '同义表述' },
  { a: 'PN 结是怎么形成的', b: 'PN 结形成原理', desc: '近义表述' },
  { a: '费米能级位置', b: '费米能级在哪', desc: '同义问法' },
  { a: 'MOSFET 阈值电压', b: '太阳能电池原理', desc: '无关内容' },
  { a: '漂移电流和扩散电流', b: 'CMOS 工艺流程', desc: '无关内容' }
]

for (const { a, b, desc } of queries) {
  const va = textToVector(a)
  const vb = textToVector(b)
  const sim = cosineSimilarity(va, vb)
  const isRelated = desc.includes('同义') || desc.includes('近义')
  const label = isRelated ? '应高' : '应低'
  const ok = isRelated ? sim > 0.3 : sim < 0.3
  assert(`"${a}" vs "${b}" (${desc}, sim=${sim.toFixed(3)}, ${label})`, ok)
}

// ============================================================
// 报告
// ============================================================
console.log('\n═══════════════════════════════════════════════════════════════')
console.log(`  总分：${passed} passed, ${failed} failed`)
console.log(`  ${failed === 0 ? '✅ 全部通过' : '❌ 存在失败项'}`)
console.log('═══════════════════════════════════════════════════════════════\n')

process.exit(failed === 0 ? 0 : 1)
