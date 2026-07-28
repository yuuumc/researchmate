<script setup>
import { computed } from 'vue'
import { useDiagnosisStore } from '@/stores/diagnosis'
import KnowledgeGraph from '@/components/KnowledgeGraph.vue'
import DiagnosisReport from '@/components/DiagnosisReport.vue'

const diagStore = useDiagnosisStore()
const history = computed(() => diagStore.history)
</script>

<template>
  <div class="history-view">
    <KnowledgeGraph :node-count="12" :flow-dots="true" />

    <div class="history-content">
      <div class="page-header">
        <div class="page-eyebrow">
          <span class="dot"></span>
          <span>Diagnosis History</span>
        </div>
        <h1 class="page-title">诊断轨迹</h1>
        <p class="page-subtitle">每次错题 → 4 层根因链 · 5 轮对比 · 画像自动更新</p>
      </div>

      <div v-if="history.length === 0" class="empty-state">
        <div class="empty-icon">◯</div>
        <div class="empty-title">还没有诊断记录</div>
        <div class="empty-desc">去对话中输入「我 XX 科考了 XX 分，错题…」触发诊断 Agent</div>
      </div>

      <div v-else class="history-track">
        <div
          v-for="(item, idx) in history"
          :key="idx"
          class="history-item"
        >
          <div class="item-node">
            <span class="node-num">{{ history.length - idx }}</span>
          </div>
          <div class="item-content">
            <div class="item-header">
              <span class="item-time">{{ item.time }}</span>
              <span v-if="item.subject" class="item-subject">{{ item.subject }}</span>
              <span v-if="item.score != null" class="item-score">{{ item.score }} 分</span>
            </div>
            <DiagnosisReport :report="item" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-view {
  position: relative;
  min-height: calc(100vh - 72px);
  overflow: hidden;
}

.history-content {
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
  background: var(--color-node-info);
  box-shadow: 0 0 0 3px rgba(77, 157, 224, 0.2);
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

/* === 历史时间轴 === */
.history-track {
  position: relative;
  padding-left: 4px;
}

.history-item {
  display: flex;
  gap: 16px;
  padding-bottom: 24px;
  position: relative;
  animation: float-up 0.5s var(--ease-out) both;
}

.history-item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 17px;
  top: 36px;
  bottom: 0;
  width: 2px;
  background: linear-gradient(180deg, var(--color-node-info) 0%, transparent 100%);
  opacity: 0.4;
}

.item-node {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-bg-elevated);
  border: 2px solid var(--color-node-info);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
  box-shadow: 0 0 0 4px var(--color-bg-base);
}

.node-num {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--color-node-info);
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.item-time {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-tertiary);
}

.item-subject {
  padding: 2px 8px;
  background: var(--color-info-bg);
  color: var(--color-info);
  border-radius: var(--radius-full);
  font-family: var(--font-serif);
  font-size: 11px;
  font-weight: 600;
}

.item-score {
  margin-left: auto;
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 700;
  color: var(--color-ink-900);
}
</style>
