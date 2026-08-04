<template>
  <span class="ai-gen-badge" :class="variant">
    <span class="ai-gen-badge__icon">✦</span>
    <span class="ai-gen-badge__text">{{ text }}</span>
  </span>
</template>

<script setup>
defineProps({
  text: { type: String, default: "本内容由 AI 生成" },
  variant: { type: String, default: "inline" }
})
</script>

<style scoped>
.ai-gen-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: var(--radius-full, 999px);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 600;
  background: color-mix(in srgb, #00d4aa 15%, transparent);
  color: #00a07d;
  line-height: 1.4;
  white-space: nowrap;
}
.ai-gen-badge__icon { font-size: 10px; }
.ai-gen-badge--block { display: flex; margin-bottom: 10px; }
</style>
