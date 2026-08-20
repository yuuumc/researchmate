<script setup>
// ============================================================
// KnowledgeGraphView.vue — B4 知识图谱可视化
// ============================================================
// 功能：
//   1. ECharts 力导向图展示全部知识点节点 + 掌握度热力着色（mastery 驱动）
//   2. 薄弱点脉冲呼吸光晕（视觉强化）
//   3. 点击节点 → 详情面板 + 联动入口（AI辅导/练习题/白板推导/变式练习）
//      薄弱节点额外提供「立即诊断」CTA
//   4. 节点大小按连接数加权，边显示前置依赖关系
//   5. 顶部统计 + 图例
// 验收口径：
//   ① getNodeHeat 三档热力着色（mastery→rgba 色值区间，机械可判）
//   ② 薄弱节点 CTA + 面板按钮跳诊断/练习
//   ③ ECharts force draggable + roam（既有）
//   ④ 空数据态全灰不报错
//   ⑤ vite build 零错（无新依赖）
// ============================================================
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import * as echarts from 'echarts'
import { useProfileStore } from '@/stores/profile'
import { useMasteryData } from '@/composables/useMasteryData'
import { loadGraph, getNodeHeat, getPrerequisiteChain, HEAT_COLORS, HEAT_LEVELS } from '@/utils/knowledgeGraph'
import { getCurrentTheme } from '@/composables/useTheme'

// === 主题色映射（app 默认 dark，ECharts 硬编码暗色在暗背景不可读）===
function getChartTheme() {
  const dark = getCurrentTheme() === 'dark'
  return {
    labelColor:    dark ? '#e5e7eb' : '#374151',
    edgeColor:     dark ? '#4b5563' : '#cbd5e1',
    legendColor:   dark ? '#9ca3af' : '#6b7280',
    tooltipBg:     dark ? 'rgba(31,41,55,0.96)' : 'rgba(255,255,255,0.96)',
    tooltipBorder: dark ? '#374151' : '#e5e7eb',
    tooltipText:   dark ? '#f3f4f6' : '#1f2937',
    tooltipSub:    dark ? '#9ca3af' : '#6b7280'
  }
}

const router = useRouter()
const kgRoute = useRoute()
const profileStore = useProfileStore()
const mastery = useMasteryData()

// === DOM ref ===
const chartRef = ref(null)
let chartInstance = null
let pulseTimer = null

// === 数据 ===
const graphData = ref(null)
const graphEngine = ref(null)
const selectedNode = ref(null)
const loading = ref(true)
const error = ref(null)

// === B4 热力图标（HEAT_COLORS / HEAT_LEVELS 从 knowledgeGraph 引入，单一数据源）===
const HEAT_ICONS = {
  mastered:     '✓',
  intermediate: '◐',
  weak:         '✗',
  unknown:      '○'
}

// === 统计（按热力档计数，与节点着色同源）===
const stats = computed(() => {
  if (!graphEngine.value) return { total: 0, mastered: 0, weak: 0, intermediate: 0, unknown: 0 }
  const counts = { total: 0, mastered: 0, weak: 0, intermediate: 0, unknown: 0 }
  const profile = profileStore.profile
  for (const node of graphEngine.value.nodes.values()) {
    counts.total++
    const h = getNodeHeat(node, profile)
    counts[h.level]++
  }
  return counts
})

// === 选中节点的前置链 ===
const selectedPrerequisites = computed(() => {
  if (!selectedNode.value || !graphEngine.value) return []
  const chain = getPrerequisiteChain(graphEngine.value, selectedNode.value.id)
  return chain.slice(0, 5) // 最多展示 5 个前置
})

// === 选中节点的热力状态 ===
const selectedHeat = computed(() => {
  if (!selectedNode.value) return null
  return getNodeHeat(selectedNode.value, profileStore.profile)
})

// === 加载图数据 ===
async function loadGraphData() {
  try {
    loading.value = true
    const resp = await fetch('/knowledge/textbook/半导体物理-图谱.json')
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json()
    graphData.value = data
    graphEngine.value = loadGraph('半导体物理', data)
  } catch (e) {
    error.value = e.message || '加载知识图谱失败'
    console.error('[KnowledgeGraphView] loadGraphData error:', e)
    loading.value = false       // 错误态：立即收起骨架屏
    return
  }
  // 成功：先 init+setOption 把图画完，再收起骨架屏，
  // 避免容器 display:none→visible 期间闪现空图/旧图
  if (graphEngine.value && !error.value) {
    await nextTick()
    renderChart()
    applyDeepLinkFocus()
    // layoutAnimation: true 时力导向会动画收敛，等初步收敛后再隐藏骨架屏
    setTimeout(() => { if (!error.value) loading.value = false }, 600)
  }
}

// === 全局搜索深链：从 ?focus=<nodeId> 选中并聚焦该知识点 ===
function applyDeepLinkFocus() {
  const focusId = kgRoute.query.focus
  if (!focusId || !graphEngine.value || !chartInstance) return
  // ECharts focusNodeAdjacency 需要节点在 data 数组中的数字索引
  let dataIndex = -1
  let idx = 0
  for (const id of graphEngine.value.nodes.keys()) {
    if (id === focusId) { dataIndex = idx; break }
    idx++
  }
  const node = graphEngine.value.nodes.get(focusId)
  if (!node || dataIndex < 0) return
  selectedNode.value = node
  try {
    chartInstance.dispatchAction({
      type: 'focusNodeAdjacency',
      seriesIndex: 0,
      dataIndex
    })
  } catch (e) {
    // 深链聚焦失败不影响主图
    console.warn('[KnowledgeGraphView] deep-link focus failed:', e)
  }
}

// === 渲染 ECharts 图 ===
function renderChart() {
  if (!chartRef.value || !graphEngine.value) return

  // 销毁旧实例 + 清理脉冲
  if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null }
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }

  chartInstance = echarts.init(chartRef.value)

  const engine = graphEngine.value
  const profile = profileStore.profile
  const t = getChartTheme()

  // 构建 ECharts 节点数据（B4：热力着色 mastery 驱动）
  const nodes = []
  for (const node of engine.nodes.values()) {
    const h = getNodeHeat(node, profile)
    // 计算连接数（入度+出度）作为节点大小权重
    let connections = 0
    for (const edge of engine.edges) {
      if (edge.from === node.id || edge.to === node.id) connections++
    }
    nodes.push({
      id: node.id,
      name: node.name,
      symbolSize: 28 + connections * 4,
      category: HEAT_LEVELS[h.level],
      value: h.mastery != null ? Number((h.mastery * 100).toFixed(0)) : 0,
      itemStyle: {
        color: h.color,
        borderColor: h.level === 'unknown' ? '#d1d5db' : h.color,
        borderWidth: h.level === 'unknown' ? 1.5 : 0,
        shadowBlur: h.level === 'weak' ? 12 : 6,
        shadowColor: h.level === 'weak' ? 'rgba(255,107,107,0.4)' : 'rgba(0,0,0,0.15)'
      },
      label: {
        show: true,
        position: 'bottom',
        fontSize: 12,
        color: t.labelColor,
        fontWeight: h.level === 'weak' || h.level === 'mastered' ? 600 : 400,
        formatter: () => node.name
      },
      // 自定义数据
      _nodeData: node,
      _heat: h
    })
  }

  // 构建 ECharts 边数据
  const links = engine.edges.map(edge => ({
    source: edge.from,
    target: edge.to,
    label: {
      show: false
    },
    lineStyle: {
      color: t.edgeColor,
      width: 1.5,
      curveness: 0.15,
      opacity: 0.6
    }
  }))

  // 分类（图例）
  const categories = [
    { name: HEAT_LEVELS.mastered,     itemStyle: { color: HEAT_COLORS.mastered } },
    { name: HEAT_LEVELS.weak,         itemStyle: { color: HEAT_COLORS.weak } },
    { name: HEAT_LEVELS.intermediate, itemStyle: { color: HEAT_COLORS.intermediate } },
    { name: HEAT_LEVELS.unknown,      itemStyle: { color: HEAT_COLORS.unknown } }
  ]

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { fontSize: 12, color: t.tooltipText },
      formatter: (params) => {
        if (params.dataType === 'node') {
          const node = params.data._nodeData
          const h = params.data._heat
          if (!node) return params.name
          const masteryTxt = h.mastery != null ? `${Math.round(h.mastery * 100)}%` : '—'
          return `
            <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${node.name}</div>
            <div style="color:${t.tooltipSub};font-size:11px;margin-bottom:2px;">${node.chapter || ''}</div>
            <div style="color:${t.tooltipSub};font-size:11px;margin-bottom:6px;max-width:220px;">${node.description || ''}</div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${h.color};"></span>
              <span style="font-size:12px;font-weight:600;color:${h.color};">${HEAT_LEVELS[h.level]}</span>
              <span style="font-size:11px;color:${t.tooltipSub};margin-left:4px;">掌握度 ${masteryTxt}</span>
            </div>
          `
        }
        if (params.dataType === 'edge') {
          const edge = engine.edges.find(e => e.from === params.data.source && e.to === params.data.target)
          return edge ? `<div style="font-size:11px;color:${t.tooltipSub};max-width:200px;">${edge.reason || '前置依赖'}</div>` : '前置依赖'
        }
        return params.name
      }
    },
    legend: {
      data: categories.map(c => c.name),
      bottom: 10,
      textStyle: { fontSize: 12, color: t.legendColor },
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 16
    },
    series: [{
      type: 'graph',
      layout: 'force',
      data: nodes,
      links: links,
      categories: categories,
      roam: true,
      draggable: true,
      focusNodeAdjacency: true,
      label: {
        show: true,
        position: 'bottom',
        fontSize: 12,
        color: t.labelColor
      },
      edgeLabel: {
        show: false,
        fontSize: 10,
        color: t.legendColor,
        formatter: (params) => {
          const edge = engine.edges.find(e => e.from === params.data.source && e.to === params.data.target)
          return edge ? edge.reason : ''
        }
      },
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: [0, 7],
      force: {
        repulsion: 260,
        edgeLength: [80, 140],
        gravity: 0.08,
        friction: 0.6,
        layoutAnimation: true
      },
      emphasis: {
        focus: 'adjacency',
        lineStyle: {
          width: 3,
          color: '#00d4aa',
          opacity: 0.8
        },
        label: {
          fontSize: 13,
          fontWeight: 600
        }
      },
      lineStyle: {
        color: t.edgeColor,
        width: 1.5,
        curveness: 0.15,
        opacity: 0.5
      }
    }]
  }

  chartInstance.setOption(option)

  // 点击事件
  chartInstance.on('click', (params) => {
    if (params.dataType === 'node' && params.data._nodeData) {
      selectedNode.value = params.data._nodeData
    }
  })

  // B4：薄弱点脉冲（呼吸光晕，仅 weak 节点 shadowBlur 周期切换，不扰动布局）
  startPulse(nodes)
}

// === B4：薄弱点脉冲 ===
// 全量数组下发（同序 + id 匹配）：无论 ECharts graph data merge 按 id 还是按 index
// 都能正确命中 weak 节点；id 匹配同时保留力导向位置，避免脉冲触发布局抖动。
// 非薄弱节点传 {id}（merge 保留既有 itemStyle），薄弱节点覆盖 shadowBlur/shadowColor。
function startPulse(nodes) {
  if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null }
  const hasWeak = nodes.some(n => n._heat && n._heat.level === 'weak')
  if (!hasWeak) return
  let phase = false
  pulseTimer = setInterval(() => {
    if (!chartInstance) { clearInterval(pulseTimer); pulseTimer = null; return }
    phase = !phase
    const patchData = nodes.map(n => {
      if (!n._heat || n._heat.level !== 'weak') return { id: n.id }
      return {
        id: n.id,
        itemStyle: {
          ...n.itemStyle,
          shadowBlur: phase ? 26 : 12,
          shadowColor: 'rgba(255,107,107,0.65)'
        }
      }
    })
    try {
      chartInstance.setOption({ series: [{ data: patchData }] })
    } catch (e) {
      // 脉冲失败不阻断主图渲染
      console.warn('[KnowledgeGraphView] pulse setOption failed:', e)
    }
  }, 850)
}

// === 联动跳转 ===
function goTutor() {
  if (!selectedNode.value) return
  router.push({
    path: '/chat',
    query: { q: `帮我讲解${selectedNode.value.name}的知识点` }
  })
}

function goPractice() {
  if (!selectedNode.value) return
  router.push({
    path: '/chat',
    query: { q: `帮我出几道${selectedNode.value.name}的练习题` }
  })
}

function goDerivation() {
  router.push('/derivation')
}

function goVariant() {
  if (!selectedNode.value) return
  router.push({
    path: `/variant/${encodeURIComponent(selectedNode.value.name)}`
  })
}

// B4：薄弱节点立即诊断（诊断为会话级做题模式，无 per-topic 预填入口，跳诊断页）
function goDiagnose() {
  router.push('/diagnosis/session')
}

function closeDetail() {
  selectedNode.value = null
}

// === 主题切换重渲染 ===
function handleThemeChange() {
  if (graphEngine.value) {
    renderChart()
  }
}

// === 响应式 ===
function handleResize() {
  if (chartInstance) {
    chartInstance.resize()
  }
}

// === 主题变化重渲染（mastery 变更：诊断/练习/衰减即时刷新热力）===
// B4：knowledge_state 为主、ability_stars 为兜底源，任一变更即重渲染
watch(
  () => [profileStore.profile?.knowledge_state, profileStore.profile?.ability_stars],
  () => {
    if (graphEngine.value) {
      renderChart()
    }
  },
  { deep: true }
)

onMounted(async () => {
  await nextTick()
  await loadGraphData()
  window.addEventListener('resize', handleResize)
  window.addEventListener('theme-changed', handleThemeChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('theme-changed', handleThemeChange)
  if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null }
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})
</script>

<template>
  <div class="kg-view">
    <!-- 顶部统计栏 -->
    <div class="kg-header">
      <div class="kg-header-left">
        <h1 class="kg-title">知识图谱</h1>
        <p class="kg-subtitle">半导体物理 · 全部知识点掌握度可视化</p>
      </div>
      <div class="kg-stats">
        <div class="kg-stat-item">
          <span class="kg-stat-num">{{ stats.total }}</span>
          <span class="kg-stat-label">知识点</span>
        </div>
        <div class="kg-stat-item kg-stat--mastered">
          <span class="kg-stat-num">{{ stats.mastered }}</span>
          <span class="kg-stat-label">已掌握</span>
        </div>
        <div class="kg-stat-item kg-stat--learning">
          <span class="kg-stat-num">{{ stats.intermediate }}</span>
          <span class="kg-stat-label">学习中</span>
        </div>
        <div class="kg-stat-item kg-stat--weak">
          <span class="kg-stat-num">{{ stats.weak }}</span>
          <span class="kg-stat-label">薄弱</span>
        </div>
        <div class="kg-stat-item kg-stat--unknown">
          <span class="kg-stat-num">{{ stats.unknown }}</span>
          <span class="kg-stat-label">未诊断</span>
        </div>
      </div>
    </div>

    <!-- 图谱区域 -->
    <div class="kg-chart-container">
      <!-- 加载态 -->
      <div v-if="loading" class="kg-loading">
        <div class="kg-spinner"></div>
        <span>加载知识图谱中...</span>
      </div>

      <!-- 错误态 -->
      <div v-else-if="error" class="kg-error">
        <span class="kg-error-icon">!</span>
        <span>加载失败：{{ error }}</span>
      </div>

      <!-- ECharts 容器 -->
      <div ref="chartRef" class="kg-chart"></div>

      <!-- 节点详情面板 -->
      <transition name="kg-detail-slide">
        <div v-if="selectedNode" class="kg-detail-panel">
          <div class="kg-detail-header">
            <div class="kg-detail-title-row">
              <span
                class="kg-detail-mastery-dot"
                :style="{ background: selectedHeat ? selectedHeat.color : '#9ca3af' }"
              ></span>
              <h2 class="kg-detail-name">{{ selectedNode.name }}</h2>
              <span
                v-if="selectedHeat"
                class="kg-detail-mastery-tag"
                :style="{ color: selectedHeat.color, background: selectedHeat.color + '15' }"
              >
                {{ HEAT_ICONS[selectedHeat.level] }} {{ HEAT_LEVELS[selectedHeat.level] }}
              </span>
            </div>
            <button class="kg-detail-close" @click="closeDetail" aria-label="关闭">×</button>
          </div>

          <div class="kg-detail-body">
            <!-- 基本信息 -->
            <div class="kg-detail-section">
              <div class="kg-detail-meta">
                <span class="kg-detail-chapter">{{ selectedNode.chapter }}</span>
                <span
                  v-if="selectedHeat && selectedHeat.mastery != null"
                  class="kg-detail-mastery-pct"
                  :style="{ color: selectedHeat.color }"
                >掌握度 {{ Math.round(selectedHeat.mastery * 100) }}%</span>
              </div>
              <p class="kg-detail-desc">{{ selectedNode.description }}</p>
              <div v-if="selectedNode.keywords && selectedNode.keywords.length" class="kg-detail-keywords">
                <span
                  v-for="kw in selectedNode.keywords"
                  :key="kw"
                  class="kg-keyword-chip"
                >{{ kw }}</span>
              </div>
            </div>

            <!-- B4：薄弱节点立即诊断 CTA -->
            <div v-if="selectedHeat && selectedHeat.level === 'weak'" class="kg-detail-section">
              <button class="kg-weak-cta" @click="goDiagnose">
                <span class="kg-weak-cta-icon">⚡</span>
                <span>立即诊断此知识点</span>
              </button>
            </div>

            <!-- 前置知识链 -->
            <div v-if="selectedPrerequisites.length > 0" class="kg-detail-section">
              <div class="kg-detail-section-title">
                <span class="kg-detail-section-icon">←</span>
                前置知识
              </div>
              <div class="kg-prereq-list">
                <div
                  v-for="(item, i) in selectedPrerequisites"
                  :key="i"
                  class="kg-prereq-item"
                  @click="selectedNode = item.node"
                >
                  <span class="kg-prereq-name">{{ item.node.name }}</span>
                  <span
                    class="kg-prereq-status"
                    :style="{ color: getNodeHeat(item.node, profileStore.profile).color }"
                  >
                    {{ HEAT_ICONS[getNodeHeat(item.node, profileStore.profile).level] }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 联动入口 -->
            <div class="kg-detail-section">
              <div class="kg-detail-section-title">
                <span class="kg-detail-section-icon">→</span>
                学习入口
              </div>
              <div class="kg-action-grid">
                <button class="kg-action-btn kg-action--tutor" @click="goTutor">
                  <span class="kg-action-icon">💬</span>
                  <span class="kg-action-text">AI 辅导</span>
                </button>
                <button class="kg-action-btn kg-action--practice" @click="goPractice">
                  <span class="kg-action-icon">📝</span>
                  <span class="kg-action-text">出练习题</span>
                </button>
                <button class="kg-action-btn kg-action--derivation" @click="goDerivation">
                  <span class="kg-action-icon">✏️</span>
                  <span class="kg-action-text">白板推导</span>
                </button>
                <button class="kg-action-btn kg-action--variant" @click="goVariant">
                  <span class="kg-action-icon">🔄</span>
                  <span class="kg-action-text">变式练习</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </transition>

      <!-- 操作提示 -->
      <div v-if="!loading && !error && !selectedNode" class="kg-hint">
        <span>点击节点查看详情 · 拖拽移动节点 · 滚轮缩放</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kg-view {
  min-height: calc(100vh - 72px);
  display: flex;
  flex-direction: column;
  padding: 24px 32px 32px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

/* === 顶部统计栏 === */
.kg-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--color-border-subtle, #e5e7eb);
}

.kg-header-left {
  flex: 1;
  min-width: 0;
}

.kg-title {
  font-family: var(--font-serif, Georgia, serif);
  font-size: 28px;
  font-weight: 700;
  color: var(--color-ink-900, #111827);
  margin: 0 0 4px;
}

.kg-subtitle {
  font-size: 13px;
  color: var(--color-fg-secondary, #6b7280);
  margin: 0;
}

.kg-stats {
  display: flex;
  gap: 20px;
  flex-shrink: 0;
}

.kg-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.kg-stat-num {
  font-family: var(--font-serif, Georgia, serif);
  font-size: 24px;
  font-weight: 700;
  color: var(--color-ink-900, #111827);
  line-height: 1;
}

.kg-stat-label {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--color-fg-muted, #9ca3af);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.kg-stat--mastered .kg-stat-num { color: #00a07d; }
.kg-stat--learning .kg-stat-num { color: #c79100; }
.kg-stat--weak .kg-stat-num { color: #e85555; }
.kg-stat--unknown .kg-stat-num { color: #9ca3af; }

/* === 图表容器 === */
.kg-chart-container {
  position: relative;
  flex: 1;
  min-height: 520px;
  background: var(--color-bg-elevated, #fff);
  border: 1px solid var(--color-border-subtle, #e5e7eb);
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
}

.kg-chart {
  width: 100%;
  height: 100%;
  min-height: 520px;
}

/* === 加载 / 错误态 === */
.kg-loading,
.kg-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-fg-muted, #9ca3af);
  font-size: 14px;
  background: var(--color-bg-elevated, #fff);
}

.kg-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border-subtle, #e5e7eb);
  border-top-color: #00d4aa;
  border-radius: 50%;
  animation: kg-spin 0.8s linear infinite;
}

@keyframes kg-spin {
  to { transform: rotate(360deg); }
}

.kg-error-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 107, 107, 0.1);
  color: #e85555;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
}

/* === 节点详情面板 === */
.kg-detail-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 320px;
  max-height: calc(100% - 32px);
  background: var(--color-bg-elevated, #fff);
  border: 1px solid var(--color-border-subtle, #e5e7eb);
  border-radius: var(--radius-lg, 12px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 10;
}

.kg-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--color-border-subtle, #e5e7eb);
}

.kg-detail-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}

.kg-detail-mastery-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.kg-detail-name {
  font-family: var(--font-serif, Georgia, serif);
  font-size: 16px;
  font-weight: 700;
  color: var(--color-ink-900, #111827);
  margin: 0;
}

.kg-detail-mastery-tag {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full, 999px);
}

.kg-detail-close {
  background: none;
  border: none;
  font-size: 22px;
  color: var(--color-fg-muted, #9ca3af);
  cursor: pointer;
  padding: 0 0 0 8px;
  line-height: 1;
  transition: color 0.2s;
  flex-shrink: 0;
}

.kg-detail-close:hover {
  color: var(--color-ink-900, #111827);
}

.kg-detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.kg-detail-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kg-detail-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kg-detail-chapter {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--color-fg-muted, #9ca3af);
  padding: 2px 8px;
  background: var(--color-bg-sunken, #f4f6fa);
  border-radius: var(--radius-sm, 4px);
}

.kg-detail-mastery-pct {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 600;
}

.kg-detail-desc {
  font-size: 13px;
  color: var(--color-ink-700, #374151);
  line-height: 1.6;
  margin: 0;
}

.kg-detail-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.kg-keyword-chip {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  padding: 2px 6px;
  background: var(--color-bg-sunken, #f4f6fa);
  color: var(--color-fg-secondary, #6b7280);
  border-radius: var(--radius-sm, 4px);
}

.kg-detail-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-ink-700, #374151);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.kg-detail-section-icon {
  color: var(--color-fg-muted, #9ca3af);
}

/* === B4 薄弱节点立即诊断 CTA === */
.kg-weak-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 14px;
  background: linear-gradient(135deg, #ff6b6b, #ff8e53);
  color: #fff;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 14px rgba(255, 107, 107, 0.35);
}

.kg-weak-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 107, 107, 0.45);
}

.kg-weak-cta-icon {
  font-size: 16px;
}

/* === 前置知识链 === */
.kg-prereq-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kg-prereq-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--color-bg-sunken, #f4f6fa);
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  transition: background 0.2s;
}

.kg-prereq-item:hover {
  background: rgba(0, 212, 170, 0.06);
}

.kg-prereq-name {
  font-size: 12px;
  color: var(--color-ink-900, #111827);
}

.kg-prereq-status {
  font-size: 14px;
  font-weight: 700;
}

/* === 联动按钮 === */
.kg-action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.kg-action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: var(--color-bg-sunken, #f4f6fa);
  border: 1px solid var(--color-border-subtle, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.kg-action-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.kg-action-btn:hover .kg-action-icon {
  transform: scale(1.15);
}

.kg-action-icon {
  font-size: 20px;
  transition: transform 0.2s;
}

.kg-action-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-ink-700, #374151);
}

.kg-action--tutor:hover { border-color: #00d4aa; background: rgba(0, 212, 170, 0.06); }
.kg-action--practice:hover { border-color: #4d9de0; background: rgba(77, 157, 224, 0.06); }
.kg-action--derivation:hover { border-color: #9b59b6; background: rgba(155, 89, 182, 0.06); }
.kg-action--variant:hover { border-color: #ffd166; background: rgba(255, 209, 102, 0.08); }

/* === 操作提示 === */
.kg-hint {
  position: absolute;
  bottom: 50px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 16px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: var(--radius-full, 999px);
  font-size: 11px;
  color: var(--color-fg-muted, #9ca3af);
  pointer-events: none;
  white-space: nowrap;
}

/* === 详情面板滑入动画 === */
.kg-detail-slide-enter-active,
.kg-detail-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.kg-detail-slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.kg-detail-slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

/* === 响应式 === */
@media (max-width: 768px) {
  .kg-view {
    padding: 16px 12px 24px;
  }

  .kg-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .kg-stats {
    gap: 14px;
  }

  .kg-stat-num {
    font-size: 20px;
  }

  .kg-detail-panel {
    width: calc(100% - 24px);
    right: 12px;
    top: 12px;
    max-height: 60%;
  }

  .kg-chart-container {
    min-height: 400px;
  }

  .kg-chart {
    min-height: 400px;
  }
}
</style>
