<script setup>
// ============================================================
// B5 卡片4：进步轨迹
// 数据源：diagnosisStore.history（score + timestamp + ability_stars_snapshot）
//   → 诊断分数趋势折线图（最近 N 次）
//   ⚠️ 无 mastery 历史快照，当前用诊断分数 + 能力星级变化作为进步信号。
//   待 PM 确认是否需要 mastery 历史快照（需全栈补 history 表）。
// ============================================================
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { TooltipComponent, GridComponent, MarkLineComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useDiagnosisStore } from '@/stores/diagnosis'
import { useChartTheme } from './useChartTheme'

echarts.use([LineChart, TooltipComponent, GridComponent, MarkLineComponent, CanvasRenderer])

const diagnosisStore = useDiagnosisStore()
const { chartTheme, onThemeChange } = useChartTheme()

const chartRef = ref(null)
let chartInstance = null

// 进步数据：诊断分数时间序列
const progressData = computed(() => {
  const history = diagnosisStore.history || []
  // 取有分数的记录
  const scored = history.filter(h => typeof h.score === 'number' && h.score != null)
  return scored.map(h => ({
    score: h.score,
    date: new Date(h.timestamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
    timestamp: h.timestamp,
  }))
})

const hasData = computed(() => progressData.value.length > 0)

// 趋势判断：比较首末
const trendLabel = computed(() => {
  const data = progressData.value
  if (data.length < 2) return null
  const first = data[0].score
  const last = data[data.length - 1].score
  const diff = last - first
  if (diff > 0) return { text: `↑ ${diff}分`, color: '#00d4aa' }
  if (diff < 0) return { text: `↓ ${Math.abs(diff)}分`, color: '#ff6b6b' }
  return { text: '→ 持平', color: '#94a3b8' }
})

function renderChart() {
  if (!chartRef.value || !hasData.value) return

  const t = chartTheme.value
  const d = progressData.value

  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value)
  }

  const scores = d.map(p => p.score)
  const dates = d.map(p => p.date)

  chartInstance.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText, fontSize: 12 },
      formatter: (params) => {
        const p = params[0]
        return `<div style="font-weight:600">第 ${p.dataIndex + 1} 次诊断</div><div style="color:${t.tooltipSub};font-size:11px">${p.axisValue}</div><div style="margin-top:4px">得分：<span style="font-weight:700;color:${t.seriesColors[0]}">${p.value}</span></div>`
      },
    },
    grid: { left: 36, right: 16, top: 16, bottom: 28 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: t.labelColor, fontSize: 10 },
      axisLine: { lineStyle: { color: t.axisLineColor } },
    },
    yAxis: {
      type: 'value',
      min: (val) => Math.max(0, Math.floor(val.min / 10) * 10 - 10),
      max: (val) => Math.min(100, Math.ceil(val.max / 10) * 10 + 10),
      axisLabel: { color: t.labelColor, fontSize: 10 },
      splitLine: { lineStyle: { color: t.splitLineColor } },
    },
    series: [{
      name: '诊断得分',
      type: 'line',
      data: scores,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { color: t.seriesColors[0], width: 2 },
      itemStyle: { color: t.seriesColors[0] },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(0,212,170,0.2)' },
          { offset: 1, color: 'rgba(0,212,170,0)' },
        ]),
      },
      markLine: scores.length >= 2 ? {
        silent: true,
        symbol: 'none',
        lineStyle: { type: 'dashed', color: t.legendColor },
        data: [{ type: 'average', name: '平均' }],
        label: { color: t.legendColor, fontSize: 10 },
      } : undefined,
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

watch(progressData, () => nextTick(() => renderChart()), { deep: true })
</script>

<template>
  <div class="dash-card">
    <div class="dash-card__head">
      <span class="dash-card__icon">🚀</span>
      <div>
        <div class="dash-card__title">进步轨迹</div>
        <div class="dash-card__sub">diagnosis history · 诊断分数趋势</div>
      </div>
      <span v-if="trendLabel" class="trend-badge" :style="{ color: trendLabel.color }">{{ trendLabel.text }}</span>
    </div>
    <div v-if="hasData" ref="chartRef" class="dash-card__chart"></div>
    <div v-else class="dash-card__empty">
      <span>暂无诊断历史</span>
      <span class="dash-card__empty-hint">完成 2 次以上诊断后此处将展示进步轨迹</span>
    </div>
  </div>
</template>

<style scoped>
@import './dash-card.css';

.trend-badge {
  margin-left: auto;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
