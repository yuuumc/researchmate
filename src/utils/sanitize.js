// ============================================================
// src/utils/sanitize.js
// P0-5：DOMPurify 加固集中配置（4 道防御）
//
// 1. 基础：ALLOWED_ATTR 收紧（src/href 走 URI 白名单），显式 FORBID_TAGS
// 2. 加固 A：img[src] hook 白名单（CDN / 同源 / data:image 合法子集）
// 3. 加固 B：<a href="javascript:..."> 用 ALLOWED_URI_REGEXP 挡 +
//             addHook('afterSanitizeAttributes') 强制 a[rel]
// 4. 其它：FORBID_ATTR 屏蔽 style/事件类属性
//
// 用法：
//   import { installSanitizeHooks, sanitizeHtml, SANITIZE_CONFIG } from '@/utils/sanitize'
//   installSanitizeHooks(DOMPurify)
//   const safe = sanitizeHtml(DOMPurify, marked.parse(input))
// ============================================================

// ---- img[src] 白名单正则（3 类） ----------------------------
const IMG_SRC_PATTERNS = [
  // 1) 自有 CDN 域名（严匹配 host 段）
  /^https:\/\/yanxintong-cdn\.example\.com\//i,
  // 2) 同源（相对路径 / 同 host 协议）— 由 hook 内 window.location 决定
  //    这里只放占位正则，运行时由 installSanitizeHooks 注入 origin
  null,
  // 3) data:image/(png|jpeg|gif|webp);base64,...
  /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i
]

// ---- a[href] 允许的 URI 协议正则 ----------------------------
// 与 DOMPurify 默认一致：禁 javascript:/data:/vbscript: 等危险协议
// 注意：默认 ALLOWED_URI_REGEXP 已挡 javascript:，这里再写一遍以"显式表达"
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel|ftp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.:\-]|$))/i

// ---- 集中配置：4 道防御落地 -------------------------------
export const SANITIZE_CONFIG = Object.freeze({
  // 1) 基础：白名单标签（删除 svg/script/iframe 等危险标签）
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
  // 收紧：src/href 在 hook 内做白名单校验；attr 显式收窄
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'rel', 'target'],
  // 显式禁危险标签（与现有约束保持一致）
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style', 'link', 'meta', 'base', 'svg', 'math'],
  // 禁事件类与 style（防止 inline 行为）
  FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onabort', 'onkeydown', 'onkeyup', 'onkeypress'],
  // 2/3) URI 协议白名单（挡 javascript: / data:text\/html）
  ALLOWED_URI_REGEXP
})

// ---- hook 装/卸 -------------------------------
let hooksInstalled = false
let currentOrigin = null

/**
 * 给 DOMPurify 实例装上 2 个 afterSanitizeAttributes hook：
 *   - img[src] 三类白名单（CDN / 同源 / data:image 合法子集），不通过则剥 src
 *   - a[href] 强制 rel="noopener noreferrer nofollow"
 *
 * @param {object} purify  - DOMPurify 实例
 * @param {string} [origin] - 同源白名单用的 origin（如 'https://app.example.com'）；不传则读 window.location.origin
 */
export function installSanitizeHooks(purify, origin) {
  if (!purify || typeof purify.addHook !== 'function') {
    throw new Error('[sanitize] installSanitizeHooks: 需要 DOMPurify 实例')
  }

  // 同源 origin：浏览器侧读 window.location；SSR / Node 侧需显式传
  if (typeof window !== 'undefined' && window.location) {
    currentOrigin = origin || window.location.origin
  } else {
    currentOrigin = origin || ''
  }

  // 防止重复装（DOMPurify hook 是全局的，多次 addHook 会重复执行）
  if (hooksInstalled) {
    purify.removeHook('afterSanitizeAttributes')
    hooksInstalled = false
  }

  purify.addHook('afterSanitizeAttributes', (node) => {
    if (!node || !node.tagName) return

    // === 加固 A：img[src] 三类白名单 ===
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src')
      if (src != null) {
        const allowed =
          IMG_SRC_PATTERNS[0].test(src) || // 1) 自有 CDN
          IMG_SRC_PATTERNS[2].test(src) || // 3) data:image 合法子集
          (currentOrigin && isSameOrigin(src, currentOrigin)) // 2) 同源
        if (!allowed) {
          // 不在白名单 → 剥 src（保留 alt 让 UI 占位可读）
          node.removeAttribute('src')
        }
      }
    }

    // === 加固 B：a[href] 强制 rel ===
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('rel', 'noopener noreferrer nofollow')
    }
  })

  hooksInstalled = true
}

/**
 * 同源判定：相对路径 / 协议相对 / 同 host
 */
function isSameOrigin(src, origin) {
  if (!src) return false
  // 相对路径：以 '/' 开头但非 '//'（非协议相对）
  if (src.startsWith('/') && !src.startsWith('//')) return true
  // 协议相对：//host/...
  if (src.startsWith('//')) {
    try {
      const u = new URL(origin)
      return src.slice(2).split('/')[0] === u.host
    } catch (_) { return false }
  }
  // 绝对 URL：比较 origin
  try {
    const u = new URL(src, origin)
    return u.origin === origin
  } catch (_) {
    return false
  }
}

/**
 * 便利函数：装 hook（幂等）并 sanitize HTML
 * @param {object} purify - DOMPurify 实例
 * @param {string} html   - 待清理的 HTML
 * @returns {string}
 */
export function sanitizeHtml(purify, html) {
  if (!purify) throw new Error('[sanitize] sanitizeHtml: 需要 DOMPurify 实例')
  if (html == null || html === '') return ''
  installSanitizeHooks(purify)
  return purify.sanitize(String(html), SANITIZE_CONFIG)
}

export default {
  SANITIZE_CONFIG,
  installSanitizeHooks,
  sanitizeHtml
}

// ---- 浏览器/Playwright 全局暴露（UMD 兼容） ----------------
// 在 ESM 构建里 import 默认走上方 export。
// 在 <script> 注入（Playwright 预研）场景，把同一份对象挂到 window，
// 让预研脚本能直接拿 SANITIZE_CONFIG / installSanitizeHooks / sanitizeHtml。
if (typeof window !== 'undefined') {
  window.__sanitize = {
    SANITIZE_CONFIG,
    installSanitizeHooks,
    sanitizeHtml
  }
}
