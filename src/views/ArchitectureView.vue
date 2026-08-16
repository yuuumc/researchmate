<script setup>
// ============================================================
// B5 架构看板 — 多 Agent 架构透明化展示页
// 数据源：GET /api/agent/traces（agent_traces 表，真实任务流落库，非 mock）
// 展示：全览统计 + Agent 角色卡 + 任务流转时间线（产出物可点击/内联展开）
// ============================================================
import { ref, computed, onMounted } from 'vue'
import { fetchAgentTraces } from '@/api/agent'
import {
  normalizeTrace,
  aggregateByAgent,
  overviewStats,
  fmtTime,
  fmtPercent,
  fmtTokens,
  statusMeta,
  roleMeta,
  extractLinks
} from '@/utils/architecture'

const loading = ref(false)
const error = ref('')
const traces = ref([])
const lastRefresh = ref(null)
const expandedId = ref(null)

const stats = computed(() => overviewStats(traces.value))
const agentCards = computed(() => aggregateByAgent(traces.value))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await fetchAgentTraces({ limit: 100 })
    traces.value = (data.traces || []).map(normalizeTrace)
    lastRefresh.value = new Date()
  } catch (e) {
    error.value = (e && e.message) || '加载失败'
    traces.value = []
  } finally {
    loading.value = false
  }
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id
}

function outputLinks(trace) {
  return extractLinks(trace.output_summary)
}

function toolName(call) {
  if (!call || typeof call !== 'object') return String(call ?? '')
  return call.name || call.tool || call.tool_name || JSON.stringify(call)
}

onMounted(load)
</script>

<template>
  <div class="arch-page">
    <!-- 页头 -->
    <div class="arch-header">
      <div class="arch-header__text">
        <h1 class="arch-title">多 Agent 架构看板</h1>
        <p class="arch-subtitle">
          展示各 Agent 角色、真实任务流转状态与产出物——数据来自 Agent 调用链路的真实落库记录（agent_traces），非演示 mock。
        </p>
      </div>
      <button class="arch-refresh" :disabled="loading" @click="load">
        <span :class="{ 'arch-refresh__spin': loading }">⟳</span> {{ loading ? '加载中' : '刷新' }}
      </button>
    </div>

    <!-- 错误态 -->
    <div v-if="error" class="arch-error">
      <span class="arch-error__icon">⚠</span>
      <span>看板数据加载失败：{{ error }}。请稍后点击「刷新」重试。</span>
    </div>

    <template v-else>
      <!-- 全览统计 -->
      <div class="arch-stats">
        <div class="stat-card">
          <div class="stat-value">{{ stats.totalCalls }}</div>
          <div class="stat-label">真实调用记录</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.agentCount }}</div>
          <div class="stat-label">活跃 Agent 角色</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ fmtPercent(stats.successRate) }}</div>
          <div class="stat-label">调用成功率</div>
        </div>
        <div class="stat-card">
          <div class="stat-value stat-value--sm">{{ stats.lastCallAt ? fmtTime(stats.lastCallAt) : '—' }}</div>
          <div class="stat-label">最近一次调用</div>
        </div>
      </div>

      <!-- Agent 角色卡 -->
      <h2 class="arch-section-title">Agent 角色</h2>
      <div v-if="agentCards.length === 0 && !loading" class="arch-empty">
        暂无真实调用记录。完成一次诊断 / 练习 / 对话后，这里会展示各 Agent 的调用情况。
      </div>
      <div v-else class="arch-agents">
        <div
          v-for="card in agentCards"
          :key="card.role"
          class="agent-card"
          :style="{ '--agent-color': card.meta.color }"
        >
          <div class="agent-card__head">
            <span class="agent-card__icon">{{ card.meta.icon }}</span>
            <div class="agent-card__name">
              <div class="agent-card__label">{{ card.meta.label }}</div>
              <div class="agent-card__role">{{ card.role }}</div>
            </div>
          </div>
          <div class="agent-card__desc">{{ card.meta.desc }}</div>
          <div class="agent-card__metrics">
            <div class="metric"><span class="metric-value">{{ card.total }}</span><span class="metric-label">调用</span></div>
            <div class="metric"><span class="metric-value">{{ fmtPercent(card.successRate) }}</span><span class="metric-label">成功率</span></div>
            <div class="metric"><span class="metric-value">{{ card.totalTokens || '—' }}</span><span class="metric-label">tokens</span></div>
          </div>
          <div class="agent-card__foot">最近活跃：{{ card.lastActive ? fmtTime(card.lastActive) : '—' }}</div>
        </div>
      </div>

      <!-- 任务流转时间线 -->
      <h2 class="arch-section-title">任务流转记录</h2>
      <div v-if="traces.length === 0 && !loading" class="arch-empty">
        暂无任务流转记录。
      </div>
      <div v-else class="arch-timeline">
        <div
          v-for="(trace, i) in traces"
          :key="trace.id || i"
          class="trace-item"
          :class="statusMeta(trace.status).className"
        >
          <div class="trace-item__main" @click="toggleExpand(trace.id || i)">
            <span class="trace-item__icon" :style="{ color: roleMeta(trace.agent_role).color }">
              {{ roleMeta(trace.agent_role).icon }}
            </span>
            <div class="trace-item__info">
              <div class="trace-item__line1">
                <span class="trace-item__role">{{ roleMeta(trace.agent_role).label }}</span>
                <span v-if="trace.action" class="trace-item__action">{{ trace.action }}</span>
                <span class="trace-item__status" :class="statusMeta(trace.status).className">
                  {{ statusMeta(trace.status).label }}
                </span>
              </div>
              <div v-if="trace.input_summary" class="trace-item__summary">{{ trace.input_summary }}</div>
            </div>
            <div class="trace-item__right">
              <span v-if="fmtTokens(trace.usage)" class="trace-item__tokens">{{ fmtTokens(trace.usage) }}</span>
              <span class="trace-item__time">{{ fmtTime(trace.created_at) }}</span>
              <span class="trace-item__chevron" :class="{ rotated: expandedId === (trace.id || i) }">›</span>
            </div>
          </div>

          <!-- 展开详情：输出摘要 + 产出物链接 + 工具调用链 -->
          <div v-if="expandedId === (trace.id || i)" class="trace-item__detail">
            <div v-if="trace.output_summary" class="detail-block">
              <div class="detail-label">产出摘要</div>
              <div class="detail-text">{{ trace.output_summary }}</div>
              <div v-if="outputLinks(trace).length" class="detail-links">
                <a
                  v-for="link in outputLinks(trace)"
                  :key="link"
                  :href="link"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="detail-link"
                >🔗 {{ link }}</a>
              </div>
            </div>
            <div v-if="trace.tool_calls_trace.length" class="detail-block">
              <div class="detail-label">工具调用链（{{ trace.tool_calls_trace.length }}）</div>
              <div class="detail-tools">
                <span v-for="(call, ci) in trace.tool_calls_trace" :key="ci" class="tool-chip">{{ toolName(call) }}</span>
              </div>
            </div>
            <div v-if="!trace.output_summary && !trace.tool_calls_trace.length" class="detail-block">
              <div class="detail-text detail-text--muted">该记录无更多明细。</div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div class="arch-foot">
      数据源：agent_traces 表（Agent 调用链路真实落库）<template v-if="lastRefresh"> · 更新于 {{ fmtTime(lastRefresh.toISOString()) }}</template>
    </div>
  </div>
</template>

<style scoped>
.arch-page {
  max-width: 1080px;
  margin: 0 auto;
  padding: 24px 20px 48px;
}

/* === 页头 === */
.arch-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}
.arch-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary, #1f2937);
  margin: 0 0 6px;
}
.arch-subtitle {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  margin: 0;
  max-width: 640px;
  line-height: 1.6;
}
.arch-refresh {
  flex-shrink: 0;
  padding: 8px 16px;
  border: 1px solid var(--color-border-subtle, #e5e7eb);
  border-radius: 8px;
  background: var(--color-bg-elevated, #ffffff);
  color: var(--text-primary, #1f2937);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.arch-refresh:hover:not(:disabled) {
  border-color: var(--primary, #00d4aa);
  color: var(--primary, #00d4aa);
}
.arch-refresh:disabled { opacity: 0.6; cursor: default; }
.arch-refresh__spin { display: inline-block; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* === 错误 / 空态 === */
.arch-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.06);
  color: #dc2626;
  font-size: 13px;
}
.arch-empty {
  padding: 28px 16px;
  text-align: center;
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
  border: 1px dashed var(--color-border-subtle, #e5e7eb);
  border-radius: 10px;
}

/* === 全览统计 === */
.arch-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 28px;
}
.stat-card {
  padding: 16px;
  border: 1px solid var(--color-border-subtle, #e5e7eb);
  border-radius: 12px;
  background: var(--color-bg-elevated, #ffffff);
}
.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--primary, #00d4aa);
  font-variant-numeric: tabular-nums;
}
.stat-value--sm { font-size: 18px; }
.stat-label {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

/* === 章节标题 === */
.arch-section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary, #1f2937);
  margin: 0 0 12px;
}

/* === Agent 角色卡 === */
.arch-agents {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  margin-bottom: 28px;
}
.agent-card {
  border: 1px solid var(--color-border-subtle, #e5e7eb);
  border-top: 3px solid var(--agent-color, #6b7280);
  border-radius: 12px;
  background: var(--color-bg-elevated, #ffffff);
  padding: 14px 16px;
}
.agent-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.agent-card__icon { font-size: 22px; }
.agent-card__label {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary, #1f2937);
}
.agent-card__role {
  font-size: 11px;
  color: var(--text-secondary, #6b7280);
  font-family: var(--font-mono, monospace);
}
.agent-card__desc {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  margin-bottom: 12px;
  line-height: 1.5;
}
.agent-card__metrics {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
}
.metric { display: flex; flex-direction: column; }
.metric-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #1f2937);
  font-variant-numeric: tabular-nums;
}
.metric-label { font-size: 11px; color: var(--text-secondary, #6b7280); }
.agent-card__foot {
  font-size: 11px;
  color: var(--text-secondary, #6b7280);
  border-top: 1px dashed var(--color-border-subtle, #e5e7eb);
  padding-top: 8px;
}

/* === 任务流转时间线 === */
.arch-timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}
.trace-item {
  border: 1px solid var(--color-border-subtle, #e5e7eb);
  border-left: 3px solid var(--color-border-subtle, #e5e7eb);
  border-radius: 10px;
  background: var(--color-bg-elevated, #ffffff);
  overflow: hidden;
}
.trace-item.is-done { border-left-color: #10b981; }
.trace-item.is-error { border-left-color: #ef4444; }
.trace-item.is-running { border-left-color: #f59e0b; }
.trace-item__main {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  cursor: pointer;
  transition: background 0.15s;
}
.trace-item__main:hover { background: rgba(0, 212, 170, 0.03); }
.trace-item__icon { font-size: 18px; flex-shrink: 0; }
.trace-item__info { flex: 1; min-width: 0; }
.trace-item__line1 {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.trace-item__role {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary, #1f2937);
}
.trace-item__action {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--color-bg-sunken, #f4f6fa);
  color: var(--text-secondary, #6b7280);
  font-family: var(--font-mono, monospace);
}
.trace-item__status {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
}
.trace-item__status.is-done { background: rgba(16, 185, 129, 0.1); color: #059669; }
.trace-item__status.is-error { background: rgba(239, 68, 68, 0.1); color: #dc2626; }
.trace-item__status.is-running { background: rgba(245, 158, 11, 0.12); color: #d97706; }
.trace-item__summary {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.trace-item__right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.trace-item__tokens {
  font-size: 11px;
  color: var(--text-secondary, #6b7280);
  font-variant-numeric: tabular-nums;
}
.trace-item__time {
  font-size: 11px;
  color: var(--text-secondary, #6b7280);
  font-variant-numeric: tabular-nums;
}
.trace-item__chevron {
  font-size: 14px;
  color: var(--text-secondary, #6b7280);
  transform: rotate(90deg);
  transition: transform 0.2s;
}
.trace-item__chevron.rotated { transform: rotate(-90deg); }

/* === 展开详情 === */
.trace-item__detail {
  border-top: 1px dashed var(--color-border-subtle, #e5e7eb);
  padding: 12px 14px;
}
.detail-block + .detail-block { margin-top: 12px; }
.detail-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary, #6b7280);
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}
.detail-text {
  font-size: 13px;
  color: var(--text-primary, #1f2937);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.detail-text--muted { color: var(--text-secondary, #6b7280); }
.detail-links {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.detail-link {
  font-size: 12px;
  color: var(--primary, #00d4aa);
  text-decoration: none;
  word-break: break-all;
}
.detail-link:hover { text-decoration: underline; }
.detail-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tool-chip {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border-subtle, #e5e7eb);
  color: var(--text-secondary, #6b7280);
  font-family: var(--font-mono, monospace);
}

/* === 页脚 === */
.arch-foot {
  font-size: 11px;
  color: var(--text-secondary, #6b7280);
  text-align: center;
  margin-top: 8px;
}
</style>
