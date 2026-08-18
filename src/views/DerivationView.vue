<script setup>
// ============================================================
// DerivationView.vue — AI 白板推导（B2）
// ============================================================
// 功能：
//   1. 选择/输入薄弱知识点发起推导
//   2. 推导过程逐步流式呈现（时间线/卡片流）
//   3. 每步 LaTeX 公式经 MarkdownRenderer 渲染
//   4. 推导历史可回放
// ============================================================

import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useDerivationStore } from '@/stores/derivation'
import { useMasteryData } from '@/composables/useMasteryData'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'

const store = useDerivationStore()
const mastery = useMasteryData()

// ---- 状态 ----
const selectedKP = ref('')
const customKP = ref('')
const showHistory = ref(false)
const abortController = ref(null)

// ---- 知识点列表（来自 mastery + 预设白名单）----
const KNOWLEDGE_PRESETS = [
  '载流子统计', '载流子输运', 'PN结', 'MOS结构', 'MOSFET',
  '本征载流子浓度', '费米能级', '迁移率', '电导率',
  '内建电势', '耗尽层', '阈值电压', '跨导',
]

const knowledgePoints = computed(() => {
  // 从 mastery 获取薄弱知识点，合并预设
  const weak = mastery.weakPoints.value || []
  const weakNames = weak.map(w => w.name || w.topic || w).filter(Boolean)
  const all = [...new Set([...weakNames, ...KNOWLEDGE_PRESETS])]
  return all
})

const activeKP = computed(() => selectedKP.value || customKP.value.trim())

// ---- 推导控制 ----
async function startDerivation() {
  if (!activeKP.value || store.isStreaming) return

  store.clearCurrent()
  abortController.value = new AbortController()

  try {
    await store.startDerivation(
      activeKP.value,
      {},
      abortController.value.signal
    )
  } catch (e) {
    console.error('[DerivationView] derivation failed:', e)
  }
}

function cancelDerivation() {
  if (abortController.value) {
    abortController.value.abort()
  }
  store.cancelDerivation()
}

function loadHistory(item) {
  store.loadFromHistory(item)
  showHistory.value = false
}

async function deleteHistory(id) {
  await store.deleteHistory(id)
}

// ---- 生命周期 ----
onMounted(async () => {
  await store.loadFromDB()
})

onBeforeUnmount(() => {
  if (abortController.value) {
    abortController.value.abort()
  }
})
</script>

<template>
  <div class="derivation-view">
    <!-- 顶部：知识点选择 + 发起按钮 -->
    <div class="derivation-header">
      <h2 class="page-title">AI 白板推导</h2>
      <p class="page-desc">选择一个知识点，AI 将逐步推导核心公式与物理原理</p>

      <div class="kp-selector">
        <div class="kp-tags">
          <button
            v-for="kp in knowledgePoints"
            :key="kp"
            class="kp-tag"
            :class="{ active: selectedKP === kp }"
            @click="selectedKP = selectedKP === kp ? '' : kp; customKP = ''"
          >
            {{ kp }}
          </button>
        </div>

        <div class="kp-custom">
          <input
            v-model="customKP"
            type="text"
            placeholder="或输入其他知识点..."
            class="kp-input"
            @focus="selectedKP = ''"
          />
        </div>

        <div class="kp-actions">
          <button
            class="btn-primary"
            :disabled="!activeKP || store.isStreaming"
            @click="startDerivation"
          >
            {{ store.isStreaming ? '推导中...' : '开始推导' }}
          </button>
          <button
            v-if="store.isStreaming"
            class="btn-secondary"
            @click="cancelDerivation"
          >
            取消
          </button>
          <button
            v-if="store.hasHistory && !store.isStreaming"
            class="btn-ghost"
            @click="showHistory = !showHistory"
          >
            {{ showHistory ? '收起历史' : '推导历史' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="store.streamError" class="error-banner">
      <span>推导出错：{{ store.streamError }}</span>
      <button class="btn-retry" @click="startDerivation">重试</button>
    </div>

    <!-- 历史列表 -->
    <div v-if="showHistory && store.recentHistory.length > 0" class="history-list">
      <h3 class="history-title">推导历史</h3>
      <div
        v-for="item in store.recentHistory"
        :key="item.id || item.created_at"
        class="history-item"
      >
        <div class="history-item-info" @click="loadHistory(item)">
          <span class="history-kp">{{ item.knowledge_point }}</span>
          <span class="history-time">{{ new Date(item.created_at).toLocaleString('zh-CN') }}</span>
        </div>
        <button class="btn-delete" @click.stop="deleteHistory(item.id || item.created_at)">×</button>
      </div>
    </div>

    <!-- 推导步骤展示 -->
    <div v-if="store.currentSteps.length > 0 || store.isStreaming" class="derivation-board">
      <div class="board-header">
        <span class="board-kp">{{ store.currentKnowledgePoint }}</span>
        <span v-if="store.isStreaming" class="streaming-indicator">
          <span class="dot"></span>
          推导中 · 第 {{ store.stepCount }} 步
        </span>
        <span v-else class="step-count">{{ store.stepCount }} 步</span>
      </div>

      <div class="steps-timeline">
        <div
          v-for="(step, idx) in store.currentSteps"
          :key="idx"
          class="step-card"
          :class="{ streaming: store.isStreaming && idx === store.currentSteps.length - 1 }"
        >
          <div class="step-marker">
            <span class="step-number">{{ step.index }}</span>
            <div v-if="idx < store.currentSteps.length - 1" class="step-line"></div>
          </div>

          <div class="step-body">
            <h4 class="step-title">{{ step.title }}</h4>
            <div class="step-content">
              <MarkdownRenderer :content="step.content" />
            </div>
          </div>
        </div>

        <!-- 流式中的加载指示器 -->
        <div v-if="store.isStreaming" class="step-loading">
          <div class="loading-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!store.isStreaming" class="empty-state">
      <div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13l4 0 2.5 6L15 5h5"/></svg></div>
      <p>选择一个知识点开始 AI 逐步推导</p>
      <p class="empty-hint">推导过程将逐步呈现，公式自动渲染</p>
    </div>
  </div>
</template>

<style scoped>
.derivation-view {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 20px;
}

.derivation-header {
  margin-bottom: 32px;
}

.page-title {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.page-desc {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin: 0 0 20px;
}

.kp-selector {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.kp-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.kp-tag {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.kp-tag:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.kp-tag.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.kp-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s;
}

.kp-input:focus {
  border-color: var(--primary);
}

.kp-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.btn-primary {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  background: var(--primary);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 0.9rem;
  cursor: pointer;
}

.btn-ghost {
  padding: 10px 16px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.9rem;
  cursor: pointer;
}

.btn-ghost:hover {
  color: var(--primary);
}

.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-size: 0.85rem;
  margin-bottom: 20px;
}

.btn-retry {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid #ef4444;
  background: transparent;
  color: #ef4444;
  font-size: 0.85rem;
  cursor: pointer;
}

.history-list {
  margin-bottom: 24px;
}

.history-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--bg-surface);
  margin-bottom: 6px;
  transition: background 0.2s;
}

.history-item:hover {
  background: var(--bg-elevated);
}

.history-item-info {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  flex: 1;
}

.history-kp {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
}

.history-time {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.btn-delete {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-delete:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.derivation-board {
  background: var(--bg-surface);
  border-radius: 12px;
  padding: 24px;
}

.board-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.board-kp {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.streaming-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--primary);
}

.streaming-indicator .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.step-count {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.steps-timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.step-card {
  display: flex;
  gap: 16px;
  padding-bottom: 24px;
}

.step-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.step-number {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 600;
  flex-shrink: 0;
}

.step-line {
  width: 2px;
  flex: 1;
  background: var(--border-subtle);
  margin-top: 4px;
}

.step-body {
  flex: 1;
  min-width: 0;
}

.step-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 4px 0 10px;
}

.step-content {
  font-size: 0.9rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

.step-content :deep(.markdown-renderer) {
  font-size: 0.9rem;
}

.step-card.streaming .step-number {
  animation: pulse 1.5s infinite;
}

.step-loading {
  display: flex;
  justify-content: center;
  padding: 12px;
}

.loading-dots {
  display: flex;
  gap: 4px;
}

.loading-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: bounce 1.4s infinite;
}

.loading-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.loading-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-8px); opacity: 1; }
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 16px;
}

.empty-state p {
  margin: 4px 0;
  font-size: 0.9rem;
}

.empty-hint {
  font-size: 0.8rem !important;
  color: var(--text-muted);
}

/* 深色主题：已通过主题变量自动适配，无需额外覆盖 */
</style>
