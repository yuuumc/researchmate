<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { useDiagnosisStore } from '@/stores/diagnosis'
import KnowledgeGraph from '@/components/KnowledgeGraph.vue'
import DiagnosisReport from '@/components/DiagnosisReport.vue'
// 树摇：只引入需要的 ECharts 模块（核心 + LineChart + 必要组件）
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  MarkPointComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  MarkPointComponent,
  CanvasRenderer
])

const diagStore = useDiagnosisStore()
const history = computed(() => diagStore.history)

// 趋势图数据：X = 诊断时间，Y = 平均 ability_stars
const trendData = computed(() => {
  const list = (history.value || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
  return list
    .map((h) => {
      const snap = h.ability_stars_snapshot || {}
      const vals = Object.values(snap).filter((v) => Number.isFinite(v))
      const avg = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null
      return {
        time: h.timestamp,
        score: h.score ?? null,
        avg_stars: avg,
        weak: (h.weak_points || []).length
      }
    })
    .filter((d) => d.avg_stars != null)
})

const trendOption = computed(() => {
  if (trendData.value.length === 0) return null
  const x = trendData.value.map((d) => new Date(d.time).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }))
  const yStars = trendData.value.map((d) => Number(d.avg_stars.toFixed(2)))
  const yScore = trendData.value.map((d) => d.score ?? null)
  return {
    grid: { top: 36, right: 24, bottom: 32, left: 40 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 30, 51, 0.95)',
      borderColor: 'transparent',
      textStyle: { color: '#f4f6fa', fontSize: 12 },
      formatter: (params) => {
        if (!params?.length) return ''
        const i = params[0].dataIndex
        const d = trendData.value[i]
        const lines = params.map((p) => `${p.marker} ${p.seriesName}: ${p.value}`).join('<br/>')
        return `${x[i]}<br/>${lines}<br/><span style="color:#7a8ba3">薄弱点: ${d.weak}</span>`
      }
    },
    xAxis: {
      type: 'category',
      data: x,
      axisLine: { lineStyle: { color: '#dde2eb' } },
      axisLabel: { color: '#7a8ba3', fontSize: 11, fontFamily: 'var(--font-mono)' }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 5,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#e8ecf3', type: 'dashed' } },
      axisLabel: { color: '#7a8ba3', fontSize: 11, fontFamily: 'var(--font-mono)' }
    },
    series: [
      {
        name: '平均能力星',
        type: 'line',
        data: yStars,
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: '#00d4aa' },
        lineStyle: { width: 2.5, color: '#00d4aa' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 212, 170, 0.25)' },
              { offset: 1, color: 'rgba(0, 212, 170, 0)' }
            ]
          }
        },
        markPoint: {
          symbol: 'pin',
          symbolSize: 36,
          data: yStars.map((v) => ({ type: 'max', value: v })),
          itemStyle: { color: '#00d4aa' },
          label: { fontSize: 10, color: '#fff', fontWeight: 700 }
        }
      },
      {
        name: '诊断分数',
        type: 'line',
        data: yScore,
        smooth: true,
        symbol: 'diamond',
        symbolSize: 7,
        yAxisIndex: 0,
        itemStyle: { color: '#4d9de0' },
        lineStyle: { width: 1.5, type: 'dashed', color: '#4d9de0' }
      }
    ]
  }
})

// ECharts 实例管理
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null

function initChart() {
  if (!chartRef.value) return
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value, null, { renderer: 'canvas' })
  }
  if (trendOption.value) {
    chartInstance.setOption(trendOption.value, true)
  } else {
    chartInstance.clear()
  }
}

function handleResize() {
  if (chartInstance) chartInstance.resize()
}

onMounted(() => {
  nextTick(initChart)
  resizeObserver = new ResizeObserver(handleResize)
  if (chartRef.value) resizeObserver.observe(chartRef.value)
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})

watch(trendOption, () => nextTick(initChart))
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

      <!-- v1.5: 分数趋势图 -->
      <section class="trend-section">
        <div class="trend-header">
          <div>
            <div class="card-title">能力趋势</div>
            <div class="card-en">Ability Trend</div>
          </div>
          <div v-if="trendData.length > 0" class="trend-stats">
            <span class="trend-stat">
              <span class="trend-stat-num">{{ trendData.length }}</span>
              <span class="trend-stat-label">次诊断</span>
            </span>
            <span class="trend-stat" v-if="trendData.length >= 2">
              <span class="trend-stat-num" :class="trendData[trendData.length-1].avg_stars > trendData[0].avg_stars ? 'up' : 'down'">
                {{ trendData[trendData.length-1].avg_stars > trendData[0].avg_stars ? '↑' : '↓' }}
                {{ Math.abs(trendData[trendData.length-1].avg_stars - trendData[0].avg_stars).toFixed(2) }}
              </span>
              <span class="trend-stat-label">能力星变化</span>
            </span>
          </div>
        </div>
        <div v-if="trendData.length === 0" class="trend-empty">
          <div class="trend-empty-icon">📈</div>
          <div class="trend-empty-title">还没有诊断记录</div>
          <div class="trend-empty-desc">去对话中输入「我 XX 科考了 XX 分，错题…」触发诊断 Agent</div>
        </div>
        <div v-else ref="chartRef" class="trend-chart" role="img" aria-label="能力趋势图"></div>
      </section>

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
              <span class="item-time">{{ new Date(item.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }}</span>
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

/* === v1.5: 能力趋势图 === */
.trend-section {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: 20px 22px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-sm);
  animation: float-up 0.5s var(--ease-out) both;
}

.trend-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 16px;
  gap: 12px;
}

.trend-stats {
  display: flex;
  gap: 16px;
}

.trend-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-tertiary);
}

.trend-stat-num {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
  color: var(--color-ink-900);
  line-height: 1;
}

.trend-stat-num.up { color: var(--color-success); }
.trend-stat-num.down { color: var(--color-error); }

.trend-stat-label {
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.trend-chart {
  width: 100%;
  height: 220px;
}

.trend-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 32px 12px;
  color: var(--color-fg-tertiary);
}

.trend-empty-icon {
  font-size: 32px;
  opacity: 0.7;
}

.trend-empty-title {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-700);
}

.trend-empty-desc {
  font-size: 12px;
  color: var(--color-fg-muted);
  text-align: center;
  max-width: 320px;
  line-height: 1.5;
}

@keyframes float-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

/* === 移动端响应式 === */
@media (max-width: 768px) {
  .history-content { padding: 24px 16px 48px; }
  .page-title { font-size: 26px; }
  .page-subtitle { font-size: 12px; }
  .trend-section { padding: 16px 18px; }
  .trend-header { flex-direction: column; align-items: flex-start; gap: 8px; }
  .trend-stats { width: 100%; justify-content: space-between; }
  .trend-chart { height: 180px; }
  .history-item { gap: 12px; }
  .item-node { width: 32px; height: 32px; }
  .item-header { flex-wrap: wrap; gap: 6px; }
  .item-score { margin-left: 0; }
}

@media (max-width: 375px) {
  .history-content { padding: 20px 12px 40px; }
  .page-title { font-size: 22px; }
  .trend-section { padding: 14px 14px; }
  .trend-stat-num { font-size: 16px; }
}
</style>