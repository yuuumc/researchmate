<script setup>
// ============================================================
// B5 卡片3：薄弱点分布
// 数据源：useMasteryData().abilityStars（type 分类：weak/developing/strength）
//         + weakPoints（诊断唯一权威源）
// 展示：按掌握档位分布的环形图 + 薄弱点列表
// ============================================================
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useMasteryData } from '@/composables/useMasteryData'
import { useChartTheme } from './useChartTheme'

echarts.use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer])

const { abilityStars, weakPoints, weakPointCount, strongCount, developingCount, weakStarCount } = useMasteryData()
const { chartTheme, onThemeChange } = useChartTheme()

const chartRef = ref(null)
let chartInstance = null

// 分布数据：按热力档计数
const distribution = computed(() => {
  const weak = weakStarCount.value
  const developing = developingCount.value
  const strength = strongCount.value
  const total = weak + developing + strength
  return { weak, developing, strength, total }
})

const hasData = computed(() => distribution.value.total > 0)

function renderChart() {
  if (!chartRef.value || !hasData.value) return

  const t = chartTheme.value
  const d = distribution.value

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
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      bottom: 0,
      textStyle: { color: t.legendColor, fontSize: 11 },
      itemWidth: 10,
      itemHeight: 10,
    },
    series: [{
      type: 'pie',
      radius: ['40%', '65%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      label: { show: false },
      labelLine: { show: false },
      data: [
        { value: d.strength, name: '已掌握', itemStyle: { color: t.seriesColors[0] } },
        { value: d.developing, name: '发展中', itemStyle: { color: t.seriesColors[1] } },
        { value: d.weak, name: '薄弱', itemStyle: { color: t.seriesColors[2] } },
      ].filter(item => item.value > 0),
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

watch(distribution, () => nextTick(() => renderChart()), { deep: true })
</script>

<template>
  <div class="dash-card">
    <div class="dash-card__head">
      <span class="dash-card__icon">📊</span>
      <div>
        <div class="dash-card__title">薄弱点分布</div>
        <div class="dash-card__sub">ability_stars · 星级分类</div>
      </div>
    </div>
    <div v-if="hasData" ref="chartRef" class="dash-card__chart"></div>
    <div v-else class="dash-card__empty">
      <span>暂无能力星级数据</span>
      <span class="dash-card__empty-hint">完成诊断后此处将展示各档位知识点分布</span>
    </div>
    <div v-if="hasData && weakPoints.length > 0" class="weak-list">
      <div class="weak-list__title">薄弱知识点（{{ weakPointCount }}）</div>
      <div class="weak-list__items">
        <span v-for="wp in weakPoints.slice(0, 6)" :key="wp" class="weak-chip">{{ wp }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import './dash-card.css';

.weak-list {
  margin-top: 10px;
  border-top: 1px dashed var(--border-subtle, rgba(255,255,255,0.08));
  padding-top: 8px;
}

.weak-list__title {
  font-size: 11px;
  color: var(--text-secondary, #94a3b8);
  margin-bottom: 6px;
}

.weak-list__items {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.weak-chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 107, 107, 0.1);
  color: #ff6b6b;
  white-space: nowrap;
}
</style>
