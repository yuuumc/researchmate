<script setup>
// ============================================================
// 旗舰旅程步骤条（P0 #8）
// 三步级联进度可视化：诊断 → 规划 → 科研
// 状态：pending / running / done / error / skipped
// ============================================================
import { computed } from 'vue'
import { useJourneyStore } from '@/stores/journey'

const journeyStore = useJourneyStore()
const steps = computed(() => journeyStore.stepList)

const STATUS_LABEL = {
  pending: '待开始',
  running: '进行中',
  done: '已完成',
  error: '失败',
  skipped: '已跳过'
}
</script>

<template>
  <div class="journey-flow" role="list" aria-label="旗舰旅程进度">
    <template v-for="(step, i) in steps" :key="step.key">
      <div class="jf-node" :class="`jf-node--${step.status}`" role="listitem">
        <div
          class="jf-circle"
          :style="step.status === 'done' ? { background: step.color, borderColor: step.color } : step.status === 'running' ? { borderColor: step.color, color: step.color } : {}"
        >
          <span v-if="step.status === 'done'" class="jf-check">✓</span>
          <span v-else-if="step.status === 'running'" class="jf-spinner" :style="{ borderTopColor: step.color }"></span>
          <span v-else-if="step.status === 'error'" class="jf-error-icon">!</span>
          <span v-else-if="step.status === 'skipped'" class="jf-skip-icon">—</span>
          <span v-else class="jf-num">{{ i + 1 }}</span>
        </div>
        <div class="jf-label">
          <span class="jf-title">{{ step.title }}</span>
          <span class="jf-status" :class="`jf-status--${step.status}`">{{ STATUS_LABEL[step.status] }}</span>
        </div>
      </div>
      <div
        v-if="i < steps.length - 1"
        class="jf-connector"
        :class="{ 'jf-connector--done': ['done', 'skipped'].includes(step.status) }"
      ></div>
    </template>
  </div>
</template>

<style scoped>
.journey-flow {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
  padding: 20px 16px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
}

.jf-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 88px;
}

.jf-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid var(--color-border-default);
  background: var(--color-bg-sunken);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 700;
  color: var(--color-fg-tertiary);
  transition: all 0.3s ease;
}

.jf-node--done .jf-circle {
  color: #fff;
}

.jf-node--running .jf-circle {
  background: var(--color-bg-elevated);
  box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 12%, transparent);
}

.jf-node--error .jf-circle {
  border-color: #ff6b6b;
  background: color-mix(in srgb, #ff6b6b 12%, transparent);
  color: #d9483f;
}

.jf-node--skipped .jf-circle {
  border-style: dashed;
  color: var(--color-fg-muted);
}

.jf-check { font-size: 17px; }
.jf-error-icon { font-weight: 700; }
.jf-skip-icon { font-weight: 700; }

.jf-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border-subtle);
  border-top-color: #4d9de0;
  border-radius: 50%;
  animation: jf-spin 0.8s linear infinite;
}

@keyframes jf-spin {
  to { transform: rotate(360deg); }
}

.jf-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.jf-title {
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink-900);
}

.jf-node--pending .jf-title { color: var(--color-fg-tertiary); }

.jf-status {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-muted);
}

.jf-status--running { color: #4d9de0; }
.jf-status--done { color: #00a07d; }
.jf-status--error { color: #d9483f; }

.jf-connector {
  flex: 1;
  max-width: 72px;
  height: 2px;
  margin-top: 19px;
  background: var(--color-border-subtle);
  border-radius: var(--radius-full);
  transition: background 0.3s ease;
}

.jf-connector--done {
  background: linear-gradient(90deg, #00d4aa, #4d9de0);
}

@media (max-width: 640px) {
  .journey-flow { padding: 16px 8px; }
  .jf-node { min-width: 72px; }
  .jf-circle { width: 34px; height: 34px; font-size: 13px; }
  .jf-title { font-size: 11px; }
  .jf-connector { max-width: 36px; margin-top: 16px; }
}
</style>
