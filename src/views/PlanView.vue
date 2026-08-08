<script setup>
import { computed, onMounted } from 'vue'
import { usePlanStore } from '@/stores/plan'
import { useProfileStore } from '@/stores/profile'
import { useDiagnosisStore } from '@/stores/diagnosis'
import { getDiagnosisResultForPlan, getKnowledgeStructure, isValidDiagnosisRecord } from '@/utils/diagnosisInput'
import KnowledgeGraph from '@/components/KnowledgeGraph.vue'
import PlanCard from '@/components/PlanCard.vue'
import AiGeneratedBadge from '@/components/AiGeneratedBadge.vue'
import { SEED_PLAN } from '@/data/seedDemo'

const planStore = usePlanStore()
const profileStore = useProfileStore()
const diagnosisStore = useDiagnosisStore()

// #9: 知识图谱标签
const knowledgeLabels = computed(() => getKnowledgeStructure().slice(0, 8))

const plan = computed(() => planStore.current)
const versions = computed(() => planStore.versions || [])
const loading = computed(() => planStore.loading)
const error = computed(() => planStore.error)
const progress = computed(() => planStore.progress)
const completionRate = computed(() => planStore.completionRate)

const seedPlan = SEED_PLAN
const hasApiPlan = computed(() => planStore.lastPlan !== null)

// P0 修复：区分「无诊断」和「空壳诊断记录」（score null/字段全空）
// 空壳记录不应显示「基于最近诊断（0分）生成」误导文案
const hasValidDiagnosis = computed(() => isValidDiagnosisRecord(diagnosisStore.latest))
const diagnosisScore = computed(() => {
  const s = diagnosisStore.latest?.score
  return typeof s === 'number' && !Number.isNaN(s) ? s : '—'
})

// W3-2: 页面加载时尝试从数据库恢复计划
onMounted(async () => {
  // P0 修复：先清理历史遗留的空计划版本，避免空白卡片残留
  planStore.pruneEmptyVersions()
  await planStore.fetchActivePlan()
})

// 生成个性化计划
async function generatePlan() {
  const profile = profileStore.profile || {}
  const diagnosisResult = getDiagnosisResultForPlan()

  try {
    await planStore.runPlan({
      student_name: profile.name || '',
      target_major: profile.target_major || profile.major || '',
      diagnosis_result: diagnosisResult,
      exam_date: profile.exam_date || '',
      weekly_hours: 15
    })
  } catch (e) {
    // 错误已写入 planStore.error，由模板展示错误提示 + 重试按钮
    console.warn('[plan] 生成失败:', e.message)
  }
}

// W3-2: 切换任务完成状态
function onToggleTask({ weekNum, taskIndex }) {
  planStore.toggleTask(weekNum, taskIndex)
}

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
    <KnowledgeGraph :node-count="14" :flow-dots="true" :labels="knowledgeLabels" />

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

      <!-- 生成计划操作区 -->
      <section class="generate-section">
        <button
          class="generate-btn"
          :disabled="loading"
          @click="generatePlan"
        >
          {{ loading ? 'AI 规划中…' : '生成个性化计划' }}
        </button>
        <span v-if="hasValidDiagnosis" class="generate-hint">
          基于最近诊断（{{ diagnosisScore }}分）生成
        </span>
        <span v-else class="generate-hint">
          基于学生画像生成（无诊断记录时 Agent 将自行分析）
        </span>
        <div v-if="error" class="generate-error">
          <span class="error-text">计划生成失败：{{ error }}</span>
          <button class="retry-btn" :disabled="loading" @click="generatePlan">
            {{ loading ? 'AI 规划中…' : '重试' }}
          </button>
        </div>
      </section>

      <!-- W3-2: 总体进度条 -->
      <section v-if="plan && hasApiPlan" class="progress-section">
        <div class="progress-header">
          <span class="progress-label">总体完成度</span>
          <span class="progress-value">{{ completionRate }}%</span>
        </div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill" :style="{ width: completionRate + '%' }"></div>
        </div>
        <div class="progress-hint">
          点击下方任务勾选完成状态，进度自动保存
        </div>
      </section>

      <!-- 当前计划（API 生成或种子 fallback）；weeks 为空视为无效计划，走空态 -->
      <section v-if="plan && plan.weeks?.length" class="plan-section">
        <div class="section-header">
          <h2 class="section-title">当前计划</h2>
          <span class="section-en">Current Plan</span>
          <AiGeneratedBadge v-if="hasApiPlan" />
          <span v-else class="plan-badge plan-badge--seed">Demo</span>
        </div>
        <PlanCard
          :plan="plan"
          :interactive="hasApiPlan"
          :progress="progress"
          @toggle-task="onToggleTask"
        />
      </section>

      <!-- 空态 -->
      <section v-else class="empty-state">
        <div class="empty-icon">◯</div>
        <div class="empty-title">还没有生成计划</div>
        <div class="empty-desc">点击上方「生成个性化计划」按钮，AI 规划 Agent 将基于你的诊断结果生成周计划</div>
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
.page-header { margin-bottom: 32px; }

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

.vb-node.current .vb-num { color: var(--color-node-warn); }

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

.plan-badge {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  background: color-mix(in srgb, #00d4aa 15%, transparent);
  color: #00a07d;
}
.plan-badge--seed {
  background: color-mix(in srgb, #ffd166 15%, transparent);
  color: #b8860b;
}

/* === 生成计划操作区 === */
.generate-section {
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.generate-btn {
  padding: 10px 24px;
  background: var(--color-ink-900);
  color: var(--color-fg-inverse);
  border: none;
  border-radius: var(--radius-full);
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.generate-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.generate-hint {
  font-size: 12px;
  color: var(--color-fg-tertiary);
}

.generate-error {
  width: 100%;
  padding: 10px 14px;
  background: rgba(255, 107, 107, 0.08);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: #d9483f;
  display: flex;
  align-items: center;
  gap: 12px;
}

.error-text { flex: 1; }

.retry-btn {
  padding: 4px 14px;
  background: transparent;
  border: 1px solid #d9483f;
  border-radius: var(--radius-full);
  font-size: 12px;
  color: #d9483f;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.retry-btn:hover:not(:disabled) {
  background: #d9483f;
  color: #fff;
}

.retry-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

/* W3-2: 进度条 */
.progress-section {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-sm);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
}

.progress-label {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-900);
}

.progress-value {
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 700;
  color: var(--color-node-active);
}

.progress-bar-track {
  height: 8px;
  background: var(--color-bg-sunken);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-node-active) 0%, #00d4aa 100%);
  border-radius: var(--radius-full);
  transition: width 0.4s var(--ease-out);
}

.progress-hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--color-fg-tertiary);
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
