<script setup>
defineProps({
  type: {
    type: String,
    default: 'empty' // empty / loading / error
  },
  title: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  }
})
</script>

<template>
  <div class="empty-state" :class="type">
    <div class="state-icon">
      <span v-if="type === 'empty'">📭</span>
      <span v-else-if="type === 'loading'">⏳</span>
      <span v-else-if="type === 'error'">⚠️</span>
    </div>
    <div v-if="title" class="state-title">{{ title }}</div>
    <div v-if="description" class="state-desc">{{ description }}</div>
    <slot />
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--color-fg-secondary);
}

.state-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-state.loading .state-icon {
  animation: spin 1.5s linear infinite;
}

.state-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-fg-primary);
  margin-bottom: 8px;
}

.state-desc {
  font-size: 14px;
  color: var(--color-fg-tertiary);
  max-width: 400px;
  line-height: 1.6;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
