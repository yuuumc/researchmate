<script setup>
import { computed } from 'vue'
import { usePlanStore } from '@/stores/plan'
import KnowledgeGraph from '@/components/KnowledgeGraph.vue'
import PlanCard from '@/components/PlanCard.vue'

const planStore = usePlanStore()
const plan = computed(() => planStore.plan)
const versions = computed(() => planStore.versions || [])

// 把 ISO 时间渲染为"距今 N 天"，避免依赖 dayjs
function timeAgo(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return '刚刚'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 1) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 周前`
  if (days < 365) return `${Math.floor(days / 30)} 月前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

// 调整条目数（keep + strengthen + drop）
function adjustmentCount(v) {
  if (!v || !v.adjustments) return 0
  const a = v.adjustments
  return (Array.isArray(a.keep) ? a.keep.length : 0)
    + (Array.isArray(a.strengthen) ? a.strengthen.length : 0)
    + (Array.isArray(a.drop) ? a.drop.length : 0)
}
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
            <span class="vb-time">{{ timeAgo(v.created_at) }}</span>
            <span v-if="adjustmentCount(v) > 0" class="vb-trigger">已调整 {{ adjustmentCount(v) }} 项</span>
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

/* === 移动端响应式 === */
@media (max-width: 768px) {
  .plan-content { padding: 24px 16px 48px; }
  .page-title { font-size: 26px; }
  .page-subtitle { font-size: 12px; }
  .version-bar { padding: 16px; }
  .vb-track { gap: 6px; }
  .vb-node { padding: 5px 10px; font-size: 10px; }
  .vb-node:not(:last-child)::after { right: -8px; font-size: 10px; }
  .empty-state { padding: 48px 16px; }
  .empty-icon { font-size: 28px; }
}

@media (max-width: 375px) {
  .plan-content { padding: 20px 12px 40px; }
  .page-title { font-size: 22px; }
  .vb-title { flex-direction: column; align-items: flex-start; gap: 4px; }
}
</style>
