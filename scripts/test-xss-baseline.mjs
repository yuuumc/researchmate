#!/usr/bin/env node
// ============================================================
// P0-5 预研：用 Playwright 真浏览器跑 XSS payload
// ============================================================
// 避免在 Node 里 fake window，直接起 Chromium 跑 marked + DOMPurify
// 用法：node scripts/test-xss-baseline.mjs [baseline|hardened]
// ============================================================

import pw from '/home/gem/.npm-global/lib/node_modules/playwright/index.js'
const { chromium } = pw
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const mode = process.argv[2] || 'baseline'

// 5 个 payload
const PAYLOADS = [
  {
    name: 'P1: <img src=x onerror=alert(1)>',
    raw: '<img src=x onerror=alert(1)>',
    detect: (out) => {
      const hasOnerror = /onerror\s*=/i.test(out)
      const hasAlert = /alert\s*\(/.test(out)
      return {
        passed: !hasOnerror && !hasAlert,
        evidence: [
          hasOnerror ? '❌ onerror 漏出' : '✓ onerror 已剥',
          hasAlert ? '❌ alert 漏出' : '✓ alert 已剥'
        ]
      }
    }
  },
  {
    name: 'P2: <a href="javascript:alert(1)">x</a>',
    raw: '<a href="javascript:alert(1)">x</a>',
    detect: (out) => {
      const hasJs = /javascript\s*:/i.test(out)
      const hasAlert = /alert\s*\(/.test(out)
      return {
        passed: !hasJs && !hasAlert,
        evidence: [
          hasJs ? '❌ javascript: 协议漏出' : '✓ javascript: 已挡',
          hasAlert ? '❌ alert 漏出' : '✓ alert 已剥'
        ]
      }
    }
  },
  {
    name: 'P3: <svg onload=alert(1)>',
    raw: '<svg onload=alert(1)></svg>',
    detect: (out) => {
      const hasSvg = /<svg/i.test(out)
      const hasOnload = /onload\s*=/i.test(out)
      const hasAlert = /alert\s*\(/.test(out)
      return {
        passed: !hasSvg && !hasOnload && !hasAlert,
        evidence: [
          hasSvg ? '❌ svg 标签漏出' : '✓ svg 标签已剥',
          hasOnload ? '❌ onload 漏出' : '✓ onload 已剥',
          hasAlert ? '❌ alert 漏出' : '✓ alert 已剥'
        ]
      }
    }
  },
  {
    name: 'P4: <img src="https://evil.com/track?cookie=x">（外链跟踪）',
    raw: '<img src="https://evil.com/track?cookie=x" alt="poc">',
    detect: (out) => {
      const hasEvil = /evil\.com/i.test(out)
      return {
        passed: !hasEvil,
        evidence: [
          hasEvil ? '❌ evil.com 外链漏出（hook 未挡）' : '✓ evil.com 已挡（hook 白名单）'
        ]
      }
    }
  },
  {
    name: 'P5: <img src="data:text/html;base64,...">（data:text/html 伪装）',
    raw: '<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" alt="poc">',
    detect: (out) => {
      const hasHtmlData = /data:text\/html/i.test(out)
      const hasScriptData = /PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==/i.test(out)
      return {
        passed: !hasHtmlData && !hasScriptData,
        evidence: [
          hasHtmlData ? '❌ data:text/html 漏出' : '✓ data:text/html 已挡',
          hasScriptData ? '❌ base64 script payload 漏出' : '✓ base64 script payload 已挡'
        ]
      }
    }
  }
]

// 读 hardened 模式需要的 sanitize.js（如果存在）
// 把它从 ESM 源转成可在 <script> 跑的版本：去掉 export 关键字，挂到 window.__sanitize
async function loadSanitizeForBrowser() {
  const src = await readFile(join(__dirname, '../src/utils/sanitize.js'), 'utf8')
  // 去掉所有 export 关键字（const/function/default → 裸）
  // export const X = ...  → const X = ...
  // export function f(...) → function f(...)
  // export default {...}  → const __default = {...}  (我们已用 window.__sanitize)
  const transformed = src
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s+function\s+/gm, 'function ')
    .replace(/^export\s+default\s+/gm, 'const __default_export__ = ')
  return transformed
}

// 构造测试 HTML（不依赖 CDN，marked + DOMPurify 通过 evaluate 注入）
const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>XSS Test</title>
</head>
<body>
  <pre id="out"></pre>
  <script>
    // 此 script 在外部 lib 注入后由 playwright evaluate 再触发
    window.__runTest = function(mode) {
    marked.setOptions({ breaks: true, gfm: true, headerIds: false })

    let cfg, hookNote
    if (mode === 'hardened') {
      // 走 src/utils/sanitize.js 装 hook + 拿配置
      if (!window.__sanitize) {
        document.getElementById('out').textContent = JSON.stringify({ error: 'sanitize.js 未注入' })
        return
      }
      window.__sanitize.installSanitizeHooks(window.DOMPurify, 'https://app.example.com')
      cfg = window.__sanitize.SANITIZE_CONFIG
      hookNote = '（已注入：img[src] 三类白名单 + a[rel] 强制）'
    } else {
      // baseline：当前 main 113eb97 的配置（MarkdownRenderer.vue 原文）
      cfg = {
        ALLOWED_TAGS: [
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'p', 'br', 'hr',
          'strong', 'b', 'em', 'i', 'del', 's', 'mark',
          'ul', 'ol', 'li',
          'blockquote', 'code', 'pre',
          'a', 'img',
          'table', 'thead', 'tbody', 'tr', 'th', 'td',
          'div', 'span'
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class']
      }
      hookNote = '（无 hook）'
    }

    const payloads = ${JSON.stringify(PAYLOADS.map(p => ({ name: p.name, raw: p.raw })))}
    const results = []
    for (const p of payloads) {
      const markedHtml = marked.parse(p.raw)
      const out = DOMPurify.sanitize(markedHtml, cfg)
      results.push({ name: p.name, raw: p.raw, marked: markedHtml, out })
    }
    document.getElementById('out').textContent = JSON.stringify({ mode, hookNote, config: cfg, results }, null, 2)
    }
  </script>
</body>
</html>
`

const browser = await chromium.launch({ headless: true, executablePath: '/opt/chromium.org/chromium/chrome' })
const context = await browser.newContext()
const page = await context.newPage()

// 收集 console 错误
page.on('console', (msg) => console.log(`[browser] ${msg.type()}: ${msg.text()}`))
page.on('pageerror', (err) => console.log(`[browser error] ${err.message}`))
page.on('requestfailed', (req) => console.log(`[browser failed] ${req.url()} - ${req.failure()?.errorText}`))

// 读 UMD 源
const markedSrc = await readFile('/home/gem/.aily/workdir/web_p2p/yxt-v3fix/node_modules/marked/lib/marked.umd.js', 'utf8').catch(() => null)
const purifySrc = await readFile('/home/gem/.aily/workdir/web_p2p/yxt-v3fix/node_modules/dompurify/dist/purify.min.js', 'utf8').catch(() => null)
const sanitizeSrc = mode === 'hardened' ? await loadSanitizeForBrowser().catch((e) => {
  console.error('❌ 找不到 src/utils/sanitize.js，请先实施加固方案:', e.message)
  process.exit(1)
}) : null

if (!markedSrc || !purifySrc) {
  console.error('❌ 找不到 marked 或 DOMPurify 源文件')
  process.exit(1)
}

await page.setContent(testHtml, { waitUntil: 'load' })
// 注入 marked + DOMPurify（UMD 直接 eval，挂 window）
await page.evaluate(([m, p, s]) => {
  function inject(text) {
    const sc = document.createElement('script')
    sc.textContent = text
    document.head.appendChild(sc)
  }
  inject(m)
  inject(p)
  if (s) inject(s)
}, [markedSrc, purifySrc, sanitizeSrc])

// 等 DOMPurify + sanitize（hardened 模式）都到位
await page.waitForFunction(
  (wantSanitize) => {
    if (typeof window.marked === 'undefined' || typeof window.DOMPurify === 'undefined') return false
    if (wantSanitize && typeof window.__sanitize === 'undefined') return false
    return true
  },
  mode === 'hardened',
  { timeout: 10000 }
)

// 触发测试
await page.evaluate((m) => window.__runTest(m), mode)
// 等待结果
await page.waitForFunction(() => document.getElementById('out')?.textContent?.length > 100, { timeout: 10000 })
const jsonStr = await page.locator('#out').textContent()
await browser.close()

const data = JSON.parse(jsonStr)
if (data.error) {
  console.error('❌ 浏览器端报错:', data.error)
  process.exit(1)
}
const title = mode === 'hardened'
  ? 'P0-5 预研 · XSS 加固后测试（src/utils/sanitize.js）'
  : 'P0-5 预研 · XSS 基线测试（main 113eb97 当前配置）'

console.log('========================================================')
console.log(title)
console.log('========================================================\n')
console.log('当前 ALLOWED_ATTR:', (data.config.ALLOWED_ATTR || []).join(', ') || '(默认)')
console.log('当前 FORBID_TAGS:  ', (data.config.FORBID_TAGS || []).join(', ') || '未设置')
console.log('当前 ALLOWED_URI_REGEXP: ', data.config.ALLOWED_URI_REGEXP ? data.config.ALLOWED_URI_REGEXP : '未设置')
console.log('当前 addHook:      ', data.hookNote)
console.log()

let passCount = 0
let failCount = 0
for (let i = 0; i < PAYLOADS.length; i++) {
  const p = PAYLOADS[i]
  const r = data.results[i]
  const det = p.detect(r.out)
  if (det.passed) passCount++
  else failCount++

  console.log(`--- ${p.name} ---`)
  console.log(`输入:       ${p.raw}`)
  console.log(`marked 后:  ${JSON.stringify(r.marked.trim())}`)
  console.log(`sanitize 后:${JSON.stringify(r.out)}`)
  console.log(`判定:       ${det.passed ? '✅ PASS' : '❌ FAIL'}`)
  for (const e of det.evidence) console.log(`  ${e}`)
  console.log()
}

console.log('========================================================')
console.log(`结果：${passCount} PASS / ${failCount} FAIL（共 ${PAYLOADS.length} 项）`)
console.log('========================================================')

process.exit(failCount > 0 ? 1 : 0)
