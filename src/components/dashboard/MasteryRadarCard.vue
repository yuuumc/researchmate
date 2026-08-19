<script setup>
// ============================================================
// B5 卡片1：掌握度雷达
// 数据源：profileStore.profile.knowledge_state[topic].mastery (0-1)
//         缺失时兜底 ability_stars 星值/5（与 B4 getNodeHeat 同源）
// 验收②：mastery 数据源走 knowledge_state.mastery（backlog① 统一刻度）
// ============================================================
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { RadarChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useMasteryData } from '@/composables/useMasteryData'
import { useChartTheme } from './useChartTheme'

echarts.use([RadarChart, TooltipComponent, LegendComponent, CanvasRenderer])

const { knowledgeState, abilityStars } = useMasteryData()
const { chartTheme, onThemeChange } = useChartTheme()

const chartRef = ref(null)
let chartInstance = null

// 雷达维度：从 knowledge_state 取所有知识点，mastery 缺失时用 ability_stars 兜底
const radarData = computed(() => {
  const ks = knowledgeState.value || {}
  const stars = abilityStars.value || []

  // 优先用 knowledge_state 的 keys
  const topics = Object.keys(ks)
  if (topics.length === 0) {
    // 兜底：从 abilityStars 取（star/5 → 0-1 mastery）
    return stars.map(a => ({ topic: a.topic, mastery: a.star / 5 }))
  }

  return topics.map(topic => {
    const entry = ks[topic]
    let m = entry?.mastery
    if (typeof m !== 'number' || Number.isNaN(m)) {
      // 兜底：ability_stars 星值/5
      const star = stars.find(a => a.topic === topic)?.star
      m = star != null ? star / 5 : null
    }
    return { topic, mastery: m }
  }).filter(d => d.mastery != null)
})

const hasData = computed(() => radarData.value.length > 0)

function renderChart() {
  if (!chartRef.value || !hasData.value) return

  const t = chartTheme.value
  const data = radarData.value
  // 雷达维度最多 12 个（超出取 mastery 最低的 12 个，避免维度太密）
  const dims = data.length > 12
    ? [...data].sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0)).slice(0, 12)
    : data

  const indicator = dims.map(d => ({
    name: d.topic.length > 6 ? d.topic.slice(0, 6) + '…' : d.topic,
    max: 1,
    min: 0,
  }))

  const values = dims.map(d => d.mastery ?? 0)

  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value)
  }

  chartInstance.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText, fontSize: 12 },
      formatter: (params) => {
        const vals = params.value
        let html = `<div style="font-weight:600;margin-bottom:4px">${params.name}</div>`
        dims.forEach((d, i) => {
          const pct = Math.round((vals[i] ?? 0) * 100)
          html += `<div style="color:${t.tooltipSub};font-size:11px">${d.topic}: ${pct}%</div>`
        })
        return html
      },
    },
    radar: {
      indicator,
      center: ['50%', '55%'],
      radius: '65%',
      splitNumber: 4,
      axisName: {
        color: t.labelColor,
        fontSize: 10,
        overflow: 'truncate',
        width: 50,
      },
      splitLine: { lineStyle: { color: t.splitLineColor } },
      splitArea: { areaStyle: { color: ['transparent', 'transparent'] } },
      axisLine: { lineStyle: { color: t.axisLineColor } },
    },
    series: [{
      type: 'radar',
      data: [{
        value: values,
        name: '掌握度',
        areaStyle: { color: 'rgba(0,212,170,0.15)' },
        lineStyle: { color: t.seriesColors[0], width: 2 },
        itemStyle: { color: t.seriesColors[0] },
        symbolSize: 4,
      }],
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

watch(radarData, () => nextTick(() => renderChart()), { deep: true })
</script>

<template>
  <div class="dash-card">
    <div class="dash-card__head">
      <span class="dash-card__icon">🎯</span>
      <div>
        <div class="dash-card__title">掌握度雷达</div>
        <div class="dash-card__sub">knowledge_state.mastery · 0–1 刻度</div>
      </div>
    </div>
    <div v-if="hasData" ref="chartRef" class="dash-card__chart"></div>
    <div v-else class="dash-card__empty">
      <span>暂无掌握度数据</span>
      <span class="dash-card__empty-hint">完成一次诊断或练习后此处将展示各知识点掌握度</span>
    </div>
  </div>
</template>

<style scoped>
@import './dash-card.css';
</style>
