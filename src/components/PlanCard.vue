<script setup>
defineProps({
  plan: {
    type: Object,
    default: () => ({})
  }
})
</script>

<template>
  <div class="plan-card">
    <!-- 顶部信息 -->
    <div v-if="plan.goal || plan.total_weeks" class="plan-header">
      <div v-if="plan.goal" class="goal-block">
        <div class="goal-label">GOAL</div>
        <div class="goal-text">{{ plan.goal }}</div>
      </div>
      <div v-if="plan.total_weeks" class="weeks-block">
        <div class="weeks-num">{{ plan.total_weeks }}</div>
        <div class="weeks-unit">周</div>
      </div>
    </div>

    <!-- 周计划列表 -->
    <div v-if="plan.weeks?.length" class="weeks-track">
      <div
        v-for="(week, idx) in plan.weeks"
        :key="idx"
        class="week-item"
        :class="{ current: week.current, done: week.status === 'done' }"
      >
        <div class="week-node">
          <span class="week-num">W{{ week.week || idx + 1 }}</span>
        </div>
        <div class="week-content">
          <div class="week-header">
            <span class="week-title">{{ week.theme || week.title || `第 ${week.week || idx + 1} 周` }}</span>
            <span v-if="week.current" class="week-tag current">本周</span>
            <span v-else-if="week.status === 'done'" class="week-tag done">已完成</span>
          </div>
          <div v-if="week.tasks?.length" class="week-tasks">
            <div
              v-for="(task, ti) in week.tasks"
              :key="ti"
              class="task-item"
              :class="{ done: task.done }"
            >
              <span class="task-check">{{ task.done ? '✓' : '○' }}</span>
              <span class="task-text">{{ typeof task === 'string' ? task : task.text || task.name }}</span>
            </div>
          </div>
          <div v-if="week.focus" class="week-focus">
            <span class="focus-label">聚焦</span>
            <span class="focus-text">{{ week.focus }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 备注说明 -->
    <div v-if="plan.note" class="plan-note">
      <span class="note-icon">ⓘ</span>
      <span class="note-text">{{ plan.note }}</span>
    </div>
  </div>
</template>

<style scoped>
.plan-card {
  background: var(--color-bg-sunken);
  border-radius: var(--radius-lg);
  padding: 20px;
}

/* === 顶部 === */
.plan-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border-subtle);
  margin-bottom: 20px;
  gap: 16px;
}

.goal-block {
  flex: 1;
}

.goal-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-tertiary);
  letter-spacing: 1.5px;
  margin-bottom: 6px;
}

.goal-text {
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 600;
  color: var(--color-ink-900);
  line-height: 1.5;
}

.weeks-block {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 6px 14px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
}

.weeks-num {
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 700;
  color: var(--color-ink-900);
  line-height: 1;
}

.weeks-unit {
  font-size: 12px;
  color: var(--color-fg-secondary);
}

/* === 周时间轴 === */
.weeks-track {
  position: relative;
  padding-left: 4px;
}

.week-item {
  display: flex;
  gap: 14px;
  padding-bottom: 18px;
  position: relative;
}

.week-item:last-child {
  padding-bottom: 0;
}

.week-item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 22px;
  top: 36px;
  bottom: 0;
  width: 2px;
  background: linear-gradient(180deg, var(--color-border-default) 0%, transparent 100%);
}

.week-node {
  width: 44px;
  height: 32px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-ink-700);
  position: relative;
  z-index: 1;
}

.week-item.current .week-node {
  background: var(--color-node-active);
  border-color: var(--color-node-active);
  color: var(--color-fg-inverse);
  box-shadow: 0 0 0 4px rgba(0, 212, 170, 0.2);
}

.week-item.done .week-node {
  background: var(--color-bg-sunken);
  border-color: var(--color-border-subtle);
  color: var(--color-fg-muted);
  text-decoration: line-through;
}

.week-content {
  flex: 1;
  padding-top: 4px;
}

.week-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.week-title {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-900);
}

.week-tag {
  padding: 1px 8px;
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.week-tag.current {
  background: var(--color-success-bg);
  color: var(--color-success);
  border: 1px solid color-mix(in srgb, var(--color-success) 30%, transparent);
}

.week-tag.done {
  background: var(--color-bg-sunken);
  color: var(--color-fg-tertiary);
}

.week-tasks {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--color-ink-700);
  line-height: 1.6;
}

.task-check {
  font-family: var(--font-mono);
  color: var(--color-fg-tertiary);
  flex-shrink: 0;
  width: 14px;
}

.task-item.done .task-check {
  color: var(--color-success);
  font-weight: 700;
}

.task-item.done .task-text {
  color: var(--color-fg-tertiary);
  text-decoration: line-through;
}

.week-focus {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--color-bg-elevated);
  border-radius: var(--radius-sm);
  border-left: 2px solid var(--color-node-warn);
  font-size: 11px;
}

.focus-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-node-warn);
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.focus-text {
  color: var(--color-ink-700);
}

/* === 备注 === */
.plan-note {
  margin-top: 16px;
  padding: 10px 12px;
  background: var(--color-info-bg);
  border-radius: var(--radius-md);
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--color-ink-700);
}

.note-icon {
  color: var(--color-info);
  flex-shrink: 0;
}
</style>
