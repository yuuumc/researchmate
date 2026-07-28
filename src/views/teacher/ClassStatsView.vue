<script setup>
// ============================================================
// ClassStatsView · 班级学情看板（v2.5）
// ============================================================
// 数据：teacher.js realGetClassStats(classId)
// 4 概览卡：学生数 / 诊断总数 / 平均推理分 / 覆盖学科数
// 3 图表：能力分布（柱）/ 薄弱知识点 top10（横向条）/ 学科分布（饼）
// ECharts 模组化按需引入（HistoryView 既有模式）
// ============================================================
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as echarts from 'echarts/core'
import { BarChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  DataZoomComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { realGetClassStats } from '@/services/teacher'
import { isSupabaseConfigured } from '@/services/supabase'

echarts.use([
  BarChart, PieChart,
  GridComponent, TooltipComponent, TitleComponent, LegendComponent, DataZoomComponent,
  CanvasRenderer
])

const route = useRoute()
const router = useRouter()
const classId = route.params.classId

const loading = ref(true)
const error = ref('')
const stats = ref(null)

const abilityChartRef = ref(null)
const weakChartRef = ref(null)
const subjectChartRef = ref(null)
let abilityInstance = null
let weakInstance = null
let subjectInstance = null
let resizeObserver = null

const overviewCards = computed(() => {
  if (!stats.value) return []
  return [
    { key: 'students', num: stats.value.student_count, label: '学生数', hint: '加入班级' },
    { key: 'diagnoses', num: stats.value.total_diagnoses, label: '诊断总数', hint: '累计诊断次数' },
    { key: 'reasoning', num: stats.value.avg_reasoning !== null ? stats.value.avg_reasoning.toFixed(1) : '—', label: '平均推理分', hint: '最近诊断平均' },
    { key: 'subjects', num: stats.value.subject_distribution.length, label: '覆盖学科', hint: '诊断中出现' }
  ]
})

const subjectLabelMap = { microelectronics: '微电子', cs: '计算机', unknown: '未知' }

const abilityOption = computed(() => {
  const dist = stats.value?.ability_distribution || {}
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 16, top: 24, bottom: 32 },
    xAxis: {
      type: 'category',
      data: ['1 星', '2 星', '3 星', '4 星', '5 星'],
      axisLine: { lineStyle: { color: '#c8d3e0' } },
      axisLabel: { color: '#3d5a80', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#e3e8f0' } },
      axisLabel: { color: '#7a8ba3', fontSize: 12 }
    },
    series: [{
      type: 'bar',
      data: [dist[1] || 0, dist[2] || 0, dist[3] || 0, dist[4] || 0, dist[5] || 0],
      itemStyle: {
        color: (params) => {
          const palette = ['#ff6b6b', '#ff8a65', '#4d9de0', '#3d5a80', '#00d4aa']
          return palette[params.dataIndex] || '#3d5a80'
        },
        borderRadius: [4, 4, 0, 0]
      },
      barWidth: '50%'
    }]
  }
})

const weakOption = computed(() => {
  const list = stats.value?.weak_top_topics || []
  const labels = list.map((x) => x.topic)
  const counts = list.map((x) => x.count)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 100, right: 32, top: 16, bottom: 24 },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#e3e8f0' } },
      axisLabel: { color: '#7a8ba3', fontSize: 12 }
    },
    yAxis: {
      type: 'category',
      data: labels.length ? labels.reverse() : ['暂无数据'],
      axisLine: { lineStyle: { color: '#c8d3e0' } },
      axisLabel: { color: '#3d5a80', fontSize: 12 }
    },
    series: [{
      type: 'bar',
      data: counts.length ? counts.reverse() : [0],
      itemStyle: { color: '#ff6b6b', borderRadius: [0, 4, 4, 0] },
      barWidth: '60%'
    }]
  }
})

const subjectOption = computed(() => {
  const list = (stats.value?.subject_distribution || []).map((s) => ({
    name: subjectLabelMap[s.subject] || s.subject,
    value: s.count
  }))
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: '#3d5a80', fontSize: 12 } },
    series: [{
      type: 'pie',
      radius: ['45%', '72%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      label: { show: true, formatter: '{b}\n{d}%', color: '#1e3a5f', fontSize: 12 },
      labelLine: { length: 8, length2: 8 },
      data: list.length ? list : [{ name: '暂无', value: 0, itemStyle: { color: '#eaeef5' } }],
      color: ['#1e3a5f', '#4d9de0', '#00d4aa', '#ffd166', '#7c5cbf']
    }]
  }
})

function initCharts() {
  if (abilityChartRef.value) {
    abilityInstance?.dispose()
    abilityInstance = echarts.init(abilityChartRef.value, null, { renderer: 'canvas' })
    abilityInstance.setOption(abilityOption.value)
  }
  if (weakChartRef.value) {
    weakInstance?.dispose()
    weakInstance = echarts.init(weakChartRef.value, null, { renderer: 'canvas' })
    weakInstance.setOption(weakOption.value)
  }
  if (subjectChartRef.value) {
    subjectInstance?.dispose()
    subjectInstance = echarts.init(subjectChartRef.value, null, { renderer: 'canvas' })
    subjectInstance.setOption(subjectOption.value)
  }
}

function handleResize() {
  abilityInstance?.resize()
  weakInstance?.resize()
  subjectInstance?.resize()
}

onMounted(async () => {
  if (!isSupabaseConfigured) {
    loading.value = false
    return
  }
  try {
    stats.value = await realGetClassStats(classId)
    await nextTick()
    initCharts()
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(handleResize)
      abilityChartRef.value && resizeObserver.observe(abilityChartRef.value)
      weakChartRef.value && resizeObserver.observe(weakChartRef.value)
      subjectChartRef.value && resizeObserver.observe(subjectChartRef.value)
    }
    window.addEventListener('resize', handleResize)
  } catch (e) {
    console.error('[class-stats] load failed:', e)
    error.value = e?.message || '加载学情失败'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect()
  window.removeEventListener('resize', handleResize)
  abilityInstance?.dispose()
  weakInstance?.dispose()
  subjectInstance?.dispose()
})

watch(stats, () => nextTick(initCharts))
</script>

<template>
  <div class="class-stats-page">
    <header class="page-header">
      <button class="btn-back" @click="router.back()">← 返回</button>
      <h1 class="page-title">班级学情</h1>
    </header>

    <div v-if="!isSupabaseConfigured" class="notice-card">
      <h3>未配置 Supabase</h3>
      <p>教师侧功能需要多用户后端支持。</p>
    </div>

    <div v-else-if="loading" class="skeleton-wrap">
      <div class="skeleton-block" style="height: 100px" />
      <div class="skeleton-block" style="height: 320px" />
    </div>

    <div v-else-if="error" class="notice-card error">
      <h3>加载失败</h3>
      <p>{{ error }}</p>
    </div>

    <template v-else-if="stats">
      <!-- 4 概览卡 -->
      <section class="overview-grid">
        <article v-for="card in overviewCards" :key="card.key" class="overview-card">
          <div class="overview-num">{{ card.num }}</div>
          <div class="overview-label">{{ card.label }}</div>
          <div class="overview-hint">{{ card.hint }}</div>
        </article>
      </section>

      <!-- 3 图表 -->
      <section class="charts-grid">
        <article class="chart-card">
          <h3 class="chart-title">能力分布</h3>
          <div ref="abilityChartRef" class="chart-canvas" role="img" aria-label="能力分布柱状图" />
        </article>
        <article class="chart-card">
          <h3 class="chart-title">薄弱知识点 Top10</h3>
          <div ref="weakChartRef" class="chart-canvas" role="img" aria-label="薄弱知识点横向条形图" />
        </article>
        <article class="chart-card chart-wide">
          <h3 class="chart-title">学科分布</h3>
          <div ref="subjectChartRef" class="chart-canvas" role="img" aria-label="学科分布饼图" />
        </article>
      </section>
    </template>
  </div>
</template>

<style scoped>
.class-stats-page {
  flex: 1;
  padding: var(--space-6) var(--space-8);
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.page-header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.btn-back {
  border: none;
  background: var(--color-bg-sunken);
  color: var(--color-fg-secondary);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-meta);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-back:hover { background: var(--color-border-subtle); color: var(--color-fg-primary); }
.btn-back:active { transform: scale(0.97); }

.page-title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: var(--text-section);
  color: var(--color-ink-900);
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}

.overview-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  box-shadow: var(--shadow-sm);
  position: relative;
  overflow: hidden;
}

.overview-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--color-ink-700), var(--color-node-active));
}

.overview-num {
  font-size: var(--text-display);
  font-weight: 700;
  color: var(--color-ink-700);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.overview-label {
  margin-top: var(--space-2);
  font-size: var(--text-subtitle);
  color: var(--color-fg-primary);
}

.overview-hint {
  margin-top: var(--space-1);
  font-size: var(--text-caption);
  color: var(--color-fg-tertiary);
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
}

.chart-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  box-shadow: var(--shadow-sm);
}

.chart-wide { grid-column: 1 / -1; }

.chart-title {
  margin: 0 0 var(--space-4);
  font-size: var(--text-subtitle);
  color: var(--color-fg-secondary);
}

.chart-canvas {
  width: 100%;
  height: 300px;
}

.chart-wide .chart-canvas { height: 340px; }

.skeleton-wrap { display: flex; flex-direction: column; gap: var(--space-4); }

.skeleton-block {
  border-radius: var(--radius-lg);
  background: linear-gradient(90deg, var(--color-bg-sunken) 25%, var(--color-bg-elevated) 50%, var(--color-bg-sunken) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

.notice-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-10);
  text-align: center;
}

.notice-card.error h3 { color: var(--color-error); }

.notice-card h3 { margin: 0 0 var(--space-2); color: var(--color-ink-900); }
.notice-card p { margin: 0; color: var(--color-fg-secondary); }

@media (max-width: 768px) {
  .class-stats-page { padding: var(--space-4); }
  .overview-grid { grid-template-columns: repeat(2, 1fr); }
  .charts-grid { grid-template-columns: 1fr; }
  .chart-wide { grid-column: 1; }
}
</style>
