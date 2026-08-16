<script setup>
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { installSanitizeHooks, sanitizeHtml, SANITIZE_CONFIG } from '@/utils/sanitize'
import { extractMath, injectMath, extractSvg, injectSvg } from '@/utils/renderMath'
// KaTeX 样式（Vite 自动从 node_modules 解析）
import 'katex/dist/katex.min.css'

const props = defineProps({
  content: {
    type: String,
    default: ''
  },
  // inline 模式：渲染为 <span> 而非 <div>，适合选项文本等行内场景
  inline: {
    type: Boolean,
    default: false
  }
})

marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: false
})

// 装上 2 个 hook：img[src] 三类白名单 + a[href] 强制 rel
// 幂等：重复 install 会先 remove 旧 hook 再装新的
installSanitizeHooks(DOMPurify)

// DOMPurify SVG profile 配置（安全内联 SVG：电路/示意图）
const SVG_SANITIZE_CONFIG = Object.freeze({
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_TAGS: ['foreignObject'],
  ADD_ATTR: ['xmlns', 'viewBox', 'preserveAspectRatio', 'fill', 'stroke', 'stroke-width', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'transform', 'points', 'text-anchor', 'font-size', 'font-family']
})

/**
 * 完整渲染管线：
 *   1. 提取 SVG → 占位符
 *   2. 提取 math ($...$ / $$...$$) → 占位符
 *   3. marked.parse（markdown → HTML）
 *   4. DOMPurify sanitize（基础配置，禁 svg/math/style）
 *   5. 回填 KaTeX HTML（可信库输出，绕过 sanitize 不丢 inline style）
 *   6. 回填 DOMPurify SVG-profile sanitize 后的 SVG
 */
const html = computed(() => {
  if (!props.content) return ''

  // 1+2: 提取 SVG 与 math（SVG 先于 math，避免 SVG 内可能的 $ 被误识别）
  const { text: t1, svgs } = extractSvg(props.content)
  const { text: t2, tokens: mathTokens } = extractMath(t1)

  // 3: marked
  const rawHtml = marked.parse(t2)

  // 4: DOMPurify 基础 sanitize（4 道防御，见 sanitize.js）
  let safeHtml = sanitizeHtml(DOMPurify, rawHtml)

  // 5: 回填 KaTeX HTML（KaTeX 输出来自可信库，不经 DOMPurify）
  safeHtml = injectMath(safeHtml, mathTokens)

  // 6: 回填 SVG（每个 SVG 经 DOMPurify SVG profile sanitize）
  if (svgs.length > 0) {
    const svgTokens = svgs.map(({ placeholder, raw }) => ({
      placeholder,
      sanitized: DOMPurify.sanitize(raw, SVG_SANITIZE_CONFIG)
    }))
    safeHtml = injectSvg(safeHtml, svgTokens)
  }

  return safeHtml
})
</script>

<template>
  <component :is="inline ? 'span' : 'div'" class="markdown-renderer" v-html="html"></component>
</template>

<style scoped>
.markdown-renderer {
  font-size: var(--text-body);
  line-height: 1.75;
  color: var(--color-fg-primary);
  word-wrap: break-word;
}

/* === 标题：衬线学术感 === */
.markdown-renderer :deep(h1),
.markdown-renderer :deep(h2),
.markdown-renderer :deep(h3),
.markdown-renderer :deep(h4),
.markdown-renderer :deep(h5),
.markdown-renderer :deep(h6) {
  font-family: var(--font-serif);
  font-weight: 700;
  color: var(--color-ink-900);
  line-height: 1.3;
  letter-spacing: 0.3px;
  position: relative;
}

.markdown-renderer :deep(h1) {
  font-size: 22px;
  margin: 20px 0 12px;
  padding-left: 12px;
  border-left: 3px solid var(--color-ink-900);
}

.markdown-renderer :deep(h2) {
  font-size: 18px;
  margin: 18px 0 10px;
  padding-left: 10px;
  border-left: 3px solid var(--color-node-active);
}

.markdown-renderer :deep(h3) {
  font-size: 16px;
  margin: 14px 0 8px;
  color: var(--color-ink-700);
}

.markdown-renderer :deep(h4),
.markdown-renderer :deep(h5),
.markdown-renderer :deep(h6) {
  font-size: 14px;
  margin: 12px 0 6px;
  color: var(--color-ink-700);
}

.markdown-renderer :deep(h1:first-child),
.markdown-renderer :deep(h2:first-child),
.markdown-renderer :deep(h3:first-child) {
  margin-top: 0;
}

/* === 段落 === */
.markdown-renderer :deep(p) {
  margin: 10px 0;
}

/* === 强调 === */
.markdown-renderer :deep(strong),
.markdown-renderer :deep(b) {
  font-weight: 700;
  color: var(--color-ink-900);
}

.markdown-renderer :deep(em),
.markdown-renderer :deep(i) {
  font-style: italic;
  color: var(--color-ink-700);
}

.markdown-renderer :deep(del),
.markdown-renderer :deep(s) {
  text-decoration: line-through;
  color: var(--color-fg-tertiary);
}

.markdown-renderer :deep(mark) {
  background: var(--color-warning-bg);
  color: var(--color-ink-900);
  padding: 1px 4px;
  border-radius: var(--radius-xs);
}

/* === 列表 === */
.markdown-renderer :deep(ul),
.markdown-renderer :deep(ol) {
  margin: 10px 0;
  padding-left: 22px;
}

.markdown-renderer :deep(li) {
  margin: 4px 0;
  padding-left: 4px;
}

.markdown-renderer :deep(li::marker) {
  color: var(--color-node-active);
  font-weight: 600;
}

.markdown-renderer :deep(li > ul),
.markdown-renderer :deep(li > ol) {
  margin: 4px 0;
}

/* === 引用块：知识节点感 === */
.markdown-renderer :deep(blockquote) {
  margin: 12px 0;
  padding: 10px 14px;
  border-left: 3px solid var(--color-node-active);
  background: linear-gradient(90deg, rgba(0, 212, 170, 0.06) 0%, transparent 100%);
  color: var(--color-ink-700);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  font-size: 13px;
  position: relative;
}

.markdown-renderer :deep(blockquote::before) {
  content: '';
  position: absolute;
  left: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--color-node-active);
  box-shadow: 0 0 0 3px rgba(0, 212, 170, 0.2);
}

.markdown-renderer :deep(blockquote p) {
  margin: 4px 0;
}

/* === 行内代码：终端感 === */
.markdown-renderer :deep(code) {
  padding: 2px 6px;
  background: var(--color-bg-sunken);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xs);
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--color-ink-900);
}

/* === 代码块 === */
.markdown-renderer :deep(pre) {
  margin: 12px 0;
  padding: 14px 16px;
  background: var(--color-ink-900);
  border-radius: var(--radius-md);
  overflow-x: auto;
  position: relative;
}

.markdown-renderer :deep(pre::before) {
  content: '';
  position: absolute;
  top: 12px;
  left: 14px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-node-weak);
  box-shadow: 14px 0 0 var(--color-node-warn), 28px 0 0 var(--color-node-active);
}

.markdown-renderer :deep(pre code) {
  display: block;
  padding-top: 18px;
  background: transparent;
  border: none;
  color: #e6e6e6;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.65;
}

/* === 分隔线 === */
.markdown-renderer :deep(hr) {
  margin: 18px 0;
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-border-default), transparent);
}

/* === 链接 === */
.markdown-renderer :deep(a) {
  color: var(--color-ink-700);
  text-decoration: none;
  border-bottom: 1px dashed var(--color-ink-500);
  transition: all var(--duration-fast) var(--ease-out);
}

.markdown-renderer :deep(a:hover) {
  color: var(--color-node-active);
  border-bottom-color: var(--color-node-active);
}

/* === 表格 === */
.markdown-renderer :deep(table) {
  width: 100%;
  margin: 12px 0;
  border-collapse: collapse;
  font-size: 13px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--color-border-subtle);
}

.markdown-renderer :deep(thead) {
  background: var(--color-bg-sunken);
}

.markdown-renderer :deep(th) {
  padding: 10px 14px;
  text-align: left;
  font-family: var(--font-serif);
  font-weight: 700;
  color: var(--color-ink-900);
  border-bottom: 2px solid var(--color-border-default);
}

.markdown-renderer :deep(td) {
  padding: 8px 14px;
  border-bottom: 1px solid var(--color-border-subtle);
  color: var(--color-fg-primary);
}

.markdown-renderer :deep(tbody tr:last-child td) {
  border-bottom: none;
}

.markdown-renderer :deep(tbody tr:hover) {
  background: var(--color-bg-sunken);
}

/* === 图片 === */
.markdown-renderer :deep(img) {
  max-width: 100%;
  border-radius: var(--radius-md);
  margin: 8px 0;
}

/* === KaTeX 公式 === */
.markdown-renderer :deep(.katex) {
  font-size: 1.05em;
}

.markdown-renderer :deep(.katex-display) {
  margin: 14px 0;
  padding: 10px 14px;
  background: var(--color-bg-sunken, #f6f8fa);
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--color-border-subtle, #e2e8f0);
  overflow-x: auto;
  overflow-y: hidden;
  text-align: center;
}

.markdown-renderer :deep(.katex-display > .katex) {
  white-space: nowrap;
}

/* 内联 SVG 电路/示意图 */
.markdown-renderer :deep(svg) {
  max-width: 100%;
  height: auto;
  margin: 8px 0;
}
</style>
