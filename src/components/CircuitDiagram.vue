<script setup>
// ============================================================
// src/components/CircuitDiagram.vue
// B1：独立电路/示意图渲染组件
// 接收 SVG 字符串或 markdown 图片语法，统一走 DOMPurify SVG profile
// sanitize 后渲染为内联 SVG。
// ============================================================
import { computed } from 'vue'
import DOMPurify from 'dompurify'
import { installSanitizeHooks } from '@/utils/sanitize'

const props = defineProps({
  // SVG 字符串（<svg>...</svg>）或空
  svg: { type: String, default: '' },
  // 图片 URL（走 <img>）
  src: { type: String, default: '' },
  alt: { type: String, default: '电路示意图' }
})

installSanitizeHooks(DOMPurify)

const SVG_CONFIG = Object.freeze({
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_ATTR: ['xmlns', 'viewBox', 'preserveAspectRatio', 'fill', 'stroke', 'stroke-width', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'transform', 'points', 'text-anchor', 'font-size', 'font-family']
})

const safeSvg = computed(() => {
  if (!props.svg) return ''
  return DOMPurify.sanitize(props.svg, SVG_CONFIG)
})
</script>

<template>
  <div class="circuit-diagram">
    <div v-if="safeSvg" class="circuit-svg" v-html="safeSvg"></div>
    <img v-else-if="src" :src="src" :alt="alt" class="circuit-img" />
    <span v-else class="circuit-empty">{{ alt }}</span>
  </div>
</template>

<style scoped>
.circuit-diagram {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 12px 0;
  padding: 12px;
  background: var(--color-bg-sunken, #f6f8fa);
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--color-border-subtle, #e2e8f0);
}

.circuit-svg :deep(svg) {
  max-width: 100%;
  height: auto;
}

.circuit-img {
  max-width: 100%;
  border-radius: var(--radius-sm, 6px);
}

.circuit-empty {
  color: var(--color-fg-tertiary, #999);
  font-size: 13px;
  font-style: italic;
}
</style>
