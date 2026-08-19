<script setup>
// ============================================================
// B5 卡片2：学习活跃度趋势
// ⚠️ 数据源降级说明：
//   全仓无 study_time / learning_duration / activity_log 字段。
//   当前降级用两个可用信号：
//     ① diagnosisStore.history timestamps → 诊断活动频率（按日聚合）
//     ② knowledge_state[topic].attempts → 累计练习次数（按知识点）
//   待 PM 协调全栈确认是否有学习时长数据源后替换。
// ============================================================
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { TooltipComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useDiagnosisStore } from '@/stores/diagnosis'
import { useProfileStore } from '@/stores/profile'
import { useChartTheme } from './useChartTheme'

echarts.use([BarChart, TooltipComponent, GridComponent, CanvasRenderer])

const diagnosisStore = useDiagnosisStore()
const profileStore = useProfileStore()
const { chartTheme, onThemeChange } = useChartTheme()

const chartRef = ref(null)
let chartInstance = null

// 活动数据：按日期聚合诊断次数 + 练习次数（来自 knowledge_state.attempts）
const activityData = computed(() => {
  const history = diagnosisStore.history || []
  const ks = profileStore.profile?.knowledge_state || {}

  // 练习总次数（所有知识点的 attempts 之和）
  let totalAttempts = 0
  const topicAttempts = []
  for (const [topic, state] of Object.entries(ks)) {
    const a = state?.attempts || 0
    totalAttempts += a
    if (a > 0) topicAttempts.push({ topic, attempts: a })
  }

  // 诊断活动按日期聚合（最近 14 天）
  const now = new Date()
  const dayMap = new Map()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = `${d.getMonth() + 1}/${d.getDate()}`
    dayMap.set(key, 0)
  }
  for (const h of history) {
    if (!h.timestamp) continue
    const d = new Date(h.timestamp)
    const key = `${d.getMonth() + 1}/${d.getDate()}`
    if (dayMap.has(key)) {
      dayMap.set(key, dayMap.get(key) + 1)
    }
  }

  const dates = Array.from(dayMap.keys())
  const diagCounts = Array.from(dayMap.values())

  return {
    dates,
    diagCounts,
    totalDiagnoses: history.length,
    totalAttempts,
    topTopics: topicAttempts.sort((a, b) => b.attempts - a.attempts).slice(0, 5),
  }
})

const hasData = computed(() =>
  activityData.value.totalDiagnoses > 0 || activityData.value.totalAttempts > 0
)

function renderChart() {
  if (!chartRef.value || !hasData.value) return

  const t = chartTheme.value
  const d = activityData.value

  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value)
  }

  chartInstance.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText, fontSize: 12 },
      axisPointer: { type: 'shadow' },
    },
    grid: { left: 30, right: 12, top: 12, bottom: 28 },
    xAxis: {
      type: 'category',
      data: d.dates,
      axisLabel: { color: t.labelColor, fontSize: 9, interval: 1 },
      axisLine: { lineStyle: { color: t.axisLineColor } },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: t.labelColor, fontSize: 10 },
      splitLine: { lineStyle: { color: t.splitLineColor } },
    },
    series: [{
      name: '诊断次数',
      type: 'bar',
      data: d.diagCounts,
      itemStyle: {
        color: t.seriesColors[3],
        borderRadius: [3, 3, 0, 0],
      },
      barMaxWidth: 16,
    }],
  }, true)
}

function handleResize() {
  chartInstance?.resize()
}

function handleThemeChange() {
  nextTick(() => renderChart())
}

onMounted(() => {
  nextTick(() => renderChart())
  window.addEventListener('resize', handleResize)
  onThemeChange(handleThemeChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})

watch(activityData, () => nextTick(() => renderChart()), { deep: true })
</script>

<template>
  <div class="dash-card">
    <div class="dash-card__head">
      <span class="dash-card__icon">📈</span>
      <div>
        <div class="dash-card__title">学习活跃度趋势</div>
        <div class="dash-card__sub">学习活动频率（诊断+练习）</div>
      </div>
    </div>
    <div v-if="hasData" ref="chartRef" class="dash-card__chart"></div>
    <div v-else class="dash-card__empty">
      <span>暂无活动数据</span>
      <span class="dash-card__empty-hint">完成诊断或练习后此处将展示学习活跃度趋势</span>
    </div>
    <div v-if="hasData" class="activity-summary">
      <span class="activity-stat">诊断 {{ activityData.totalDiagnoses }} 次</span>
      <span class="activity-stat">练习 {{ activityData.totalAttempts }} 次</span>
    </div>
  </div>
</template>

<style scoped>
@import './dash-card.css';

.activity-summary {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  border-top: 1px dashed var(--border-subtle, rgba(255,255,255,0.08));
  padding-top: 8px;
}

.activity-stat {
  font-size: 11px;
  color: var(--text-secondary, #94a3b8);
  font-variant-numeric: tabular-nums;
}
</style>
