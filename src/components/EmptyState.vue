<template>
  <div class="empty-state">
    <div class="empty-state__illustration">
      <svg viewBox="0 0 120 120" width="80" height="80"
           fill="none" stroke="currentColor" stroke-width="1.5"
           stroke-linecap="round" stroke-linejoin="round">
        <!-- 空盒子 -->
        <path d="M60 20 L100 40 L100 80 L60 100 L20 80 L20 40 Z" />
        <path d="M20 40 L60 60 L100 40" />
        <path d="M60 60 L60 100" />
        <path d="M40 30 L80 50" stroke-dasharray="4 4" opacity="0.4" />
      </svg>
    </div>
    <p class="empty-state__title">{{ title }}</p>
    <p v-if="description" class="empty-state__desc">{{ description }}</p>
    <button v-if="actionText" class="empty-state__action" @click="$emit('action')">
      {{ actionText }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: '暂无数据' },
  description: { type: String, default: '' },
  actionText: { type: String, default: '' }
})
defineEmits(['action'])
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
}
.empty-state__illustration {
  color: var(--color-ink-100, #c8d3e0);
  margin-bottom: 16px;
  opacity: 0.7;
}
.empty-state__title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-ink-300, #7a8ba3);
  margin: 0 0 4px;
}
.empty-state__desc {
  font-size: 13px;
  color: var(--color-ink-300, #7a8ba3);
  margin: 0 0 16px;
  max-width: 240px;
  line-height: 1.5;
}
.empty-state__action {
  padding: 6px 16px;
  font-size: 13px;
  color: var(--color-ink-700, #1e3a5f);
  background: color-mix(in srgb, var(--color-ink-700, #1e3a5f) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-ink-700, #1e3a5f) 20%, transparent);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.empty-state__action:hover {
  background: color-mix(in srgb, var(--color-ink-700, #1e3a5f) 15%, transparent);
  border-color: var(--color-ink-700, #1e3a5f);
}
</style>
