// ============================================================
// 11 大翻车点团队演练脚本（v3.3 §团队演练 1 次）
// ============================================================
// 用法：
//   node scripts/test-rollback-rehearsal.mjs               # 输出 checklist + 话术
//   node scripts/test-rollback-rehearsal.mjs --check       # 自动化检查可验证项
//
// 11 大翻车点（按概率排序）：
//   1. 本地服务无法访问（自建全栈特有）
//   2. DeepSeek API 超时（自建全栈特有）
//   3. Vite 构建失败（自建全栈特有）
//   4. 浏览器兼容问题（自建全栈特有）
//   5. 网络问题导致 DeepSeek 无法访问
//   6. 知识库检索无结果（RAG 返回空）
//   7. 演示时间超时（5 分钟硬限制）
//   8. localStorage 存储满
//   9. 跨 Agent 状态丢失
//   10. 评审追问技术细节
//   11. DeepSeek API Key 暴露（v3 P0）
// ============================================================

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(__dirname, '..')

const args = process.argv.slice(2)
const CHECK_MODE = args.includes('--check')

// ============================================================
// 输出工具
// ============================================================
function banner(t) {
  console.log(`\n${'═'.repeat(70)}\n  ${t}\n${'═'.repeat(70)}`)
}
function section(t) { console.log(`\n${'─'.repeat(70)}\n  ${t}\n${'─'.repeat(70)}`) }
function ok(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`) }
function fail(msg) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`) }
function info(msg) { console.log(`  \x1b[36mℹ\x1b[0m ${msg}`) }
function warn(msg) { console.log(`  \x1b[33m!\x1b[0m ${msg}`) }
function speaker(msg) { console.log(`  \x1b[35m🎤 话术\x1b[0m ${msg}`) }

// ============================================================
// 11 大翻车点数据
// ============================================================
const RISKS = [
  {
    id: 1,
    title: '本地服务无法访问',
    category: '自建全栈特有',
    probability: '高',
    scenario: '评审现场可能没有 Node.js 环境',
    talk: '我们准备了线上部署版本，直接访问 https://researchmate.researchkit.online，不需要本地环境。',
    backup: ['Vercel 主链接', 'Netlify 备用链接', '本地录屏视频'],
    prevention: ['评审前 1 天在 Vercel 部署并测试访问', '准备 2 个备用链接'],
    autoCheck: 'vercel-url'
  },
  {
    id: 2,
    title: 'DeepSeek API 超时',
    category: '自建全栈特有',
    probability: '高',
    scenario: 'DeepSeek API 受网络影响大',
    talk: 'DeepSeek API 偶有延迟，我们设置了 30 秒超时 + 重试机制，请稍等。',
    backup: ['离线录屏', '本地 mock 数据', '架构图 PPT'],
    prevention: ['评审前 1 天测试 DeepSeek API 响应时间', '准备 OpenAI API Key 备用'],
    autoCheck: 'deepseek-timeout'
  },
  {
    id: 3,
    title: 'Vite 构建失败',
    category: '自建全栈特有',
    probability: '中',
    scenario: '依赖更新可能引发构建错误',
    talk: '我们已锁定 package.json 版本，构建前会跑 npm ci 确保 reproducible build。',
    backup: ['本地 dist/ 已构建', 'Vercel 自动部署回滚'],
    prevention: ['评审前 1 天跑 npm run build', '锁定 package.json 版本'],
    autoCheck: 'build-pass'
  },
  {
    id: 4,
    title: '浏览器兼容问题',
    category: '自建全栈特有',
    probability: '中',
    scenario: 'Element Plus 在某些浏览器表现不一致',
    talk: '这个浏览器有点兼容问题，我们用 Chrome 演示。',
    backup: ['Chrome / Edge / Firefox 3 个浏览器'],
    prevention: ['评审前在 3 个浏览器测试', '准备 browserslist 配置'],
    autoCheck: null
  },
  {
    id: 5,
    title: '网络问题导致 DeepSeek 无法访问',
    category: '通用',
    probability: '高',
    scenario: '评审现场网络不可控',
    talk: '评审现场网络不可控，但我们的 API Key 不在前端 bundle 中——DeepSeek 调用走我们自己的 Vercel serverless 函数 /api/chat，相当于一次 HTTP 中转；即便如此我们准备了离线录屏 + 本地 mock 数据 + 架构图 PPT 三道备份。',
    backup: ['离线录屏', '本地 mock 数据', '架构图 PPT'],
    prevention: ['评审前 1 天测试现场网络', '准备手机热点'],
    autoCheck: null
  },
  {
    id: 6,
    title: '知识库检索无结果（RAG 返回空）',
    category: '通用',
    probability: '中',
    scenario: '评审提问可能超出预设场景',
    talk: '这个问题超出了当前知识库范围，系统会明确告知"无数据"而不是编造。',
    backup: ['准备 10 个"超纲问题"的标准回答', '演示时主动展示 1 个"无数据"场景'],
    prevention: ['提前准备超纲问题应对话术'],
    autoCheck: 'rag-empty'
  },
  {
    id: 7,
    title: '演示时间超时（5 分钟硬限制）',
    category: '通用',
    probability: '中',
    scenario: '5 分钟讲不完所有功能',
    talk: '时间关系，我直接展示最关键的 2 个场景。',
    backup: ['3 分钟精简版脚本', '1 分钟精华版视频'],
    prevention: ['提前演练计时', '准备精简版脚本'],
    autoCheck: 'demo-script'
  },
  {
    id: 8,
    title: 'localStorage 存储满',
    category: '通用',
    probability: '低',
    scenario: '5MB 容量长期使用可能满',
    talk: '存储空间不足，我们清理一下。',
    backup: ['准备"清理存储"按钮', '演示前清理浏览器数据'],
    prevention: ['演示前清理浏览器数据'],
    autoCheck: null
  },
  {
    id: 9,
    title: '跨 Agent 状态丢失',
    category: '通用',
    probability: '低',
    scenario: '级联时 weak_topics 未传到 planner',
    talk: '状态传递有保护机制，让我重新演示一次。',
    backup: ['准备级联的标准用例', '准备手动触发 N6 的降级方案'],
    prevention: ['v3.4 已修复 cascade.js 状态传递'],
    autoCheck: 'cascade-status'
  },
  {
    id: 10,
    title: '评审追问技术细节',
    category: '通用',
    probability: '高',
    scenario: '如"TF-IDF 怎么实现？"',
    talk: 'TF-IDF 在 src/utils/rag.js，核心是词频 × 逆文档频率，约 50 行代码，我可以给您看。',
    backup: ['准备技术架构图', '准备关键代码截图', '准备技术文档'],
    prevention: ['提前准备技术 Q&A 文档'],
    autoCheck: 'tech-docs'
  },
  {
    id: 11,
    title: 'DeepSeek API Key 暴露',
    category: '自建全栈特有 P0',
    probability: '中',
    scenario: '评审一旦打开 DevTools Network 必现',
    talk: '我们的架构里 DeepSeek API Key 走服务端——Vercel serverless function /api/chat 从 process.env 读取 key，前端 bundle 中没有任何敏感信息。DevTools Network 只会看到我们自己的 /api/chat 域名，看不到 api.deepseek.com，也看不到 key 头。这是自建全栈的标配，不是可选加固。',
    backup: ['DevTools Network 自检脚本 scripts/test-key-leak.mjs', '展示 api/chat.js + Vercel 环境变量截图'],
    prevention: ['Week 2 8/4 必须按 v3.4 计划用 serverless 代理', 'CI 加 grep 检查：! grep -r VITE_DEEPSEEK src/'],
    autoCheck: 'key-leak'
  }
]

// ============================================================
// 自动化检查项
// ============================================================
function checkVercelUrl() {
  // 检查 README / 文档中是否有 vercel 链接
  const readme = join(root, 'README.md')
  if (existsSync(readme)) {
    const c = readFileSync(readme, 'utf-8')
    if (/yanxintong\.vercel\.app|vercel\.app/.test(c)) {
      ok('README.md 中含 Vercel 部署链接')
      return true
    }
  }
  warn('README.md 中未发现 Vercel 部署链接（建议添加）')
  return false
}

function checkBuildPass() {
  try {
    info('运行 npm run build（约 30-60 秒）...')
    execSync('npm run build', { cwd: root, stdio: 'pipe', timeout: 120000 })
    ok('npm run build 通过')
    return true
  } catch (e) {
    fail(`npm run build 失败: ${e.message.slice(0, 200)}`)
    return false
  }
}

function checkRagEmpty() {
  // 检查 RAG 是否有"无数据"兜底
  const ragFile = join(root, 'src/utils/rag.js')
  if (!existsSync(ragFile)) {
    fail('src/utils/rag.js 不存在')
    return false
  }
  const c = readFileSync(ragFile, 'utf-8')
  if (c.includes('return []') && /filter.*score.*MIN_THRESHOLD/.test(c)) {
    ok('RAG 有阈值过滤兜底（返回空数组时前端会展示"无数据"）')
    return true
  }
  warn('RAG 兜底逻辑不明确，建议检查 retrieve 返回空时的前端处理')
  return false
}

function checkDemoScript() {
  // 检查是否有演示脚本
  const candidates = [
    'scripts/test-agents-collab.mjs',
    'scripts/test-history-demo.mjs'
  ]
  const found = candidates.filter(f => existsSync(join(root, f)))
  if (found.length >= 1) {
    ok(`发现 ${found.length} 个演示脚本: ${found.join(', ')}`)
    return true
  }
  fail('未发现演示脚本')
  return false
}

function checkCascadeStatus() {
  const cascadeFile = join(root, 'src/core/cascade.js')
  if (!existsSync(cascadeFile)) {
    fail('src/core/cascade.js 不存在')
    return false
  }
  const c = readFileSync(cascadeFile, 'utf-8')
  if (c.includes('loadProfile') && /updateProfileAfterResponse/.test(c)) {
    ok('cascade.js 已修复（loadProfile + updateProfileAfterResponse）')
    return true
  }
  warn('cascade.js 可能未修复（缺 loadProfile / updateProfileAfterResponse）')
  return false
}

function checkTechDocs() {
  const docs = [
    '前端UI设计_v1.md',
    '前端UI设计_v2.md',
    '前端UI设计_v3.md'
  ]
  const found = docs.filter(f => existsSync(join(root, f)))
  if (found.length >= 2) {
    ok(`发现 ${found.length} 份技术文档: ${found.join(', ')}`)
    return true
  }
  warn('技术文档少于 2 份')
  return false
}

function checkKeyLeak() {
  // 简化版 key leak 检查（详细版见 test-key-leak.mjs）
  const srcDir = join(root, 'src')
  let leaked = false
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const s = statSync(p)
      if (s.isDirectory()) walk(p)
      else if (/\.(js|ts|vue)$/.test(name)) {
        const c = readFileSync(p, 'utf-8')
        if (/VITE_DEEPSEEK/.test(c)) leaked = true
      }
    }
  }
  walk(srcDir)
  if (!leaked) {
    ok('源码中未发现 VITE_DEEPSEEK_* 前缀')
    return true
  }
  fail('源码中发现 VITE_DEEPSEEK_* 前缀（会被 Vite 注入 bundle）')
  return false
}

const AUTO_CHECKS = {
  'vercel-url': checkVercelUrl,
  'deepseek-timeout': () => { warn('DeepSeek 超时需手动验证'); return true },
  'build-pass': checkBuildPass,
  'rag-empty': checkRagEmpty,
  'demo-script': checkDemoScript,
  'cascade-status': checkCascadeStatus,
  'tech-docs': checkTechDocs,
  'key-leak': checkKeyLeak
}

// ============================================================
// 输出 11 翻车点详情
// ============================================================
function printRisks() {
  banner('研芯通 · 11 大翻车点团队演练手册（v3.3）')
  console.log(`  风险总数：${RISKS.length}`)
  console.log(`  自建全栈特有：${RISKS.filter(r => r.category.includes('自建')).length}`)
  console.log(`  P0 级：${RISKS.filter(r => r.category.includes('P0')).length}`)
  console.log(`  演练模式：${CHECK_MODE ? '自动化检查' : '话术输出'}`)

  for (const r of RISKS) {
    section(`翻车点 ${r.id}：${r.title}（${r.category} · 概率 ${r.probability}）`)
    console.log(`  场景：${r.scenario}`)
    console.log('')
    speaker(r.talk)
    console.log('')
    console.log('  备份方案：')
    r.backup.forEach(b => console.log(`    - ${b}`))
    console.log('')
    console.log('  预防措施：')
    r.prevention.forEach(p => console.log(`    - ${p}`))

    if (CHECK_MODE && r.autoCheck) {
      console.log('')
      console.log('  自动化检查：')
      const checker = AUTO_CHECKS[r.autoCheck]
      if (checker) checker()
      else warn(`无对应检查器: ${r.autoCheck}`)
    }
  }
}

// ============================================================
// 演练 checklist
// ============================================================
function printChecklist() {
  banner('团队演练 Checklist（评审前 1 天完成）')
  const items = [
    { cat: '部署', task: 'Vercel 主链接可访问', done: false },
    { cat: '部署', task: 'Netlify 备用链接可访问', done: false },
    { cat: '部署', task: '本地录屏视频已录制', done: false },
    { cat: '构建', task: 'npm run build 通过', done: false },
    { cat: '构建', task: 'dist/ 大小 < 5MB', done: false },
    { cat: 'API', task: 'DeepSeek API 响应 < 5s', done: false },
    { cat: 'API', task: 'API Key 不在 bundle 中（test-key-leak.mjs 通过）', done: false },
    { cat: 'API', task: 'OpenAI API Key 备用已准备', done: false },
    { cat: '浏览器', task: 'Chrome / Edge / Firefox 三浏览器测试', done: false },
    { cat: '网络', task: '手机热点已准备', done: false },
    { cat: '演示', task: '5 分钟脚本计时 ≤ 4 分 30 秒', done: false },
    { cat: '演示', task: '3 分钟精简版脚本已背熟', done: false },
    { cat: '演示', task: '1 分钟精华版视频已准备', done: false },
    { cat: 'RAG', task: '10 个超纲问题标准回答已准备', done: false },
    { cat: 'RAG', task: '微电子 hit@5 ≥ 80%', done: false },
    { cat: 'RAG', task: 'CS hit@5 ≥ 80%', done: false },
    { cat: 'Agent', task: '5 Agent 协作联调通过', done: false },
    { cat: 'Agent', task: '5 轮诊断演示通过', done: false },
    { cat: 'Agent', task: '3 次规划演示通过', done: false },
    { cat: '文档', task: '技术架构图已准备', done: false },
    { cat: '文档', task: '关键代码截图已准备', done: false },
    { cat: '文档', task: '技术 Q&A 文档已准备', done: false }
  ]

  items.forEach((it, i) => {
    const mark = it.done ? '✓' : '☐'
    console.log(`  ${mark} [${it.cat.padEnd(6)}] ${it.task}`)
  })

  const done = items.filter(i => i.done).length
  console.log(`\n  进度：${done} / ${items.length}`)
}

// ============================================================
// 主流程
// ============================================================

printRisks()
printChecklist()

banner('演练结束')
if (CHECK_MODE) {
  console.log('  自动化检查已完成，请人工补充未自动化的项')
} else {
  console.log('  仅输出话术，加 --check 参数运行自动化检查')
  info('用法：node scripts/test-rollback-rehearsal.mjs --check')
}
console.log('')
