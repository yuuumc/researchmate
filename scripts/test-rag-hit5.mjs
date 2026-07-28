// ============================================================
// RAG hit@5 验证脚本（v3 §Week 1 P0 任务）
// ============================================================
// 验证标准：20 题真实考研问题，hit@5 ≥ 0.8（≥ 16/20 命中）
// 不达标 → 降级为按章节手动挂标签（详见 v1 §3.3）
//
// 运行：node scripts/test-rag-hit5.mjs
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
// 20 题验证集（覆盖 9 章，含定义/推导/比较/应用 4 类问题）
// ============================================================
// 每题标注 expectedIds：至少 1 个应该被命中的切片 id
// hit@5 = Top-5 结果中是否包含任一 expectedId
const TEST_SET = [
  // === 第 1 章：半导体基础 / 能带 ===
  {
    id: 1,
    question: '什么是半导体？它和导体、绝缘体有什么区别？',
    type: '定义',
    expectedIds: ['semi-phys-ch1-p1']
  },
  {
    id: 2,
    question: '硅的禁带宽度是多少？砷化镓呢？',
    type: '定义',
    expectedIds: ['semi-phys-ch1-p2']
  },
  {
    id: 3,
    question: '能带理论中价带、导带和禁带分别是什么？',
    type: '定义',
    expectedIds: ['semi-phys-ch1-p2']
  },
  // === 第 2 章：载流子统计 / 费米能级 ===
  {
    id: 4,
    question: '本征载流子浓度怎么计算？公式是什么？',
    type: '推导',
    expectedIds: ['semi-phys-ch2-p1']
  },
  {
    id: 5,
    question: 'n 型半导体和 p 型半导体的区别是什么？',
    type: '比较',
    expectedIds: ['semi-phys-ch2-p2']
  },
  {
    id: 6,
    question: '费米能级在 n 型和 p 型半导体中位置有什么不同？',
    type: '比较',
    expectedIds: ['semi-phys-ch2-p3']
  },
  // === 第 3 章：泊松方程 / 输运 ===
  {
    id: 7,
    question: '泊松方程是什么？在半导体分析中有什么作用？',
    type: '定义',
    expectedIds: ['semi-phys-ch3-p1']
  },
  {
    id: 8,
    question: '漂移电流和扩散电流的区别？爱因斯坦关系是什么？',
    type: '比较',
    expectedIds: ['semi-phys-ch3-p2']
  },
  {
    id: 9,
    question: '连续性方程描述了什么？少子寿命是什么意思？',
    type: '定义',
    expectedIds: ['semi-phys-ch3-p3']
  },
  // === 第 4 章：PN 结 ===
  {
    id: 10,
    question: 'PN 结是怎么形成的？内建电场是怎么产生的？',
    type: '推导',
    expectedIds: ['semi-phys-ch4-p1']
  },
  {
    id: 11,
    question: 'PN 结的内建电势公式是什么？正向偏压和反向偏压对势垒有什么影响？',
    type: '推导',
    expectedIds: ['semi-phys-ch4-p2']
  },
  {
    id: 12,
    question: 'PN 结的整流特性是什么？肖克利方程怎么写？',
    type: '推导',
    expectedIds: ['semi-phys-ch4-p3']
  },
  // === 第 5 章：MOSFET（重点章节，多题） ===
  {
    id: 13,
    question: 'MOSFET 是什么？阈值电压怎么定义？',
    type: '定义',
    expectedIds: ['semi-phys-ch5-p1']
  },
  {
    id: 14,
    question: 'MOSFET 阈值电压怎么推导？强反型判据是什么？',
    type: '推导',
    expectedIds: ['semi-phys-ch5-p2', 'semi-phys-ch5-p1']
  },
  {
    id: 15,
    question: 'MOS 结构的积累、耗尽、反型三种状态是什么？',
    type: '定义',
    expectedIds: ['semi-phys-ch5-p3']
  },
  {
    id: 16,
    question: 'MOS 结构的 C-V 特性曲线低频和高频有什么区别？',
    type: '比较',
    expectedIds: ['semi-phys-ch5-p4']
  },
  {
    id: 17,
    question: '短沟道效应是什么？DIBL 和 V_th roll-off 是什么意思？',
    type: '定义',
    expectedIds: ['semi-phys-ch5-p5']
  },
  // === 第 6-9 章：BJT / 异质结 / 光电 / 制造 ===
  {
    id: 18,
    question: '双极型晶体管 BJT 和 MOSFET 有什么区别？电流放大系数 β 怎么算？',
    type: '比较',
    expectedIds: ['semi-phys-ch6-p1']
  },
  {
    id: 19,
    question: '太阳能电池的工作原理是什么？光吸收的条件是什么？',
    type: '应用',
    expectedIds: ['semi-phys-ch8-p1']
  },
  {
    id: 20,
    question: 'CMOS 工艺是什么？摩尔定律描述了什么趋势？',
    type: '应用',
    expectedIds: ['semi-phys-ch9-p1']
  }
]

// ============================================================
// 加载知识库
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

// ============================================================
// 运行验证
// ============================================================
function runValidation(kb) {
  const results = []
  let hitCount = 0

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  RAG hit@5 验证 · 20 题 × 知识库 ' + kb.length + ' 条切片')
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
      `  #${String(tc.id).padStart(2, '0')} [${status}] [${tc.type}] ${tc.question.slice(0, 36)}${tc.question.length > 36 ? '...' : ''}`
    )
    console.log(`       期望: ${tc.expectedIds.join(', ')}`)
    console.log(`       Top5: ${topIds.length > 0 ? topIds.join(', ') : '(空)'}`)
    if (matched.length > 0) {
      console.log(`       命中: ${matched.join(', ')}`)
    }
    console.log()
  }

  return { results, hitCount, total: TEST_SET.length }
}

// ============================================================
// 输出报告
// ============================================================
function printReport({ results, hitCount, total }) {
  const hitRate = hitCount / total
  const pass = hitRate >= 0.8

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  验证报告')
  console.log('═══════════════════════════════════════════════════════════════\n')

  // 按题型分组统计
  const byType = {}
  for (const r of results) {
    if (!byType[r.type]) byType[r.type] = { hit: 0, total: 0 }
    byType[r.type].total++
    if (r.hit) byType[r.type].hit++
  }

  console.log('  按题型统计：')
  for (const [type, stat] of Object.entries(byType)) {
    const rate = (stat.hit / stat.total * 100).toFixed(0)
    const bar = '█'.repeat(stat.hit) + '░'.repeat(stat.total - stat.hit)
    console.log(`    ${type.padEnd(4)} ${bar} ${stat.hit}/${stat.total} (${rate}%)`)
  }
  console.log()

  // 错题清单
  const misses = results.filter((r) => !r.hit)
  if (misses.length > 0) {
    console.log('  ❌ 未命中题目：')
    for (const m of misses) {
      console.log(`    #${m.id} [${m.type}] ${m.question}`)
      console.log(`       期望: ${m.expectedIds.join(', ')}`)
      console.log(`       Top5: ${m.topIds.length > 0 ? m.topIds.join(', ') : '(空)'}`)
      // 诊断：分词结果
      const kws = extractKeywords(m.question)
      console.log(`       分词: ${kws.join(', ')}`)
    }
    console.log()
  }

  // 总分
  const passMark = pass ? '✅ 通过' : '❌ 不达标'
  console.log('  ────────────────────────────────────────────')
  console.log(`  总分：${hitCount} / ${total} = ${(hitRate * 100).toFixed(1)}%  ${passMark}`)
  console.log(`  门槛：≥ 80.0%`)
  console.log('  ────────────────────────────────────────────\n')

  if (!pass) {
    console.log('  ⚠️  未达 0.8 门槛，按 v1 §3.3 降级方案：')
    console.log('     1. 检查 tokenize() 分词是否合理（中英文混排）')
    console.log('     2. 检查 STOP_WORDS / KEEP_SINGLE_CHARS 白名单')
    console.log('     3. 考虑降级为按章节手动挂标签（每题预先关联切片 id）')
    console.log()
  }

  return pass
}

// ============================================================
// 主流程
// ============================================================
console.log('▸ RAG hit@5 验证脚本启动')
console.log('▸ 加载知识库...')
const kb = loadKnowledgeBase()
console.log(`▸ 知识库总计 ${kb.length} 条切片`)

// 先验证 tokenize 可用性
console.log('\n▸ tokenize 可用性检查：')
const sampleQ = 'MOSFET 阈值电压怎么推导？'
const tokens = tokenize(sampleQ)
const keywords = extractKeywords(sampleQ)
console.log(`  原句: ${sampleQ}`)
console.log(`  分词: ${tokens.join(' / ')}`)
console.log(`  关键词: ${keywords.join(' / ')}`)
console.log()

const report = runValidation(kb)
const pass = printReport(report)

process.exit(pass ? 0 : 1)
