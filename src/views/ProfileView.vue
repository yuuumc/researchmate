<script setup>
// ============================================================
// 学生画像中心页（V2 · spec 对齐 + v2.0 编辑入口）
// 两列布局：左列 320px 基础信息卡 + AI 评价卡
//          右列知识图谱路径 + 成长时间线
// ============================================================
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useProfileStore } from '@/stores/profile'
import { useDiagnosisStore } from '@/stores/diagnosis'
import { useExamStore } from '@/stores/exam'
import { useMasteryData } from '@/composables/useMasteryData'
import { profileBus, EVT } from '@/core/profileBus'
import { isSupabaseConfigured } from '@/services/supabase'
import WaferDome from '@/components/WaferDome.vue'
import AbilityWaveform from '@/components/AbilityWaveform.vue'
// ECharts 树摇（与 HistoryView 一致：核心 + LineChart + 必要组件）
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, MarkPointComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, GridComponent, TooltipComponent, MarkPointComponent, CanvasRenderer])

const router = useRouter()
const profileStore = useProfileStore()
const diagStore = useDiagnosisStore()
const examStore = useExamStore()
const mastery = useMasteryData()
const profile = computed(() => profileStore.profile)

// GWT#1: profileBus 事件驱动刷新证据（useMasteryData 已是响应式统一读口，
// 此处监听 PROFILE_UPDATED 显式记录实时刷新 + 兜底触发重算）
const profileVersion = ref(0)
function onProfileUpdated(payload) {
  profileVersion.value++
  console.log('[ProfileView] profile-updated received:', payload?.source, payload?.topics)
}

// 基础信息
const avatarInitial = computed(() => {
  const name = profile.value.name || '同'
  return name.charAt(0)
})

const stageLabel = computed(() => {
  const map = { initial: '起步阶段', basic: '基础阶段', intensive: '强化阶段', sprint: '冲刺阶段' }
  return map[profile.value.preparation_stage] || '基础阶段'
})

// 知识图谱路径数据
const knowledgePath = [
  { label: '半导体物理', status: 'mastered', icon: '半' },
  { label: 'MOSFET', status: 'learning', icon: 'M' },
  { label: 'CMOS', status: 'pending', icon: 'C' },
  { label: '数字IC', status: 'pending', icon: 'IC' },
  { label: 'AI Accelerator', status: 'target', icon: 'AI' }
]

const connectorStates = computed(() => {
  const states = []
  for (let i = 0; i < knowledgePath.length - 1; i++) {
    const cur = knowledgePath[i].status
    const next = knowledgePath[i + 1].status
    if (cur === 'mastered' && (next === 'mastered' || next === 'learning')) {
      states.push('done')
    } else if (cur === 'mastered' && next === 'learning') {
      states.push('active')
    } else if (cur === 'learning') {
      states.push('active')
    } else {
      states.push('future')
    }
  }
  return states
})

// GWT#1: 知识掌握区走 F1 统一读口 useMasteryData（ability_stars 活态镜像），
// 任意学习事件（答题/模考/费曼/拍题）后 updateProfile 即触发响应式重算，即时反映最新 mastery
const strengths = computed(() =>
  mastery.abilityStars.value.filter((a) => a.type === 'strength').map((a) => a.topic)
)
const weaknesses = computed(() =>
  mastery.abilityStars.value.filter((a) => a.type === 'weak').map((a) => a.topic)
)

const timeline = [
  { date: '2026.08', status: 'done', text: '完成半导体物理基础学习' },
  { date: '2026.10', status: 'active', text: '掌握 Verilog HDL 数字电路设计' },
  { date: '2027.01', status: 'future', text: '完成 FPGA 项目实战' },
  { date: '2027.06', status: 'future', text: '复现 AI 芯片顶会论文' }
]

// GWT#3: 薄弱/优势知识点点击跳转 /practice?topic=xxx（沿用 WaferDome click/drag 阈值同款跳转口）
function goPractice(topic) {
  if (!topic) return
  router.push({ path: '/practice', query: { topic } })
}

// GWT#2: 进步轨迹折线图 — 数据源 diagnoses 表历史（loadFromDB 拉真实记录）+ 模考历史，非 mock
const progressPoints = computed(() => {
  void profileVersion.value
  const diag = (diagStore.history || [])
    .filter((h) => typeof h.score === 'number' && h.timestamp)
    .map((h) => ({ time: h.timestamp, score: h.score, type: '诊断' }))
  const exam = (examStore.getHistory() || [])
    .filter((e) => typeof e.score_percent === 'number' && e.date)
    .map((e) => ({ time: e.date, score: e.score_percent, type: '模考' }))
  return [...diag, ...exam].sort((a, b) => new Date(a.time) - new Date(b.time))
})
const hasProgress = computed(() => progressPoints.value.length >= 2)

const themeKey = ref(0)
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || undefined
}
function onThemeChanged() {
  themeKey.value++
  nextTick(initProgressChart)
}

const progressOption = computed(() => {
  void themeKey.value
  if (!hasProgress.value) return null
  const pts = progressPoints.value
  const x = pts.map((d) => new Date(d.time).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }))
  const y = pts.map((d) => d.score)
  return {
    grid: { top: 28, right: 20, bottom: 28, left: 40 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: cssVar('--bg-elevated') || 'rgba(15,30,51,0.95)',
      borderColor: 'transparent',
      textStyle: { color: cssVar('--text-primary') || '#f1f5f9', fontSize: 12 },
      formatter: (params) => {
        if (!params?.length) return ''
        const i = params[0].dataIndex
        const d = pts[i]
        return `${x[i]}<br/>${params[0].marker} ${d.type} · ${d.score} 分`
      }
    },
    xAxis: {
      type: 'category',
      data: x,
      axisLine: { lineStyle: { color: cssVar('--border-subtle') || 'rgba(255,255,255,0.08)' } },
      axisLabel: { color: cssVar('--text-muted') || '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }
    },
    yAxis: {
      type: 'value', min: 0, max: 100,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: cssVar('--border-subtle') || 'rgba(255,255,255,0.08)', type: 'dashed' } },
      axisLabel: { color: cssVar('--text-muted') || '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }
    },
    series: [{
      name: '分数',
      type: 'line',
      data: y,
      smooth: true,
      symbol: 'circle',
      symbolSize: 8,
      itemStyle: { color: cssVar('--primary') || '#22d3ee' },
      lineStyle: { width: 2.5, color: cssVar('--primary') || '#22d3ee' },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(34,211,238,0.25)' },
            { offset: 1, color: 'rgba(34,211,238,0)' }
          ]
        }
      },
      markPoint: {
        symbol: 'pin', symbolSize: 36,
        data: [{ type: 'max', name: '最高' }],
        itemStyle: { color: cssVar('--primary') || '#22d3ee' },
        label: { fontSize: 10, color: '#fff', fontWeight: 700 }
      }
    }]
  }
})

const progressChartRef = ref(null)
let progressChart = null
let progressResizeObserver = null
function initProgressChart() {
  if (!progressChartRef.value) return
  if (!progressChart) progressChart = echarts.init(progressChartRef.value, null, { renderer: 'canvas' })
  if (progressOption.value) progressChart.setOption(progressOption.value, true)
  else progressChart.clear()
}
function handleProgressResize() {
  if (progressChart) progressChart.resize()
}

onMounted(async () => {
  // GWT#2: 拉真实 diagnoses 表历史（非 mock）
  try { await diagStore.loadFromDB() } catch (e) { console.warn('[ProfileView] loadFromDB failed:', e) }
  nextTick(initProgressChart)
  progressResizeObserver = new ResizeObserver(handleProgressResize)
  if (progressChartRef.value) progressResizeObserver.observe(progressChartRef.value)
  window.addEventListener('resize', handleProgressResize)
  window.addEventListener('theme-changed', onThemeChanged)
  // GWT#1: 订阅 profileBus 实时刷新
  profileBus.on(EVT.PROFILE_UPDATED, onProfileUpdated)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleProgressResize)
  window.removeEventListener('theme-changed', onThemeChanged)
  profileBus.off(EVT.PROFILE_UPDATED, onProfileUpdated)
  if (progressResizeObserver) { progressResizeObserver.disconnect(); progressResizeObserver = null }
  if (progressChart) { progressChart.dispose(); progressChart = null }
})
watch(progressOption, () => nextTick(initProgressChart))

// v2.0: 编辑画像入口（仅 Supabase 配置后显示）
function goEdit() {
  router.push('/profile/edit')
}
</script>

<template>
  <div class="profile-view">
    <div class="profile-content">
      <!-- 页头 -->
      <div class="page-header">
        <div class="page-eyebrow">
          <span class="dot"></span>
          <span>Student Profile · AI Understanding</span>
        </div>
        <div class="page-header-row">
          <div>
            <h1 class="page-title">学生画像</h1>
            <p class="page-subtitle">AI 对你的完整理解 — 持续学习中的智能体</p>
          </div>
          <button
            v-if="isSupabaseConfigured"
            class="yx-btn yx-btn--secondary yx-btn--sm"
            @click="goEdit"
          >编辑画像</button>
        </div>
      </div>

      <!-- 两列布局 -->
      <div class="profile-layout">
        <!-- 左列：基础信息卡 -->
        <div class="profile-left">
          <div class="info-card">
            <div class="avatar-section">
              <div class="avatar">{{ avatarInitial }}</div>
              <div class="avatar-info">
                <div class="avatar-name">{{ profile.name || '未设置' }}</div>
                <div class="avatar-major">{{ profile.target_major || profile.major || '未设置专业' }}</div>
              </div>
            </div>

            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">目标院校</span>
                <span class="info-value">{{ profile.target_school || '未设置' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">备考阶段</span>
                <span class="info-value">{{ stageLabel }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">学习风格</span>
                <span class="info-value">{{ profileStore.learningStyleLabel }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">距考研</span>
                <span class="info-value highlight">{{ profileStore.daysLeft !== null ? profileStore.daysLeft + ' 天' : '未设置' }}</span>
              </div>
            </div>
          </div>

          <!-- 能力波形 -->
          <AbilityWaveform />

          <!-- AI 评价卡 -->
          <div class="ai-card">
            <div class="ai-header">
              <span class="ai-icon">AI</span>
              <span class="ai-title">AI 评价</span>
            </div>
            <div class="ai-content">
              <div v-if="strengths.length" class="ai-section">
                <span class="ai-tag ai-tag--good">优势</span>
                <div class="ai-tags">
                  <button v-for="s in strengths" :key="s" type="button" class="topic-tag topic-tag--good topic-tag--clickable" :title="`跳转练习：${s}`" @click="goPractice(s)">{{ s }}</button>
                </div>
              </div>
              <div v-if="weaknesses.length" class="ai-section">
                <span class="ai-tag ai-tag--weak">薄弱</span>
                <div class="ai-tags">
                  <button v-for="w in weaknesses" :key="w" type="button" class="topic-tag topic-tag--weak topic-tag--clickable" :title="`跳转练习：${w}`" @click="goPractice(w)">{{ w }}</button>
                </div>
              </div>
              <div v-if="!strengths.length && !weaknesses.length" class="ai-empty">
                完成诊断后 AI 将生成评价
              </div>
            </div>
          </div>
        </div>

        <!-- 右列：知识图谱 + 时间线 -->
        <div class="profile-right">
          <!-- 知识晶圆穹顶 -->
          <WaferDome />

          <!-- 知识路径 -->
          <div class="path-card">
            <h3 class="card-title">知识图谱路径</h3>
            <div class="knowledge-path">
              <div v-for="(node, i) in knowledgePath" :key="node.label" class="path-node-wrap">
                <div class="path-node" :class="'path-node--' + node.status">
                  <span class="path-icon">{{ node.icon }}</span>
                  <span class="path-label">{{ node.label }}</span>
                </div>
                <div v-if="i < knowledgePath.length - 1" class="path-connector" :class="'connector--' + (connectorStates[i] || 'future')"></div>
              </div>
            </div>
          </div>

          <!-- 进步轨迹折线图（GWT#2） -->
          <div class="progress-card">
            <h3 class="card-title">
              <svg class="card-title-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="3 17 9 11 13 15 21 7" />
                <polyline points="14 7 21 7 21 14" />
              </svg>
              <span>进步轨迹</span>
              <span v-if="hasProgress" class="card-title-count">{{ progressPoints.length }} 次记录</span>
            </h3>
            <div v-if="hasProgress" ref="progressChartRef" class="progress-chart"></div>
            <div v-else class="progress-empty">完成至少 2 次诊断或模考后，这里将展示你的分数变化轨迹</div>
          </div>

          <!-- 成长时间线 -->
          <div class="timeline-card">
            <h3 class="card-title">成长时间线</h3>
            <div class="timeline">
              <div v-for="item in timeline" :key="item.date" class="timeline-item" :class="'timeline-item--' + item.status">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                  <span class="timeline-date">{{ item.date }}</span>
                  <span class="timeline-text">{{ item.text }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-view {
  position: relative;
  min-height: 100vh;
  background: var(--color-bg-sunken, #f8f9fa);
  color: var(--color-ink-900, #1a1a2e);
}

.profile-content {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-8, 32px) var(--space-4, 16px) var(--space-16, 64px);
}

.page-header {
  margin-bottom: var(--space-8, 32px);
}

.page-eyebrow {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  font-family: var(--font-display, var(--font-body, sans-serif));
  font-size: var(--text-xs, 12px);
  color: var(--text-muted, var(--color-fg-tertiary, #94a3b8));
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: var(--space-2, 8px);
}

.page-eyebrow .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary, var(--color-node-active, #22d3ee));
}

.page-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4, 16px);
}

.page-title {
  margin: 0;
  font-family: var(--font-display, var(--font-serif, serif));
  font-size: var(--text-2xl, 28px);
  color: var(--text-primary, var(--color-ink-900, #f1f5f9));
}

.page-subtitle {
  margin: var(--space-1, 4px) 0 0;
  font-size: var(--text-sm, 14px);
  color: var(--text-secondary, var(--color-fg-secondary, #94a3b8));
}

.profile-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--space-6, 24px);
}

@media (max-width: 768px) {
  .profile-layout {
    grid-template-columns: 1fr;
  }
}

/* 基础信息卡 */
.info-card {
  background: var(--bg-surface, var(--color-bg-elevated, #12141d));
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-6, 24px);
  box-shadow: var(--shadow-card, 0 0 0 1px rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.4));
}

.avatar-section {
  display: flex;
  align-items: center;
  gap: var(--space-4, 16px);
  margin-bottom: var(--space-6, 24px);
}

.avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--primary-dim, rgba(34,211,238,0.12));
  color: var(--primary, #22d3ee);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 600;
}

.avatar-name {
  font-size: var(--text-lg, 18px);
  font-weight: 600;
  color: var(--text-primary, #f1f5f9);
}

.avatar-major {
  font-size: var(--text-sm, 14px);
  color: var(--text-secondary, #94a3b8);
  margin-top: 2px;
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  font-size: var(--text-sm, 14px);
  color: var(--text-muted, #64748b);
}

.info-value {
  font-size: var(--text-sm, 14px);
  color: var(--text-primary, #f1f5f9);
  font-weight: 500;
}

.info-value.highlight {
  color: var(--primary, #22d3ee);
  font-family: var(--font-display, sans-serif);
}

/* AI 评价卡 */
.ai-card {
  margin-top: var(--space-4, 16px);
  background: var(--bg-surface, #12141d);
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-6, 24px);
  box-shadow: var(--shadow-card, 0 0 0 1px rgba(255,255,255,0.08));
}

.ai-header {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  margin-bottom: var(--space-4, 16px);
}

.ai-icon {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm, 8px);
  background: var(--primary-dim, rgba(34,211,238,0.12));
  color: var(--primary, #22d3ee);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
}

.ai-title {
  font-size: var(--text-sm, 14px);
  font-weight: 600;
  color: var(--text-primary, #f1f5f9);
}

.ai-section {
  margin-bottom: var(--space-3, 12px);
}

.ai-tag {
  font-size: var(--text-xs, 12px);
  padding: 2px 8px;
  border-radius: var(--radius-pill, 999px);
  margin-bottom: var(--space-2, 8px);
  display: inline-block;
}

.ai-tag--good {
  background: rgba(52,211,153,0.1);
  color: var(--success, #34d399);
}

.ai-tag--weak {
  background: rgba(248,113,113,0.1);
  color: var(--danger, #f87171);
}

.ai-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
}

.topic-tag {
  font-size: var(--text-xs, 12px);
  padding: 4px 10px;
  border-radius: var(--radius-pill, 999px);
}

.topic-tag--good {
  background: rgba(52,211,153,0.1);
  color: var(--success, #34d399);
}

.topic-tag--weak {
  background: rgba(248,113,113,0.1);
  color: var(--danger, #f87171);
}

.ai-empty {
  font-size: var(--text-sm, 14px);
  color: var(--text-muted, #64748b);
}

/* 知识路径卡 */
.path-card,
.timeline-card {
  background: var(--bg-surface, #12141d);
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-6, 24px);
  box-shadow: var(--shadow-card, 0 0 0 1px rgba(255,255,255,0.08));
  margin-bottom: var(--space-6, 24px);
}

.card-title {
  margin: 0 0 var(--space-6, 24px);
  font-size: var(--text-lg, 18px);
  font-weight: 600;
  color: var(--text-primary, #f1f5f9);
}

.knowledge-path {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
}

.path-node-wrap {
  display: flex;
  align-items: center;
}

.path-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1, 4px);
  min-width: 80px;
}

.path-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}

.path-node--mastered .path-icon {
  background: rgba(52,211,153,0.15);
  color: var(--success, #34d399);
  border: 2px solid var(--success, #34d399);
}

.path-node--learning .path-icon {
  background: var(--primary-dim, rgba(34,211,238,0.12));
  color: var(--primary, #22d3ee);
  border: 2px solid var(--primary, #22d3ee);
}

.path-node--pending .path-icon {
  background: var(--bg-elevated, #1a1d29);
  color: var(--text-muted, #64748b);
  border: 2px solid var(--border-subtle, rgba(255,255,255,0.08));
}

.path-node--target .path-icon {
  background: rgba(168,85,247,0.1);
  color: var(--accent, #a855f7);
  border: 2px solid var(--accent, #a855f7);
}

.path-label {
  font-size: var(--text-xs, 12px);
  color: var(--text-secondary, #94a3b8);
}

.path-connector {
  width: 32px;
  height: 2px;
  margin: 0 var(--space-1, 4px);
}

.connector--done { background: var(--success, #34d399); }
.connector--active { background: var(--primary, #22d3ee); }
.connector--future { background: var(--border-subtle, rgba(255,255,255,0.08)); }

/* 时间线 */
.timeline {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.timeline-item {
  display: flex;
  gap: var(--space-3, 12px);
  position: relative;
}

.timeline-item:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 16px;
  bottom: -16px;
  width: 2px;
  background: var(--border-subtle, rgba(255,255,255,0.08));
}

.timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 4px;
  flex-shrink: 0;
}

.timeline-item--done .timeline-dot { background: var(--success, #34d399); }
.timeline-item--active .timeline-dot { background: var(--primary, #22d3ee); box-shadow: 0 0 0 4px var(--primary-dim, rgba(34,211,238,0.12)); }
.timeline-item--future .timeline-dot { background: var(--bg-elevated, #1a1d29); border: 2px solid var(--text-muted, #64748b); }

.timeline-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.timeline-date {
  font-size: var(--text-xs, 12px);
  color: var(--text-muted, #64748b);
  font-family: var(--font-display, var(--font-mono, monospace));
}

.timeline-text {
  font-size: var(--text-sm, 14px);
  color: var(--text-primary, #f1f5f9);
}

/* === F5: 进步轨迹折线图 + 可点击知识点标签 === */
.card-title {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}
.card-title-icon {
  color: var(--primary, #22d3ee);
  flex-shrink: 0;
}
.card-title-count {
  margin-left: auto;
  font-size: var(--text-xs, 12px);
  font-family: var(--font-mono, monospace);
  color: var(--text-muted, #64748b);
  font-weight: 400;
}
.progress-card {
  background: var(--bg-surface, #12141d);
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-6, 24px);
  box-shadow: var(--shadow-card, 0 0 0 1px rgba(255,255,255,0.08));
  margin-bottom: var(--space-6, 24px);
}
.progress-chart {
  width: 100%;
  height: 200px;
}
.progress-empty {
  font-size: var(--text-sm, 14px);
  color: var(--text-muted, #64748b);
  text-align: center;
  padding: var(--space-8, 32px) var(--space-4, 16px);
}
/* 可点击知识点标签：点击跳转 /practice?topic=xxx */
.topic-tag--clickable {
  cursor: pointer;
  border: none;
  font-family: inherit;
  transition: transform 0.15s ease, background 0.15s ease;
}
.topic-tag--clickable:hover {
  transform: translateY(-1px);
}
.topic-tag--clickable.topic-tag--good:hover {
  background: rgba(52, 211, 153, 0.22);
}
.topic-tag--clickable.topic-tag--weak:hover {
  background: rgba(248, 113, 113, 0.22);
}
.topic-tag--clickable:focus-visible {
  outline: 2px solid var(--primary, #22d3ee);
  outline-offset: 2px;
}
</style>
