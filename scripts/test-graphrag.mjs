// ============================================================
// GraphRAG 双路融合检索验证脚本（P0-1）
// ============================================================
// 验证 graphRag.js 的 graphRagRetrieve：
//   1. 三路并行召回（TF-IDF + 图谱向量 + 关键词图谱）
//   2. min-max 归一化
//   3. 加权融合
//   4. 去重
//   5. hit@5 ≥ 0.8（20 题验证集）
//   6. 无图谱时退化模式正常
//
// 运行：node scripts/test-graphrag.mjs
// ============================================================

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// 动态导入源码
const graphRagUrl = new URL('../src/utils/graphRag.js', import.meta.url)
const kgUrl = new URL('../src/utils/knowledgeGraph.js', import.meta.url)
const ragUrl = new URL('../src/utils/rag.js', import.meta.url)
const tokenizeUrl = new URL('../src/utils/tokenize.js', import.meta.url)

const { graphRagRetrieve } = await import(graphRagUrl.href)
const { loadGraph } = await import(kgUrl.href)
const { retrieve } = await import(ragUrl.href)
const { extractKeywords } = await import(tokenizeUrl.href)

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

// ============================================================
// 加载知识库 + 知识图谱
// ============================================================
function loadKnowledgeBase() {
  const paths = [
    'public/knowledge/textbook/半导体物理.json'
  ]
  let kb = []
  for (const p of paths) {
    try {
      const raw = readFileSync(join(root, p), 'utf-8')
      const items = JSON.parse(raw)
      kb = kb.concat(items)
      console.log(`  ✓ 加载 ${p} (${items.length} 条)`)
    } catch (e) {
      console.error(`  ✗ 加载失败 ${p}: ${e.message}`)
    }
  }
  return kb
}

function loadKnowledgeGraph() {
  try {
    const raw = readFileSync(join(root, 'public/knowledge/textbook/半导体物理-图谱.json'), 'utf-8')
    const data = JSON.parse(raw)
    return loadGraph('半导体物理', data)
  } catch (e) {
    console.error(`  ✗ 图谱加载失败: ${e.message}`)
    return null
  }
}

// ============================================================
// 20 题验证集（与 test-rag-hit5.mjs 相同）
// ============================================================
const TEST_SET = [
  { id: 1, question: '什么是半导体？它和导体、绝缘体有什么区别？', expectedIds: ['semi-phys-ch1-p1'] },
  { id: 2, question: '硅的禁带宽度是多少？砷化镓呢？', expectedIds: ['semi-phys-ch1-p2'] },
  { id: 3, question: '能带理论中价带、导带和禁带分别是什么？', expectedIds: ['semi-phys-ch1-p2'] },
  { id: 4, question: '本征载流子浓度怎么计算？公式是什么？', expectedIds: ['semi-phys-ch2-p1'] },
  { id: 5, question: 'n 型半导体和 p 型半导体的区别是什么？', expectedIds: ['semi-phys-ch2-p2'] },
  { id: 6, question: '费米能级在 n 型和 p 型半导体中位置有什么不同？', expectedIds: ['semi-phys-ch2-p3'] },
  { id: 7, question: '泊松方程是什么？在半导体分析中有什么作用？', expectedIds: ['semi-phys-ch3-p1'] },
  { id: 8, question: '漂移电流和扩散电流的区别？爱因斯坦关系是什么？', expectedIds: ['semi-phys-ch3-p2'] },
  { id: 9, question: '连续性方程描述了什么？少子寿命是什么意思？', expectedIds: ['semi-phys-ch3-p3'] },
  { id: 10, question: 'PN 结是怎么形成的？内建电场是怎么产生的？', expectedIds: ['semi-phys-ch4-p1'] },
  { id: 11, question: 'PN 结的内建电势公式是什么？正向偏压和反向偏压对势垒有什么影响？', expectedIds: ['semi-phys-ch4-p2'] },
  { id: 12, question: 'PN 结的整流特性是什么？肖克利方程怎么写？', expectedIds: ['semi-phys-ch4-p3'] },
  { id: 13, question: 'MOSFET 是什么？阈值电压怎么定义？', expectedIds: ['semi-phys-ch5-p1'] },
  { id: 14, question: 'MOSFET 阈值电压怎么推导？强反型判据是什么？', expectedIds: ['semi-phys-ch5-p2', 'semi-phys-ch5-p1'] },
  { id: 15, question: 'MOS 结构的积累、耗尽、反型三种状态是什么？', expectedIds: ['semi-phys-ch5-p3'] },
  { id: 16, question: 'MOS 结构的 C-V 特性曲线低频和高频有什么区别？', expectedIds: ['semi-phys-ch5-p4'] },
  { id: 17, question: '短沟道效应是什么？DIBL 和 V_th roll-off 是什么意思？', expectedIds: ['semi-phys-ch5-p5'] },
  { id: 18, question: '双极型晶体管 BJT 和 MOSFET 有什么区别？电流放大系数 β 怎么算？', expectedIds: ['semi-phys-ch6-p1'] },
  { id: 19, question: '太阳能电池的工作原理是什么？光吸收的条件是什么？', expectedIds: ['semi-phys-ch8-p1'] },
  { id: 20, question: 'CMOS 工艺是什么？摩尔定律描述了什么趋势？', expectedIds: ['semi-phys-ch9-p1'] }
]

// ============================================================
// 主流程
// ============================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('  GraphRAG 双路融合检索验证 · test-graphrag.mjs')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log('▸ 加载知识库...')
const kb = loadKnowledgeBase()
console.log(`  知识库 ${kb.length} 条切片`)

console.log('\n▸ 加载知识图谱...')
const graph = loadKnowledgeGraph()
console.log(`  图谱 ${graph?.nodes?.size || 0} 节点, ${graph?.edges?.length || 0} 边`)

if (!graph) {
  console.error('❌ 知识图谱加载失败，无法测试融合模式')
  process.exit(1)
}

// ============================================================
// 测试 1: 融合检索基本功能
// ============================================================
console.log('\n▸ 1. 融合检索基本功能')

const result1 = graphRagRetrieve('MOSFET 阈值电压怎么推导', kb, graph, { topK: 5 })
assert('返回 slices 数组', Array.isArray(result1.slices))
assert('slices 长度 > 0', result1.slices.length > 0, `got ${result1.slices.length}`)
assert('slices 长度 ≤ topK', result1.slices.length <= 5)
assert('返回 ragContext 字符串', typeof result1.ragContext === 'string' && result1.ragContext.length > 0)
assert('返回 trace 对象', typeof result1.trace === 'object')
assert('trace.degraded = false', result1.trace.degraded === false)
assert('trace 包含 weights', typeof result1.trace.weights === 'object')

// 每个切片应有融合分数和来源标记
const sample = result1.slices[0]
assert('切片有 score 属性', typeof sample.score === 'number')
assert('切片有 _fused_scores', typeof sample._fused_scores === 'object')
assert('切片有 _retrieval_sources', Array.isArray(sample._retrieval_sources))
assert('切片 _retrieval_sources 非空', sample._retrieval_sources.length > 0)

// ============================================================
// 测试 2: 三路召回都有结果
// ============================================================
console.log('\n▸ 2. 三路召回结果')

assert('TF-IDF 路有结果', result1.trace.tfidf.length > 0, `got ${result1.trace.tfidf.length}`)
assert('图谱向量路有结果', result1.trace.graphVec.length > 0, `got ${result1.trace.graphVec.length}`)

// 测试多个问题确认三路都有输出
let allTfidfHit = true
let allGraphVecHit = true
for (const tc of TEST_SET.slice(0, 5)) {
  const r = graphRagRetrieve(tc.question, kb, graph, { topK: 5 })
  if (r.trace.tfidf.length === 0) allTfidfHit = false
  if (r.trace.graphVec.length === 0) allGraphVecHit = false
}
assert('前5题 TF-IDF 路均有结果', allTfidfHit)
assert('前5题图谱向量路均有结果', allGraphVecHit)

// ============================================================
// 测试 3: 去重验证
// ============================================================
console.log('\n▸ 3. 去重验证')

const dedupResult = graphRagRetrieve('MOSFET 阈值电压', kb, graph, { topK: 5 })
const ids = dedupResult.slices.map(s => s.id)
const uniqueIds = new Set(ids)
assert('Top-K 结果无重复 ID', ids.length === uniqueIds.size, `got ${ids.length} items, ${uniqueIds.size} unique`)

// ============================================================
// 测试 4: min-max 归一化验证
// ============================================================
console.log('\n▸ 4. min-max 归一化验证')

// TF-IDF 归一化分数应在 [0, 1]
const tfidfNormScores = result1.trace.tfidf.map(t => t.normalizedScore)
if (tfidfNormScores.length > 0) {
  const allInRange = tfidfNormScores.every(s => s >= 0 && s <= 1)
  assert('TF-IDF 归一化分数在 [0, 1]', allInRange, `got [${tfidfNormScores.join(', ')}]`)

  // 最高分应为 1.0（min-max 特性）
  const maxNorm = Math.max(...tfidfNormScores)
  assert('TF-IDF 归一化最高分 = 1.0', Math.abs(maxNorm - 1.0) < 0.01, `got ${maxNorm}`)
} else {
  assert('TF-IDF 归一化分数在 [0, 1]', false, 'no scores')
}

// 图谱向量归一化分数应在 [0, 1]
const graphNormScores = result1.trace.graphVec.map(t => t.normalizedScore)
if (graphNormScores.length > 0) {
  const allInRange = graphNormScores.every(s => s >= 0 && s <= 1)
  assert('图谱向量归一化分数在 [0, 1]', allInRange)
}

// ============================================================
// 测试 5: 退化模式（无图谱）
// ============================================================
console.log('\n▸ 5. 退化模式（无图谱）')

const degradedResult = graphRagRetrieve('MOSFET 阈值电压', kb, null, { topK: 5 })
assert('degraded = true', degradedResult.trace.degraded === true)
assert('slices 非空', degradedResult.slices.length > 0)
assert('knowledgePath = null', degradedResult.knowledgePath === null)
assert('trace.graphVec 为空', degradedResult.trace.graphVec.length === 0)
assert('trace.keyword 为空', degradedResult.trace.keyword.length === 0)

// 退化结果应与纯 TF-IDF 一致
const pureTfidf = retrieve('MOSFET 阈值电压', kb, 5)
const degradedIds = degradedResult.slices.map(s => s.id)
const pureIds = pureTfidf.map(s => s.id)
assert('退化结果与纯 TF-IDF 一致', JSON.stringify(degradedIds) === JSON.stringify(pureIds))

// ============================================================
// 测试 6: hit@5 验证（20 题）
// ============================================================
console.log('\n▸ 6. hit@5 验证（20 题）')

let hitCount = 0
for (const tc of TEST_SET) {
  const r = graphRagRetrieve(tc.question, kb, graph, { topK: 5 })
  const topIds = r.slices.map(s => s.id)
  const hit = topIds.some(id => tc.expectedIds.includes(id))
  if (hit) hitCount++

  const status = hit ? '✓ HIT ' : '✗ MISS'
  console.log(`  #${String(tc.id).padStart(2, '0')} [${status}] ${tc.question.slice(0, 36)}${tc.question.length > 36 ? '...' : ''}`)
  if (!hit) {
    console.log(`       期望: ${tc.expectedIds.join(', ')}`)
    console.log(`       Top5: ${topIds.join(', ') || '(空)'}`)
    // 诊断各路结果
    console.log(`       TF-IDF: ${r.trace.tfidf.slice(0, 3).map(t => t.id).join(', ')}`)
    console.log(`       图谱向量: ${r.trace.graphVec.slice(0, 3).map(t => `${t.sourceId || t.nodeId}`).join(', ')}`)
  }
}

const hitRate = hitCount / TEST_SET.length
const hitPass = hitRate >= 0.8
console.log(`\n  hit@5: ${hitCount}/${TEST_SET.length} = ${(hitRate * 100).toFixed(1)}% ${hitPass ? '✅' : '❌'}`)
assert('hit@5 ≥ 80%', hitPass, `got ${(hitRate * 100).toFixed(1)}%`)

// ============================================================
// 测试 7: 知识图谱路径
// ============================================================
console.log('\n▸ 7. 知识图谱路径')

const pathResult = graphRagRetrieve('MOSFET 阈值电压怎么推导', kb, graph, {
  topK: 5,
  profile: { ability_stars: { '阈值电压': 2 }, weak_topics: ['MOS结构'] }
})
assert('knowledgePath 非空', pathResult.knowledgePath !== null)
assert('knowledgePath.target 存在', typeof pathResult.knowledgePath?.target === 'object')
assert('knowledgePath.path 是数组', Array.isArray(pathResult.knowledgePath?.path))
assert('knowledgePath.retrievalHits 是数组', Array.isArray(pathResult.knowledgePath?.retrievalHits))
assert('retrievalHits 非空', (pathResult.knowledgePath?.retrievalHits?.length || 0) > 0)

// retrievalHits 应包含来源信息
const hit0 = pathResult.knowledgePath.retrievalHits[0]
assert('retrievalHit 有 nodeId', typeof hit0.nodeId === 'string')
assert('retrievalHit 有 fusedScore', typeof hit0.fusedScore === 'number')
assert('retrievalHit 有 sources 数组', Array.isArray(hit0.sources))
assert('retrievalHit 有 scores 对象', typeof hit0.scores === 'object')

// ============================================================
// 报告
// ============================================================
console.log('\n═══════════════════════════════════════════════════════════════')
console.log(`  总分：${passed} passed, ${failed} failed`)
console.log(`  ${failed === 0 ? '✅ 全部通过' : '❌ 存在失败项'}`)
console.log('═══════════════════════════════════════════════════════════════\n')

process.exit(failed === 0 ? 0 : 1)
