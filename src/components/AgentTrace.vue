<script setup>
import { computed } from 'vue'
import { useTraceStore } from '@/stores/trace'

const props = defineProps({
  // 是否展开（默认展开）
  expanded: {
    type: Boolean,
    default: true
  },
  // 是否允许折叠
  collapsible: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['toggle'])

const traceStore = useTraceStore()

// 步骤列表
const steps = computed(() => traceStore.traces)

// 是否有数据
const visible = computed(() => traceStore.hasTraces)

// 意图标签（从第一个 router trace 取）
const intentLabel = computed(() => {
  const routerStep = steps.value.find(s => s.step === 'router')
  return routerStep?.detail || ''
})

// 格式化耗时
function fmtDuration(ms) {
  if (ms == null) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// 格式化总耗时
const totalLabel = computed(() => {
  const total = traceStore.totalDuration
  if (total === 0) return ''
  return fmtDuration(total)
})

// 步骤状态图标
function statusIcon(status) {
  if (status === 'done') return '✓'
  if (status === 'error') return '✕'
  return ''
}

// 步骤状态类
function statusClass(status) {
  return `is-${status}`
}

function handleToggle() {
  if (props.collapsible) {
    emit('toggle', !props.expanded)
  }
}
</script>

<template>
  <transition name="trace-slide">
    <div v-if="visible" class="agent-trace" :class="{ collapsed: !expanded }">
      <!-- 头部 -->
      <div class="trace-header" @click="handleToggle">
        <div class="header-left">
          <span class="header-dot" :class="{ running: traceStore.running }"></span>
          <span class="header-title">Agent Trace</span>
          <span v-if="intentLabel" class="header-intent">{{ intentLabel }}</span>
        </div>
        <div class="header-right">
          <span v-if="totalLabel" class="header-duration">{{ totalLabel }}</span>
          <span v-if="collapsible" class="header-chevron" :class="{ rotated: !expanded }">›</span>
        </div>
      </div>

      <!-- 时间线 -->
      <transition name="trace-body">
        <div v-show="expanded" class="trace-body">
          <div class="timeline">
            <div
              v-for="(step, i) in steps"
              :key="step.id"
              class="step"
              :class="[statusClass(step.status), { last: i === steps.length - 1 }]"
              :style="{ '--step-color': step.color, '--step-delay': `${i * 0.08}s` }"
            >
              <!-- 节点 -->
              <div class="step-node">
                <span class="node-icon">{{ step.icon }}</span>
                <span v-if="step.status === 'running'" class="node-pulse"></span>
                <span v-else-if="step.status === 'done'" class="node-check">✓</span>
                <span v-else-if="step.status === 'error'" class="node-error">✕</span>
              </div>

              <!-- 连线 -->
              <div v-if="i < steps.length - 1" class="step-line"></div>

              <!-- 内容 -->
              <div class="step-content">
                <div class="step-head">
                  <span class="step-label">{{ step.label }}</span>
                  <span class="step-en">{{ step.en }}</span>
                  <span v-if="step.duration != null" class="step-duration">
                    {{ fmtDuration(step.duration) }}
                  </span>
                  <span v-else-if="step.status === 'running'" class="step-duration running">
                    <span class="mini-spinner"></span>
                  </span>
                </div>
                <div v-if="step.detail" class="step-detail">{{ step.detail }}</div>
                <div v-if="step.error" class="step-error-text">{{ step.error }}</div>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </transition>
</template>

<style scoped>
.agent-trace {
  background: var(--color-bg-elevated, #ffffff);
  border: 1px solid var(--color-border-subtle, #e5e7eb);
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04));
  animation: trace-in 0.4s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)) both;
}

@keyframes trace-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* === 头部 === */
.trace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: linear-gradient(90deg, rgba(0, 212, 170, 0.04), transparent);
  border-bottom: 1px solid var(--color-border-subtle, #e5e7eb);
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.trace-header:hover {
  background: linear-gradient(90deg, rgba(0, 212, 170, 0.08), transparent);
}

.agent-trace.collapsed .trace-header {
  border-bottom: none;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.header-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-node-active, #00d4aa);
  box-shadow: 0 0 0 3px rgba(0, 212, 170, 0.2);
  flex-shrink: 0;
}

.header-dot.running {
  animation: dot-pulse 1.2s ease-in-out infinite;
}

@keyframes dot-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(0, 212, 170, 0.2); }
  50% { box-shadow: 0 0 0 6px rgba(0, 212, 170, 0.08); }
}

.header-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-ink-700, #1f2937);
  letter-spacing: 0.5px;
}

.header-intent {
  padding: 2px 8px;
  background: var(--color-bg-sunken, #f4f6fa);
  border-radius: var(--radius-full, 999px);
  font-size: 10px;
  color: var(--color-fg-secondary, #6b7280);
  font-weight: 500;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.header-duration {
  font-size: 10px;
  color: var(--color-fg-muted, #9ca3af);
  font-variant-numeric: tabular-nums;
}

.header-chevron {
  font-size: 14px;
  color: var(--color-fg-muted, #9ca3af);
  transition: transform 0.2s;
  line-height: 1;
}

.header-chevron.rotated {
  transform: rotate(90deg);
}

/* === 时间线 === */
.trace-body {
  padding: 12px 14px 14px;
}

.timeline {
  display: flex;
  flex-direction: column;
}

.step {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 10px;
  position: relative;
  animation: step-in 0.4s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)) both;
  animation-delay: var(--step-delay, 0s);
}

@keyframes step-in {
  from { opacity: 0; transform: translateX(-4px); }
  to { opacity: 1; transform: translateX(0); }
}

/* 节点 */
.step-node {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-bg-sunken, #f4f6fa);
  border: 1.5px solid var(--step-color, #7a8ba3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  z-index: 1;
  transition: all 0.3s;
}

.node-icon {
  font-family: var(--font-serif, Georgia, serif);
  font-size: 11px;
  font-weight: 700;
  color: var(--step-color, #7a8ba3);
  transition: opacity 0.2s;
}

.step.is-running .node-icon,
.step.is-done .node-icon,
.step.is-error .node-icon {
  opacity: 0;
}

.step.is-done .step-node {
  background: var(--step-color, #00d4aa);
  border-color: var(--step-color, #00d4aa);
}

.node-check {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  animation: check-pop 0.3s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)) both;
}

@keyframes check-pop {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}

.step.is-error .step-node {
  background: var(--color-error, #ff6b6b);
  border-color: var(--color-error, #ff6b6b);
}

.node-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  animation: check-pop 0.3s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)) both;
}

.step.is-running .step-node {
  border-color: var(--step-color, #00d4aa);
  border-style: dashed;
}

.node-pulse {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 2px solid var(--step-color, #00d4aa);
  animation: node-pulse 1.5s ease-out infinite;
}

@keyframes node-pulse {
  0% { transform: scale(0.9); opacity: 0.8; }
  100% { transform: scale(1.6); opacity: 0; }
}

/* 连线 */
.step-line {
  position: absolute;
  left: 13px;
  top: 28px;
  width: 1px;
  height: calc(100% + 4px);
  background: linear-gradient(to bottom, var(--step-color, #e5e7eb), var(--color-border-subtle, #e5e7eb));
  opacity: 0.4;
  z-index: 0;
}

.step.last .step-line {
  display: none;
}

/* 内容 */
.step-content {
  padding-top: 4px;
  padding-bottom: 12px;
  min-width: 0;
}

.step.last .step-content {
  padding-bottom: 0;
}

.step-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.step-label {
  font-family: var(--font-serif, Georgia, serif);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink-900, #111827);
}

.step-en {
  font-size: 9px;
  color: var(--color-fg-tertiary, #9ca3af);
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 1px 6px;
  background: var(--color-bg-sunken, #f4f6fa);
  border-radius: var(--radius-sm, 4px);
}

.step-duration {
  font-size: 10px;
  color: var(--color-fg-muted, #9ca3af);
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}

.step-duration.running {
  display: inline-flex;
  align-items: center;
}

.mini-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1.5px solid var(--color-border-subtle, #e5e7eb);
  border-top-color: var(--step-color, #00d4aa);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.step-detail {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-fg-secondary, #6b7280);
  line-height: 1.5;
  font-family: var(--font-mono, monospace);
}

.step.is-done .step-detail {
  color: var(--color-ink-700, #374151);
}

.step-error-text {
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-error, #ff6b6b);
  font-style: italic;
}

/* === 过渡 === */
.trace-slide-enter-active,
.trace-slide-leave-active {
  transition: all 0.3s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

.trace-slide-enter-from,
.trace-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.trace-body-enter-active,
.trace-body-leave-active {
  transition: all 0.25s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  overflow: hidden;
}

.trace-body-enter-from,
.trace-body-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

/* === 响应式 === */
@media (max-width: 768px) {
  .step {
    grid-template-columns: 24px 1fr;
    gap: 8px;
  }
  .step-node {
    width: 24px;
    height: 24px;
  }
  .step-line {
    left: 11px;
    top: 24px;
  }
  .header-intent {
    max-width: 120px;
  }
}
</style>
