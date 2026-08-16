<script setup>
import { computed } from 'vue'
import { buildStageTimeline } from '@/utils/stagePlanner'

// Bug5 方案 A·四阶段视图组件
// 全周期四阶段（基础巩固→专题强化→真题冲刺→模拟模考）+ 当前阶段高亮
// 未来阶段仅占位（名称+里程碑+进入条件，不排周任务）— GWT #4
const props = defineProps({
  currentStage: { type: String, default: 'foundation' },
  completedCycles: { type: Number, default: 0 }
})

const stages = computed(() => buildStageTimeline(props.currentStage))
</script>

<template>
  <section class="stage-timeline">
    <div class="st-header">
      <span class="st-title">全周期阶段</span>
      <span class="st-en">Full-Cycle Stages</span>
      <span v-if="completedCycles > 0" class="st-cycles">已完成 {{ completedCycles }} 个冲刺周期</span>
    </div>
    <div class="st-track">
      <div
        v-for="(s, i) in stages"
        :key="s.id"
        class="st-stage"
        :class="['st-' + s.status]"
      >
        <div class="st-node">
          <span v-if="s.status === 'done'" class="st-check">✓</span>
          <span v-else class="st-num">{{ i + 1 }}</span>
        </div>
        <div class="st-body">
          <div class="st-name">{{ s.name }}</div>
          <div class="st-en-small">{{ s.en }}</div>
          <!-- 当前阶段：高亮 + 里程碑（近期冲刺计划在下方 PlanCard 展开） -->
          <template v-if="s.status === 'active'">
            <div class="st-badge">当前阶段</div>
            <div class="st-milestone">{{ s.milestone }}</div>
          </template>
          <!-- 未来阶段：仅占位，不排周任务（GWT #4 远期不锁死） -->
          <template v-else-if="s.status === 'upcoming'">
            <div class="st-milestone st-dim">{{ s.milestone }}</div>
            <div class="st-entry">进入条件：{{ s.entry }}</div>
          </template>
          <!-- 已完成阶段 -->
          <template v-else>
            <div class="st-milestone st-dim">{{ s.milestone }}</div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.stage-timeline {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: 20px 22px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-sm);
  animation: float-up 0.5s var(--ease-out) both;
}

.st-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.st-title {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-ink-900);
}

.st-en {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-tertiary);
  letter-spacing: 1px;
  text-transform: uppercase;
}

.st-cycles {
  margin-left: auto;
  padding: 2px 10px;
  background: color-mix(in srgb, var(--color-node-active) 12%, transparent);
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-node-active);
}

.st-track {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.st-stage {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
}

/* 阶段间连接线 */
.st-stage:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 16px;
  right: -6px;
  width: 12px;
  height: 2px;
  background: var(--color-border-default);
}

.st-stage.st-done:not(:last-child)::after {
  background: var(--color-node-active);
}

.st-node {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-bg-sunken);
  border: 1px solid var(--color-border-default);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--color-fg-tertiary);
  flex-shrink: 0;
}

.st-stage.st-done .st-node {
  background: var(--color-node-active);
  border-color: var(--color-node-active);
  color: var(--color-fg-inverse);
}

.st-stage.st-active .st-node {
  background: var(--color-node-active);
  border-color: var(--color-node-active);
  color: var(--color-fg-inverse);
  box-shadow: 0 0 0 4px rgba(0, 212, 170, 0.2);
}

.st-check { font-size: 14px; }

.st-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.st-name {
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink-900);
}

.st-stage.st-upcoming .st-name { color: var(--color-fg-secondary); }

.st-en-small {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-tertiary);
  letter-spacing: 0.5px;
}

.st-badge {
  display: inline-block;
  width: fit-content;
  padding: 1px 8px;
  border-radius: var(--radius-full);
  background: var(--color-success-bg);
  color: var(--color-success);
  border: 1px solid color-mix(in srgb, var(--color-success) 30%, transparent);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  margin: 2px 0;
}

.st-milestone {
  font-size: 11px;
  color: var(--color-ink-700);
  line-height: 1.5;
}

.st-milestone.st-dim { color: var(--color-fg-tertiary); }

.st-entry {
  font-size: 10px;
  color: var(--color-fg-tertiary);
  font-style: italic;
}

/* === 移动端响应式 === */
@media (max-width: 768px) {
  .stage-timeline { padding: 16px; }
  .st-track {
    flex-direction: column;
    gap: 14px;
  }
  .st-stage {
    flex-direction: row;
    align-items: flex-start;
    gap: 12px;
  }
  .st-stage:not(:last-child)::after {
    top: auto;
    right: auto;
    left: 15px;
    bottom: -10px;
    width: 2px;
    height: 10px;
  }
  .st-body { flex: 1; }
}

@media (max-width: 375px) {
  .stage-timeline { padding: 14px 12px; }
  .st-node { width: 28px; height: 28px; font-size: 11px; }
  .st-name { font-size: 12px; }
  .st-milestone { font-size: 10px; }
}
</style>
