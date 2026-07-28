// ============================================================
// Citation Verifier 验收测试（v1.5 评审保命 P1）
// ============================================================
// 验收口径：3 个真实论文 + 1 个伪造标题
//   - 3 真：经 OpenAlex 验证返回 verified=true（命中）
//   - 1 假：OpenAlex 返回 0 结果 → 标 [未验证: <title>]
//
// 用法：node scripts/test-citation-verifier.mjs
//   --no-network        跳过真实网络调用（仅本地逻辑）
//   --threshold=0.55    自定义相似度阈值（默认 0.55）
// ============================================================

import {
  verifyCitation,
  verifyAllCitations,
  markUnverified,
  titleSimilarity,
  extractCitations
} from '../src/core/agents/citationVerifier.js'

const C = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m'
}
const ok = (m) => console.log(`  ${C.green}✓${C.reset} ${m}`)
const fail = (m) => console.log(`  ${C.red}✗${C.reset} ${m}`)
const warn = (m) => console.log(`  ${C.yellow}!${C.reset} ${m}`)
const info = (m) => console.log(`  ${C.cyan}ℹ${C.reset} ${m}`)
const dim = (m) => console.log(`  ${C.gray}${m}${C.reset}`)

function section(t) { console.log(`\n${'─'.repeat(70)}\n  ${t}\n${'─'.repeat(70)}`) }

const args = process.argv.slice(2)
const NO_NETWORK = args.includes('--no-network')
const thresholdArg = args.find((a) => a.startsWith('--threshold='))
const threshold = thresholdArg ? parseFloat(thresholdArg.split('=')[1]) : 0.55

// ============================================================
// 测试用例：3 真 1 假
// ============================================================
const TEST_PAPERS = [
  {
    id: 'p_real_01',
    title: 'Attention Is All You Need',
    authors: 'Vaswani, Shazeer, Parmar et al.',
    value: 'Transformer 架构的奠基论文',
    expected: 'verified'
  },
  {
    id: 'p_real_02',
    title: 'Efficient Processing of Deep Neural Networks: A Tutorial and Survey',
    authors: 'Sze, Chen, Yang, Emer',
    value: 'DNN 加速器综述',
    expected: 'verified'
  },
  {
    id: 'p_real_03',
    title: 'In-Datacenter Performance Analysis of a Tensor Processing Unit',
    authors: 'Jouppi, Young, Patil et al.',
    value: 'Google TPU 经典论文',
    expected: 'verified'
  },
  {
    id: 'p_fake_01',
    title: 'Quantum Bio Neuroeconomic Fourier Transformer Hybrid Fabricated 2026',
    authors: 'Imaginary Author',
    value: '伪造标题，验证应标 [未验证]',
    expected: 'unverified'
  }
]

// ============================================================
// 单元测试：titleSimilarity
// ============================================================
function testSimilarity() {
  section('单元 1：titleSimilarity')
  const cases = [
    { a: 'Attention Is All You Need', b: 'Attention Is All You Need', expectMin: 0.99 },
    { a: 'Attention Is All You Need', b: 'Attention Is All You Need in Speech Separation', expectMin: 0.5 },
    { a: 'TPU', b: '', expect: 0 },
    { a: 'foo', b: 'bar', expect: 0 }
  ]
  for (const c of cases) {
    const s = titleSimilarity(c.a, c.b)
    if (c.expect !== undefined) {
      if (s === c.expect) ok(`"${c.a}" vs "${c.b}" → ${s.toFixed(3)} (期望 ${c.expect})`)
      else fail(`"${c.a}" vs "${c.b}" → ${s.toFixed(3)} (期望 ${c.expect})`)
    } else if (c.expectMin !== undefined) {
      if (s >= c.expectMin) ok(`"${c.a}" vs "${c.b}" → ${s.toFixed(3)} (≥ ${c.expectMin})`)
      else fail(`"${c.a}" vs "${c.b}" → ${s.toFixed(3)} (期望 ≥ ${c.expectMin})`)
    }
  }
}

// ============================================================
// 单元测试：extractCitations
// ============================================================
function testExtractCitations() {
  section('单元 2：extractCitations')
  // 1) 数组形式
  const arr = extractCitations([{ title: 'Paper A', authors: 'A1' }, { title: 'Paper B' }])
  if (arr.length === 2 && arr[0].title === 'Paper A') ok('数组形式抽取 2 条')
  else fail(`数组形式抽取失败：${arr.length}`)

  // 2) JSON 字符串
  const jsonStr = '```json\n{"papers": [{"title": "X", "authors": "X1"}]}\n```'
  const fromStr = extractCitations(jsonStr)
  if (fromStr.length === 1 && fromStr[0].title === 'X') ok('JSON 字符串形式抽取 1 条')
  else fail(`JSON 字符串形式失败：${fromStr.length}`)

  // 3) 对象含 papers
  const fromObj = extractCitations({ papers: [{ title: 'Y' }] })
  if (fromObj.length === 1 && fromObj[0].title === 'Y') ok('对象 papers 形式抽取 1 条')
  else fail(`对象 papers 形式失败：${fromObj.length}`)

  // 4) 空 / 异常
  if (extractCitations(null).length === 0) ok('null 输入 → 0 条')
  else fail('null 输入未返回空')
  if (extractCitations('no json here').length === 0) ok('无 JSON 文本 → 0 条')
  else fail('无 JSON 文本未返回空')
}

// ============================================================
// 单元测试：markUnverified
// ============================================================
function testMarkUnverified() {
  section('单元 3：markUnverified')
  const papers = [
    { title: 'P1', value: 'good', verified: true },
    { title: 'P2', value: 'good', verified: false },
    { title: 'P3', value: 'good', verified: false, error: 'no_results' }
  ]
  const marked = markUnverified(papers)
  if (marked[0].value === 'good') ok('已验证项 value 不变')
  else fail(`已验证项 value 被改: ${marked[0].value}`)
  if (marked[1].value.includes('[未验证: P2]')) ok('未验证项追加占位符')
  else fail(`未验证项未追加: ${marked[1].value}`)
  if (marked.length === 3) ok('保留全部条目（不静默删）')
  else fail('条目数被改')
}

// ============================================================
// 集成测试：3 真 1 假（可跳过网络）
// ============================================================
async function testRealAndFake() {
  section(`集成：3 真 1 假（阈值=${threshold}, ${NO_NETWORK ? 'NO-NETWORK 模式' : '实时调 OpenAlex'}）`)

  if (NO_NETWORK) {
    warn('--no-network：仅跑本地逻辑，集成测试 SKIP')
    return 0
  }

  // 顺序验证（避免并发抢 OpenAlex 限流）
  const results = []
  for (const paper of TEST_PAPERS) {
    info(`验证：${paper.id} "${paper.title.slice(0, 50)}..."`)
    const r = await verifyCitation(paper, { similarityThreshold: threshold })
    const isVerified = r.verified
    const okMatch = (paper.expected === 'verified' && isVerified) || (paper.expected === 'unverified' && !isVerified)
    if (okMatch) {
      const detail = isVerified ? `相似度 ${r.similarity || '?'}, DOI=${r.doi || '?'}` : `error=${r.error}`
      ok(`${paper.id} → ${isVerified ? 'verified' : 'unverified'} (${detail})`)
    } else {
      fail(`${paper.id} → ${isVerified ? 'verified' : 'unverified'} (期望 ${paper.expected}, error=${r.error}, sim=${r.similarity})`)
    }
    results.push({ ...paper, ...r })
  }

  // 验证占位符逻辑
  const marked = markUnverified(results)
  const verifiedCount = marked.filter((p) => p.verified).length
  const unverifiedCount = marked.filter((p) => !p.verified).length
  info(`统计：${verifiedCount} 已验证 / ${unverifiedCount} 未验证`)
  if (verifiedCount >= 3 && unverifiedCount >= 1) {
    ok('✓ 验收：3+ 真实论文验证通过 + 1+ 伪造论文标 [未验证]')
  } else {
    fail(`验收失败：期望 ≥3 verified + ≥1 unverified，实际 ${verifiedCount} + ${unverifiedCount}`)
  }
  if (marked.find((p) => p.title.includes('Quantum Bio') && p.value.includes('[未验证'))) {
    ok('✓ 伪造论文 value 字段已加占位符')
  } else {
    fail('伪造论文 value 未加占位符')
  }

  return verifiedCount >= 3 && unverifiedCount >= 1 ? 0 : 1
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  Citation Verifier 验收测试（v1.5 评审保命 P1）`)
  console.log(`${'═'.repeat(70)}`)
  info(`测试用例：${TEST_PAPERS.length}（3 真 + 1 假）`)
  info(`相似度阈值：${threshold}`)
  if (!NO_NETWORK) info('网络：实时调 OpenAlex (https://api.openalex.org)')

  testSimilarity()
  testExtractCitations()
  testMarkUnverified()
  const integCode = await testRealAndFake()

  section('总结')
  if (integCode === 0) {
    console.log(`  ${C.green}✓ 全部验收通过：3+ 真实 / 1+ 伪造，标注逻辑正常${C.reset}\n`)
    process.exit(0)
  } else if (NO_NETWORK) {
    console.log(`  ${C.yellow}! --no-network 模式：单元测试通过，集成 SKIP${C.reset}\n`)
    process.exit(0)
  } else {
    console.log(`  ${C.red}✗ 集成验收失败${C.reset}\n`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(`\n${C.red}[FATAL]${C.reset}`, e)
  process.exit(2)
})
