<script setup>
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps({
  content: {
    type: String,
    default: ''
  }
})

marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: false
})

const html = computed(() => {
  if (!props.content) return ''
  const rawHtml = marked.parse(props.content)
  return DOMPurify.sanitize(rawHtml, {
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
  })
})
</script>

<template>
  <div class="markdown-renderer" v-html="html"></div>
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
</style>
