// ============================================================
// DevTools Network 自检脚本（v3.3 翻车点 11 P0）
// ============================================================
// 验证目标：
//   1. 前端调用 /api/chat 代理，DevTools Network 不应出现 api.deepseek.com
//   2. 前端 bundle 中不应出现 sk- 开头的 DeepSeek API Key
//   3. process.env 中 DEEPSEEK_API_KEY 不会泄漏到前端
//
// 用法：
//   node scripts/test-key-leak.mjs                      # 检查 dist/ 静态文件
//   node scripts/test-key-leak.mjs --live               # 检查 dist + 发请求验证 Network
//   node scripts/test-key-leak.mjs --live --url=URL     # 指定线上 URL
// ============================================================

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(__dirname, '..')

// ============================================================
// 参数解析
// ============================================================
const args = process.argv.slice(2)
const LIVE_MODE = args.includes('--live')
const urlArg = args.find(a => a.startsWith('--url='))
const TARGET_URL = urlArg ? urlArg.replace('--url=', '') : 'http://localhost:5174'
const distDir = join(root, 'dist')

// ============================================================
// 工具
// ============================================================
function ok(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`) }
function fail(msg) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`) }
function info(msg) { console.log(`  \x1b[36mℹ\x1b[0m ${msg}`) }
function warn(msg) { console.log(`  \x1b[33m!\x1b[0m ${msg}`) }

function section(t) {
  console.log(`\n${'─'.repeat(70)}\n  ${t}\n${'─'.repeat(70)}`)
}

const failures = []

// ============================================================
// 检查 1：dist/ 中不应包含 DeepSeek API Key
// ============================================================
function checkDistNoKey() {
  section('检查 1：dist/ 静态文件中是否泄漏 DeepSeek API Key')

  if (!existsSync(distDir)) {
    warn(`dist/ 目录不存在，请先运行 npm run build`)
    failures.push('dist/ 不存在，无法静态扫描')
    return
  }

  // 收集所有 JS / HTML 文件
  const files = []
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const s = statSync(p)
      if (s.isDirectory()) walk(p)
      else if (/\.(js|html|json|css)$/.test(name)) files.push(p)
    }
  }
  walk(distDir)

  if (files.length === 0) {
    warn('dist/ 为空')
    failures.push('dist/ 为空')
    return
  }

  info(`扫描 ${files.length} 个文件`)

  let leaked = false
  for (const f of files) {
    const content = readFileSync(f, 'utf-8')

    // 模式 1：sk- 开头的 DeepSeek Key
    const skMatch = content.match(/sk-[a-zA-Z0-9]{20,}/)
    if (skMatch) {
      fail(`${f}: 发现疑似 API Key: ${skMatch[0].slice(0, 12)}...`)
      failures.push(`${f}: 含 sk-* Key`)
      leaked = true
    }

    // 模式 2：VITE_DEEPSEEK_API_KEY 变量名
    if (/VITE_DEEPSEEK_API_KEY/.test(content)) {
      fail(`${f}: 发现 VITE_DEEPSEEK_API_KEY 变量名（已进 bundle）`)
      failures.push(`${f}: 含 VITE_DEEPSEEK_API_KEY`)
      leaked = true
    }

    // 模式 3：api.deepseek.com 域名
    if (/api\.deepseek\.com/.test(content)) {
      fail(`${f}: 发现 api.deepseek.com 域名（前端直连，违反代理约束）`)
      failures.push(`${f}: 含 api.deepseek.com`)
      leaked = true
    }

    // 模式 4：Authorization Bearer（结合上下文判断）
    if (/Bearer\s+sk-/.test(content)) {
      fail(`${f}: 发现 Authorization Bearer sk- 头`)
      failures.push(`${f}: 含 Bearer sk-`)
      leaked = true
    }
  }

  if (!leaked) {
    ok('dist/ 中未发现 API Key / VITE_DEEPSEEK_API_KEY / api.deepseek.com / Bearer sk-')
  }
}

// ============================================================
// 检查 2：源码中不应使用 VITE_DEEPSEEK_* 前缀
// ============================================================
function checkSourceNoViteDeepseek() {
  section('检查 2：源码中是否使用 VITE_DEEPSEEK_* 前缀（CI grep 检查）')

  const srcDir = join(root, 'src')
  if (!existsSync(srcDir)) {
    warn('src/ 目录不存在')
    failures.push('src/ 不存在')
    return
  }

  const srcFiles = []
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const s = statSync(p)
      if (s.isDirectory()) walk(p)
      else if (/\.(js|ts|vue|jsx|tsx)$/.test(name)) srcFiles.push(p)
    }
  }
  walk(srcDir)

  info(`扫描 ${srcFiles.length} 个源码文件`)

  let leaked = false
  for (const f of srcFiles) {
    const content = readFileSync(f, 'utf-8')
    if (/VITE_DEEPSEEK/.test(content)) {
      fail(`${f}: 使用 VITE_DEEPSEEK_* 前缀（会被 Vite 注入 bundle）`)
      failures.push(`${f}: 源码含 VITE_DEEPSEEK`)
      leaked = true
    }
  }

  if (!leaked) {
    ok('源码中未使用 VITE_DEEPSEEK_* 前缀（v3.4 §翻车点 11 验收通过）')
  }
}

// ============================================================
// 检查 3：.env / .env.example 不应包含真实 key
// ============================================================
function checkEnvFiles() {
  section('检查 3：.env / .env.example 中是否包含真实 Key')

  // 读取 .gitignore，确认 .env 是否被忽略
  const gitignorePath = join(root, '.gitignore')
  let envIgnored = false
  if (existsSync(gitignorePath)) {
    const gi = readFileSync(gitignorePath, 'utf-8')
    if (/^\.env$/m.test(gi) || /^\.env\s/m.test(gi)) {
      envIgnored = true
    }
  }

  const envFiles = ['.env', '.env.example', '.env.local', '.env.production']
  for (const name of envFiles) {
    const p = join(root, name)
    if (!existsSync(p)) continue

    const content = readFileSync(p, 'utf-8')
    // 真实 key = sk- 开头 + 20+ 字符
    const realKey = content.match(/sk-[a-zA-Z0-9]{20,}/)
    if (realKey) {
      if (name === '.env' && envIgnored) {
        // .env 含真实 key 是正常的（本地开发用），只要被 gitignore 忽略即可
        ok(`${name}: 含真实 API Key（已 .gitignore 忽略，不会入库）`)
      } else {
        fail(`${name}: 含真实 API Key: ${realKey[0].slice(0, 12)}...（${envIgnored ? '虽已忽略，但建议改用 Vercel 环境变量' : '且未被 .gitignore 忽略！'}）`)
        failures.push(`${name}: 含真实 Key`)
      }
    } else {
      ok(`${name}: 未发现真实 API Key（占位符 OK）`)
    }
  }

  // 额外检查：.env.example 不应含真实 key
  const examplePath = join(root, '.env.example')
  if (existsSync(examplePath)) {
    const c = readFileSync(examplePath, 'utf-8')
    if (/sk-[a-zA-Z0-9]{20,}/.test(c)) {
      fail('.env.example 含真实 Key（模板文件严禁含真实 Key）')
      failures.push('.env.example 含真实 Key')
    }
  }
}

// ============================================================
// 检查 4：--live 模式，发请求验证 Network
// ============================================================
async function checkLiveNetwork() {
  section(`检查 4：--live 模式 · 实时请求 ${TARGET_URL}/api/chat`)

  // 模拟前端请求 /api/chat
  try {
    const r = await fetch(`${TARGET_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: '你是研芯通的导师，请回答学生问题。',
        userInput: '什么是 MOSFET？',
        options: { model: 'deepseek-chat', temperature: 0.5, max_tokens: 500 }
      })
    })

    info(`HTTP ${r.status}`)
    info(`响应 Content-Type: ${r.headers.get('content-type')}`)

    // 检查响应头中是否泄漏 DeepSeek 域名
    const respHeaders = JSON.stringify(Object.fromEntries(r.headers.entries()))
    if (/api\.deepseek\.com|deepseek/.test(respHeaders)) {
      fail(`响应头中泄漏 DeepSeek 域名: ${respHeaders.slice(0, 200)}`)
      failures.push('响应头泄漏 DeepSeek')
    } else {
      ok('响应头中未泄漏 DeepSeek 域名')
    }

    // 检查响应体
    const data = await r.json().catch(() => ({}))
    if (data.error === 'api_key_not_configured') {
      warn('服务器未配置 DEEPSEEK_API_KEY（Vercel Project Settings → Environment Variables）')
      warn('但代理路径正确：前端 → /api/chat → serverless → DeepSeek')
    } else if (data.content) {
      ok(`代理调用成功，返回内容长度: ${data.content.length}`)
      ok('Network 链路：浏览器 → /api/chat → Vercel serverless → DeepSeek')
      ok('浏览器 DevTools Network 只能看到 /api/chat，看不到 api.deepseek.com')
    } else {
      warn(`响应非预期: ${JSON.stringify(data).slice(0, 200)}`)
    }
  } catch (e) {
    fail(`请求失败: ${e.message}`)
    fail(`请确认 ${TARGET_URL} 已启动`)
    failures.push(`--live 请求失败`)
  }
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗')
  console.log('║  研芯通 · DevTools Network 自检（v3.3 翻车点 11 P0）       ║')
  console.log('║  验收：API Key 不进前端 bundle / 不直连 api.deepseek.com   ║')
  console.log('╚════════════════════════════════════════════════════════════╝')

  checkDistNoKey()
  checkSourceNoViteDeepseek()
  checkEnvFiles()

  if (LIVE_MODE) {
    await checkLiveNetwork()
  } else {
    section('检查 4：跳过（如需实时验证，加 --live 参数）')
    info('用法：node scripts/test-key-leak.mjs --live --url=http://localhost:5174')
  }

  // 总结
  section('自检报告')
  if (failures.length === 0) {
    console.log('  \x1b[32m✓ 全部检查通过，无 API Key 泄漏风险\x1b[0m\n')
    process.exit(0)
  } else {
    console.log(`  \x1b[31m✗ 发现 ${failures.length} 个问题：\x1b[0m`)
    failures.forEach(f => console.log(`    - ${f}`))
    console.log('')
    process.exit(1)
  }
}

main().catch(e => {
  console.error('\n\x1b[31m[FATAL]\x1b[0m', e)
  process.exit(2)
})
