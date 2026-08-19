<script setup>
// ============================================================
// DerivationView.vue — AI 白板推导（B2 v1.0 · 步进播放器）
// ============================================================
// 功能：
//   1. 选择/输入薄弱知识点发起推导（一次性 JSON）
//   2. 步进播放器：前进/后退/重播/进度/自动播放
//   3. 每步公式与图件经 B1 渲染管线（MarkdownRenderer）
//   4. 推导历史可回放
// ============================================================

import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useDerivationStore } from '@/stores/derivation'
import { useMasteryData } from '@/composables/useMasteryData'
import { useProfileStore } from '@/stores/profile'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'

const router = useRouter()
const store = useDerivationStore()
const mastery = useMasteryData()
const profileStore = useProfileStore()

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
  const weak = mastery.weakPoints.value || []
  const weakNames = weak.map(w => w.name || w.topic || w).filter(Boolean)
  const all = [...new Set([...weakNames, ...KNOWLEDGE_PRESETS])]
  return all
})

const activeKP = computed(() => selectedKP.value || customKP.value.trim())

// ---- 档位（从 profile store 获取）----
const tier = computed(() => profileStore.studentMasteryLevel || 'intermediate')

// ---- 推导控制 ----
async function startDerivation() {
  if (!activeKP.value || store.isLoading) return

  store.clearCurrent()
  abortController.value = new AbortController()

  try {
    await store.startDerivation(activeKP.value, {
      tier: tier.value,
      context: (mastery.weakPoints.value || []).map(w => w.name || w).join('、') || '',
      signal: abortController.value.signal,
    })
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

// ---- 步进播放器 ----
function nextStep() { store.nextStep() }
function prevStep() { store.prevStep() }
function gotoStep(idx) { store.gotoStep(idx) }
function replay() { store.replay() }
function togglePlay() {
  if (store.isPlaying) {
    store.stop()
  } else {
    store.play(6000)
  }
}

// ---- 推导完成态：跳转变式题（P2② 白板推导→变式推荐入口）----
const isDerivationComplete = computed(() =>
  store.currentSteps.length > 0 && store.currentIndex + 1 >= store.stepCount
)

function goVariant() {
  const kp = activeKP.value
  if (!kp) return
  router.push({ name: 'variant-practice', params: { topic: kp } })
}

// ---- 生命周期 ----
onMounted(async () => {
  await store.loadFromDB()
})

onBeforeUnmount(() => {
  if (abortController.value) {
    abortController.value.abort()
  }
  store.stop()
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
            :disabled="!activeKP || store.isLoading"
            @click="startDerivation"
          >
            {{ store.isLoading ? '推导中...' : '开始推导' }}
          </button>
          <button
            v-if="store.isLoading"
            class="btn-secondary"
            @click="cancelDerivation"
          >
            取消
          </button>
          <button
            v-if="store.hasHistory && !store.isLoading"
            class="btn-ghost"
            @click="showHistory = !showHistory"
          >
            {{ showHistory ? '收起历史' : '推导历史' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="store.loadingError" class="error-banner">
      <span>推导出错：{{ store.loadingError }}</span>
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

    <!-- 步进播放器 -->
    <div v-if="store.currentSteps.length > 0 && !store.isLoading" class="player-container">
      <!-- 进度条 -->
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: (store.progress * 100) + '%' }"></div>
      </div>

      <!-- 步骤指示器 -->
      <div class="step-indicators">
        <button
          v-for="(step, idx) in store.currentSteps"
          :key="idx"
          class="step-dot"
          :class="{
            active: idx === store.currentIndex,
            done: idx < store.currentIndex,
          }"
          @click="gotoStep(idx)"
          :title="step.title"
        >
          {{ idx + 1 }}
        </button>
      </div>

      <!-- 当前步骤内容 -->
      <div class="step-display">
        <div class="step-header">
          <span class="step-badge">第 {{ store.currentIndex + 1 }} 步 / 共 {{ store.stepCount }} 步</span>
          <h3 class="step-title">{{ store.currentStep?.title }}</h3>
        </div>

        <div class="step-content">
          <MarkdownRenderer :content="store.currentStepMarkdown" />
        </div>
      </div>

      <!-- 播放控制 -->
      <div class="player-controls">
        <button
          class="ctrl-btn"
          :disabled="!store.canPrev"
          @click="prevStep"
          title="上一步"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
        </button>

        <button
          class="ctrl-btn ctrl-play"
          @click="togglePlay"
          :title="store.isPlaying ? '暂停' : '自动播放'"
        >
          <svg v-if="!store.isPlaying" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <svg v-else viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        </button>

        <button
          class="ctrl-btn"
          :disabled="!store.canNext"
          @click="nextStep"
          title="下一步"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
        </button>

        <button
          class="ctrl-btn ctrl-replay"
          @click="replay"
          title="重播"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
      </div>

      <!-- 推导完成：变式推荐入口（P2②）-->
      <div v-if="isDerivationComplete" class="variant-cta">
        <div class="variant-cta-text">
          <span class="variant-cta-title">推导完成 🎉</span>
          <span class="variant-cta-desc">做一道变式题巩固刚学的「{{ activeKP }}」</span>
        </div>
        <button class="btn-variant" @click="goVariant">
          去做变式题
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="store.isLoading" class="loading-state">
      <div class="loading-dots">
        <span></span><span></span><span></span>
      </div>
      <p>正在生成推导步骤...</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="store.currentSteps.length === 0 && !store.loadingError" class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13l4 0 2.5 6L15 5h5"/></svg>
      </div>
      <p>选择一个知识点开始 AI 逐步推导</p>
      <p class="empty-hint">推导过程将分步呈现，公式自动渲染，支持前进/后退/重播</p>
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

/* ==== 步进播放器 ==== */
.player-container {
  background: var(--bg-surface);
  border-radius: 12px;
  padding: 24px;
}

/* 进度条 */
.progress-bar {
  width: 100%;
  height: 4px;
  background: var(--border-subtle);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 16px;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 2px;
  transition: width 0.3s ease;
}

/* 步骤指示器 */
.step-indicators {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.step-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--border-subtle);
  background: transparent;
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-dot:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.step-dot.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.step-dot.done {
  background: var(--bg-elevated);
  color: var(--primary);
  border-color: var(--primary);
}

/* 当前步骤内容 */
.step-display {
  min-height: 300px;
}

.step-header {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.step-badge {
  display: inline-block;
  font-size: 0.75rem;
  color: var(--primary);
  background: rgba(0, 212, 170, 0.08);
  padding: 2px 10px;
  border-radius: 12px;
  margin-bottom: 8px;
}

.step-title {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.step-content {
  font-size: 0.9rem;
  line-height: 1.75;
  color: var(--text-secondary);
}

.step-content :deep(.markdown-renderer) {
  font-size: 0.9rem;
}

/* 播放控制 */
.player-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
}

.ctrl-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ctrl-btn:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}

.ctrl-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ctrl-play {
  width: 48px;
  height: 48px;
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.ctrl-play:hover {
  opacity: 0.9;
}

.ctrl-replay {
  width: 36px;
  height: 36px;
}

/* 加载状态 */
.loading-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}

.loading-dots {
  display: flex;
  justify-content: center;
  gap: 4px;
  margin-bottom: 12px;
}

.loading-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
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

/* 空状态 */
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

/* 变式推荐 CTA（P2②）*/
.variant-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 20px;
  padding: 16px 20px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(0, 212, 170, 0.12), rgba(0, 212, 170, 0.04));
  border: 1px solid rgba(0, 212, 170, 0.35);
}

.variant-cta-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.variant-cta-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.variant-cta-desc {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.btn-variant {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: 8px;
  border: none;
  background: var(--primary);
  color: #fff;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.2s;
  white-space: nowrap;
}

.btn-variant:hover {
  opacity: 0.92;
  transform: translateX(2px);
}

/* 深色主题：已通过主题变量自动适配，无需额外覆盖 */
</style>
