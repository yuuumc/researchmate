// ============================================================
// RAG hit@5 验证脚本 - CS 数据结构版（v3.1 学科解耦）
// ============================================================
// 验证标准：20 题真实 CS 考研问题，hit@5 ≥ 0.8（≥ 16/20 命中）
// 验证"换一个 RAG 知识库 = 换一个专业"的学科解耦能力
//
// 运行：node scripts/test-rag-hit5-cs.mjs
// ============================================================

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// 动态导入源码（确保验证的是真实代码而非副本）
const ragUrl = new URL('../src/utils/rag.js', import.meta.url)
const tokenizeUrl = new URL('../src/utils/tokenize.js', import.meta.url)
const { retrieve } = await import(ragUrl.href)
const { tokenize, extractKeywords } = await import(tokenizeUrl.href)

// ============================================================
// 20 题 CS 验证集（覆盖数据结构 9 章，含定义/推导/比较/应用 4 类问题）
// ============================================================
const TEST_SET = [
  // === 第 1 章：绪论 ===
  { id: 1, question: '什么是数据结构？逻辑结构和物理结构有什么区别？', type: '定义', expectedIds: ['ds-ch1-p1'] },
  { id: 2, question: '常见的时间复杂度有哪些？大 O 表示法怎么排序？', type: '定义', expectedIds: ['ds-ch1-p1'] },
  // === 第 2 章：线性表 ===
  { id: 3, question: '顺序表和链表有什么区别？各有什么优劣？', type: '比较', expectedIds: ['ds-ch2-p1'] },
  { id: 4, question: '单链表怎么插入和删除结点？头插法和尾插法有什么区别？', type: '推导', expectedIds: ['ds-ch2-p2', 'ds-ch2-p1'] },
  { id: 5, question: '双向链表的插入操作怎么写？', type: '推导', expectedIds: ['ds-ch2-p2'] },
  // === 第 3 章：栈和队列 ===
  { id: 6, question: '栈是什么？后进先出 LIFO 怎么理解？', type: '定义', expectedIds: ['ds-ch3-p1'] },
  { id: 7, question: '栈有哪些应用？函数调用和表达式求值怎么用栈？', type: '应用', expectedIds: ['ds-ch3-p1'] },
  { id: 8, question: '循环队列怎么解决假溢出？队空和队满条件是什么？', type: '推导', expectedIds: ['ds-ch3-p2'] },
  // === 第 4 章：串 ===
  { id: 9, question: 'KMP 算法的 next 数组是什么含义？时间复杂度是多少？', type: '推导', expectedIds: ['ds-ch4-p1'] },
  { id: 10, question: '串的模式匹配有哪些算法？朴素匹配和 KMP 有什么区别？', type: '比较', expectedIds: ['ds-ch4-p1'] },
  // === 第 5 章：树（重点章节） ===
  { id: 11, question: '满二叉树和完全二叉树有什么区别？二叉树有什么性质？', type: '比较', expectedIds: ['ds-ch5-p1'] },
  { id: 12, question: '二叉树的前序、中序、后序遍历是什么？', type: '定义', expectedIds: ['ds-ch5-p2'] },
  { id: 13, question: '已知前序和中序遍历怎么唯一确定二叉树？', type: '推导', expectedIds: ['ds-ch5-p2'] },
  { id: 14, question: '二叉排序树 BST 是什么？平衡二叉树 AVL 怎么保持平衡？', type: '定义', expectedIds: ['ds-ch5-p3'] },
  { id: 15, question: '哈夫曼树怎么构造？哈夫曼编码是什么？', type: '推导', expectedIds: ['ds-ch5-p4'] },
  // === 第 6 章：图 ===
  { id: 16, question: '邻接矩阵和邻接表有什么区别？分别适合什么图？', type: '比较', expectedIds: ['ds-ch6-p1'] },
  { id: 17, question: 'DFS 深度优先搜索和 BFS 广度优先搜索有什么区别？', type: '比较', expectedIds: ['ds-ch6-p2'] },
  { id: 18, question: 'Dijkstra 算法和 Floyd 算法求最短路径有什么区别？', type: '比较', expectedIds: ['ds-ch6-p3'] },
  { id: 19, question: '最小生成树怎么求？Prim 算法和 Kruskkal 算法有什么区别？', type: '推导', expectedIds: ['ds-ch6-p4'] },
  // === 第 7-8 章：查找与排序 ===
  { id: 20, question: '快速排序怎么实现？时间复杂度是多少？最坏情况是什么？', type: '推导', expectedIds: ['ds-ch8-p2', 'ds-ch8-p1'] }
]

// ============================================================
// 加载 CS 知识库
// ============================================================
function loadKnowledgeBase() {
  const paths = [
    'public/knowledge/textbook/数据结构.json'
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

// ============================================================
// 运行验证
// ============================================================
function runValidation(kb) {
  const results = []
  let hitCount = 0

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  RAG hit@5 验证 · CS 数据结构版 · 20 题 × 知识库 ' + kb.length + ' 条切片')
  console.log('  v3.1 学科解耦验证：换知识库 = 换专业')
  console.log('═══════════════════════════════════════════════════════════════\n')

  for (const tc of TEST_SET) {
    const topK = retrieve(tc.question, kb, 5)
    const topIds = topK.map((s) => s.id)
    const hit = topIds.some((id) => tc.expectedIds.includes(id))
    if (hit) hitCount++

    results.push({ ...tc, topIds, hit, topK })

    const status = hit ? '✓ HIT ' : '✗ MISS'
    const matched = topIds.filter((id) => tc.expectedIds.includes(id))
    console.log(
      `  #${String(tc.id).padStart(2, '0')} [${status}] [${tc.type}] ${tc.question.slice(0, 40)}`
    )
    console.log(`       期望: ${tc.expectedIds.join(', ')}`)
    console.log(`       Top5: ${topIds.join(', ') || '(空)'}`)
    if (matched.length) {
      console.log(`       命中: ${matched.join(', ')}`)
    }
    if (!hit && topK.length > 0) {
      console.log(`       最高分: ${topK[0].score} (tfidf=${topK[0]._tfidf_score}, substr=${topK[0]._substr_score})`)
    }
    console.log('')
  }

  // 按题型统计
  const typeStats = {}
  for (const r of results) {
    if (!typeStats[r.type]) typeStats[r.type] = { hit: 0, total: 0 }
    typeStats[r.type].total++
    if (r.hit) typeStats[r.type].hit++
  }

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  验证报告（v3.1 学科解耦 CS 版）')
  console.log('═══════════════════════════════════════════════════════════════\n')

  console.log('  按题型统计：')
  for (const [type, s] of Object.entries(typeStats)) {
    const rate = ((s.hit / s.total) * 100).toFixed(1)
    const bar = '█'.repeat(s.hit) + '░'.repeat(s.total - s.hit)
    console.log(`    ${type.padEnd(4)} ${bar} ${s.hit}/${s.total} (${rate}%)`)
  }

  const hitRate = (hitCount / TEST_SET.length) * 100
  const pass = hitRate >= 80
  console.log(`\n  ────────────────────────────────────────────`)
  console.log(`  总分：${hitCount} / ${TEST_SET.length} = ${hitRate.toFixed(1)}%  ${pass ? '✅ 通过' : '❌ 未通过'}`)
  console.log(`  门槛：≥ 80.0% (v3.1 学科解耦验收标准)`)
  console.log(`  ────────────────────────────────────────────\n`)

  if (!pass) {
    console.log('  错题诊断：')
    results.filter(r => !r.hit).forEach(r => {
      console.log(`    #${r.id} [${r.type}] ${r.question}`)
      console.log(`      期望: ${r.expectedIds.join(', ')}`)
      console.log(`      Top5: ${r.topIds.join(', ') || '(空)'}`)
    })
  }

  return pass
}

// ============================================================
// 主流程
// ============================================================

console.log('\n▸ RAG hit@5 验证脚本启动（CS 数据结构版 · v3.1 学科解耦）')
console.log('▸ 加载 CS 知识库...')
const kb = loadKnowledgeBase()
console.log(`▸ 知识库总计 ${kb.length} 条切片`)

console.log('\n▸ tokenize 可用性检查：')
const sampleText = 'KMP 算法的 next 数组是什么含义？'
const tokens = tokenize(sampleText)
const keywords = extractKeywords(sampleText)
console.log(`  原句: ${sampleText}`)
console.log(`  分词: ${tokens.join(' / ')}`)
console.log(`  关键词: ${keywords.join(' / ')}`)

const pass = runValidation(kb)
process.exit(pass ? 0 : 1)
