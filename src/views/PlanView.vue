<script setup>
import { computed } from 'vue'
import { usePlanStore } from '@/stores/plan'
import KnowledgeGraph from '@/components/KnowledgeGraph.vue'
import PlanCard from '@/components/PlanCard.vue'

const planStore = usePlanStore()
const plan = computed(() => planStore.plan)
const versions = computed(() => planStore.versions || [])
</script>

<template>
  <div class="plan-view">
    <KnowledgeGraph :node-count="14" :flow-dots="true" />

    <div class="plan-content">
      <div class="page-header">
        <div class="page-eyebrow">
          <span class="dot"></span>
          <span>Dynamic Plan</span>
        </div>
        <h1 class="page-title">成长规划</h1>
        <p class="page-subtitle">38 天风险重排 · plan_version 演进 · 诊断触发自动调整</p>
      </div>

      <!-- 版本演进条 -->
      <section v-if="versions.length > 1" class="version-bar">
        <div class="vb-title">
          <span class="vb-text">Plan Version</span>
          <span class="vb-en">{{ versions.length }} 个版本</span>
        </div>
        <div class="vb-track">
          <div
            v-for="(v, i) in versions"
            :key="i"
            class="vb-node"
            :class="{ current: i === versions.length - 1 }"
          >
            <span class="vb-num">v{{ v.version || i + 1 }}</span>
            <span class="vb-time">{{ v.time }}</span>
            <span v-if="v.trigger" class="vb-trigger">{{ v.trigger }}</span>
          </div>
        </div>
      </section>

      <!-- 当前计划 -->
      <section v-if="plan" class="plan-section">
        <div class="section-header">
          <h2 class="section-title">当前计划</h2>
          <span class="section-en">Current Plan</span>
        </div>
        <PlanCard :plan="plan" />
      </section>

      <!-- 空态 -->
      <section v-else class="empty-state">
        <div class="empty-icon">◯</div>
        <div class="empty-title">还没有生成计划</div>
        <div class="empty-desc">去对话中输入「帮我做复习计划」触发规划 Agent</div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.plan-view {
  position: relative;
  min-height: calc(100vh - 72px);
  overflow: hidden;
}

.plan-content {
  position: relative;
  z-index: var(--z-base);
  max-width: 880px;
  margin: 0 auto;
  padding: 40px 32px 64px;
}

/* === 页头 === */
.page-header {
  margin-bottom: 32px;
}

.page-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-ink-500);
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-node-warn);
  box-shadow: 0 0 0 3px rgba(255, 209, 102, 0.25);
}

.page-title {
  font-family: var(--font-serif);
  font-size: 32px;
  font-weight: 700;
  color: var(--color-ink-900);
  margin: 0 0 8px;
  letter-spacing: 1px;
}

.page-subtitle {
  font-size: 13px;
  color: var(--color-fg-secondary);
  margin: 0;
}

/* === 版本演进 === */
.version-bar {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: 20px 22px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-sm);
  animation: float-up 0.5s var(--ease-out) both;
}

.vb-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 16px;
}

.vb-text {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-ink-900);
}

.vb-en {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-tertiary);
}

.vb-track {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.vb-node {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--color-bg-sunken);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  font-size: 11px;
  position: relative;
}

.vb-node:not(:last-child)::after {
  content: '→';
  position: absolute;
  right: -10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-fg-muted);
  font-family: var(--font-mono);
}

.vb-node.current {
  background: var(--color-warning-bg);
  border-color: var(--color-node-warn);
  box-shadow: 0 0 0 3px rgba(255, 209, 102, 0.2);
}

.vb-num {
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--color-ink-900);
}

.vb-node.current .vb-num {
  color: var(--color-node-warn);
}

.vb-time {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-tertiary);
}

.vb-trigger {
  padding: 1px 6px;
  background: var(--color-bg-elevated);
  border-radius: var(--radius-xs);
  font-size: 10px;
  color: var(--color-fg-secondary);
}

/* === 计划区 === */
.section-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}

.section-title {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
  color: var(--color-ink-900);
  margin: 0;
}

.section-en {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-tertiary);
  letter-spacing: 1px;
  text-transform: uppercase;
}

/* === 空态 === */
.empty-state {
  text-align: center;
  padding: 64px 24px;
  background: var(--color-bg-elevated);
  border: 1px dashed var(--color-border-default);
  border-radius: var(--radius-lg);
}

.empty-icon {
  font-size: 36px;
  color: var(--color-fg-muted);
  margin-bottom: 12px;
}

.empty-title {
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 600;
  color: var(--color-ink-700);
  margin-bottom: 6px;
}

.empty-desc {
  font-size: 12px;
  color: var(--color-fg-tertiary);
}
</style>
