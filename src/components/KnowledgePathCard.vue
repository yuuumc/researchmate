<script setup>
import { computed } from 'vue'

const props = defineProps({
  // tutor agent 返回的 knowledge_path 对象
  path: {
    type: Object,
    default: () => ({})
  }
})

// 完整路径节点列表
const nodes = computed(() => props.path?.path || [])

// 是否有数据
const visible = computed(() => nodes.value.length > 0)

// 目标节点
const target = computed(() => props.path?.target || null)

// 焦点提示
const focusHint = computed(() => props.path?.focusHint || '')

// GraphRAG 检索命中（P0-1 新增）
const retrievalHits = computed(() => props.path?.retrievalHits || [])
const hasRetrievalHits = computed(() => retrievalHits.value.length > 0)

// 掌握状态颜色映射
const masteryColor = {
  mastered: '#00d4aa',
  weak: '#ff6b6b',
  unknown: '#9ca3af',
  learning: '#ffd166'
}

// 掌握状态图标
const masteryIcon = {
  mastered: '✓',
  weak: '✗',
  unknown: '○',
  learning: '◐'
}

// 掌握状态中文
const masteryLabel = {
  mastered: '已掌握',
  weak: '薄弱',
  unknown: '未学',
  learning: '学习中'
}

// 检索路径标签颜色
const sourceColor = {
  tfidf: '#3b82f6',
  graphVec: '#8b5cf6',
  keyword: '#f59e0b'
}

const sourceLabel = {
  tfidf: 'TF-IDF',
  graphVec: '图谱向量',
  keyword: '关键词'
}

function getSourceColor(src) {
  return sourceColor[src] || '#9ca3af'
}

function getSourceLabel(src) {
  return sourceLabel[src] || src
}

// 融合分数百分比
function scorePercent(score) {
  return (score * 100).toFixed(0) + '%'
}
</script>

<template>
  <div v-if="visible" class="knowledge-path-card">
    <!-- 标题栏 -->
    <div class="card-header">
      <span class="header-icon">⬡</span>
      <div class="header-text">
        <div class="header-title">知识图谱路径</div>
        <div class="header-en">KNOWLEDGE GRAPH PATH</div>
      </div>
      <span v-if="target" class="header-target">
        <span class="target-label">目标</span>
        <span class="target-name">{{ target.name }}</span>
      </span>
    </div>

    <!-- 路径时间线 -->
    <div class="path-timeline">
      <div
        v-for="(node, i) in nodes"
        :key="node.id"
        class="path-node"
        :class="[`mastery-${node.mastery.status}`, { target: node.isTarget }]"
        :style="{ '--node-color': masteryColor[node.mastery.status], '--delay': `${i * 0.08}s` }"
      >
        <!-- 左侧节点圆点 + 连线 -->
        <div class="node-marker">
          <div class="marker-circle">
            <span class="marker-icon">{{ masteryIcon[node.mastery.status] }}</span>
          </div>
          <div v-if="i < nodes.length - 1" class="marker-line"></div>
        </div>

        <!-- 右侧内容 -->
        <div class="node-content">
          <div class="node-head">
            <span class="node-chapter">{{ node.chapter }}</span>
            <span class="node-name">{{ node.name }}</span>
            <span v-if="node.isTarget" class="node-tag target">目标</span>
            <span v-else class="node-tag prereq">前置</span>
            <span class="node-status" :class="`status-${node.mastery.status}`">
              {{ masteryLabel[node.mastery.status] }}
            </span>
          </div>
          <div v-if="node.reason" class="node-reason">{{ node.reason }}</div>
        </div>
      </div>
    </div>

    <!-- GraphRAG 检索命中展示（P0-1 新增） -->
    <div v-if="hasRetrievalHits" class="retrieval-hits">
      <div class="hits-header">
        <span class="hits-icon">⟨⟩</span>
        <span class="hits-title">GraphRAG 三路融合命中</span>
      </div>
      <div class="hits-list">
        <div
          v-for="(hit, i) in retrievalHits"
          :key="hit.nodeId || i"
          class="hit-item"
        >
          <div class="hit-main">
            <span class="hit-rank">#{{ i + 1 }}</span>
            <span class="hit-name">{{ hit.nodeName }}</span>
            <span class="hit-score">{{ scorePercent(hit.fusedScore) }}</span>
          </div>
          <div class="hit-sources">
            <span
              v-for="src in hit.sources"
              :key="src"
              class="source-tag"
              :style="{ '--src-color': getSourceColor(src) }"
            >
              {{ getSourceLabel(src) }}
            </span>
          </div>
          <!-- 各路分数明细 -->
          <div v-if="hit.scores" class="hit-score-detail">
            <span class="score-bar" v-if="hit.scores.tfidf > 0" :style="{ '--bar-color': sourceColor.tfidf }">
              TF-IDF {{ hit.scores.tfidf.toFixed(2) }}
            </span>
            <span class="score-bar" v-if="hit.scores.graphVec > 0" :style="{ '--bar-color': sourceColor.graphVec }">
              向量 {{ hit.scores.graphVec.toFixed(2) }}
            </span>
            <span class="score-bar" v-if="hit.scores.keyword > 0" :style="{ '--bar-color': sourceColor.keyword }">
              关键词 {{ hit.scores.keyword.toFixed(2) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 焦点提示 -->
    <div v-if="focusHint" class="focus-hint">
      <span class="hint-icon">→</span>
      <span class="hint-text">{{ focusHint }}</span>
    </div>
  </div>
</template>

<style scoped>
.knowledge-path-card {
  background: var(--color-bg-sunken, #f4f6fa);
  border-radius: var(--radius-lg, 12px);
  padding: 16px 18px;
  border: 1px solid var(--color-border-subtle, #e5e7eb);
}

/* === 标题栏 === */
.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--color-border-subtle, #e5e7eb);
  margin-bottom: 14px;
}

.header-icon {
  color: var(--color-fg-muted, #9ca3af);
  font-size: 16px;
}

.header-text {
  flex: 1;
  min-width: 0;
}

.header-title {
  font-family: var(--font-serif, Georgia, serif);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-ink-900, #111827);
}

.header-en {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  color: var(--color-fg-tertiary, #9ca3af);
  letter-spacing: 1px;
  text-transform: uppercase;
}

.header-target {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(0, 212, 170, 0.08);
  border: 1px solid rgba(0, 212, 170, 0.25);
  border-radius: var(--radius-full, 999px);
}

.target-label {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  color: var(--color-fg-muted, #9ca3af);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.target-name {
  font-family: var(--font-serif, Georgia, serif);
  font-size: 12px;
  font-weight: 600;
  color: #00a483;
}

/* === 时间线 === */
.path-timeline {
  display: flex;
  flex-direction: column;
}

.path-node {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 12px;
  position: relative;
  animation: node-fade-in 0.4s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)) both;
  animation-delay: var(--delay, 0s);
}

@keyframes node-fade-in {
  from { opacity: 0; transform: translateX(-4px); }
  to { opacity: 1; transform: translateX(0); }
}

.node-marker {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.marker-circle {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-bg-elevated, #fff);
  border: 1.5px solid var(--node-color, #9ca3af);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.3s;
}

.path-node.mastery-mastered .marker-circle {
  background: var(--node-color, #00d4aa);
  border-color: var(--node-color, #00d4aa);
}

.path-node.mastery-weak .marker-circle {
  background: var(--node-color, #ff6b6b);
  border-color: var(--node-color, #ff6b6b);
}

.path-node.target .marker-circle {
  width: 26px;
  height: 26px;
  border-width: 2px;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--node-color, #00d4aa) 18%, transparent);
}

.marker-icon {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-fg-muted, #9ca3af);
}

.path-node.mastery-mastered .marker-icon,
.path-node.mastery-weak .marker-icon {
  color: white;
}

.path-node.target .marker-icon {
  color: var(--node-color, #00d4aa);
}

.path-node.mastery-mastered.target .marker-icon,
.path-node.mastery-weak.target .marker-icon {
  color: white;
}

.marker-line {
  width: 1.5px;
  flex: 1;
  background: linear-gradient(to bottom, var(--node-color, #e5e7eb), color-mix(in srgb, var(--node-color, #e5e7eb) 30%, transparent));
  margin-top: 2px;
  min-height: 24px;
  opacity: 0.5;
}

/* 节点内容 */
.node-content {
  padding-bottom: 14px;
  min-width: 0;
}

.path-node:last-child .node-content {
  padding-bottom: 0;
}

.node-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.node-chapter {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--color-fg-muted, #9ca3af);
  padding: 1px 6px;
  background: var(--color-bg-elevated, #fff);
  border-radius: var(--radius-sm, 4px);
}

.node-name {
  font-family: var(--font-serif, Georgia, serif);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-900, #111827);
}

.path-node.target .node-name {
  color: var(--node-color, #00a483);
  font-weight: 700;
}

.node-tag {
  padding: 1px 8px;
  border-radius: var(--radius-full, 999px);
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.node-tag.target {
  background: rgba(0, 212, 170, 0.12);
  color: #00a483;
}

.node-tag.prereq {
  background: var(--color-bg-elevated, #fff);
  color: var(--color-fg-muted, #9ca3af);
  border: 1px solid var(--color-border-subtle, #e5e7eb);
}

.node-status {
  margin-left: auto;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-full, 999px);
}

.status-mastered {
  background: rgba(0, 212, 170, 0.1);
  color: #00a483;
}

.status-weak {
  background: rgba(255, 107, 107, 0.1);
  color: #e85555;
}

.status-unknown {
  background: var(--color-bg-elevated, #fff);
  color: var(--color-fg-muted, #9ca3af);
  border: 1px solid var(--color-border-subtle, #e5e7eb);
}

.status-learning {
  background: rgba(255, 209, 102, 0.15);
  color: #c79100;
}

.node-reason {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-fg-secondary, #6b7280);
  line-height: 1.5;
  font-family: var(--font-mono, monospace);
}

/* === GraphRAG 检索命中（P0-1 新增） === */
.retrieval-hits {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--color-border-subtle, #e5e7eb);
}

.hits-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.hits-icon {
  color: #8b5cf6;
  font-size: 14px;
  font-weight: 700;
}

.hits-title {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-ink-700, #374151);
  letter-spacing: 0.3px;
}

.hits-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hit-item {
  background: var(--color-bg-elevated, #fff);
  border-radius: var(--radius-md, 8px);
  padding: 8px 10px;
  border: 1px solid var(--color-border-subtle, #e5e7eb);
}

.hit-main {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hit-rank {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--color-fg-muted, #9ca3af);
  min-width: 20px;
}

.hit-name {
  font-family: var(--font-serif, Georgia, serif);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-ink-900, #111827);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hit-score {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 700;
  color: #8b5cf6;
}

.hit-sources {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.source-tag {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--radius-full, 999px);
  background: color-mix(in srgb, var(--src-color, #9ca3af) 10%, transparent);
  color: var(--src-color, #9ca3af);
  border: 1px solid color-mix(in srgb, var(--src-color, #9ca3af) 25%, transparent);
}

.hit-score-detail {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.score-bar {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  color: var(--bar-color, #9ca3af);
  padding: 1px 5px;
  background: color-mix(in srgb, var(--bar-color, #9ca3af) 6%, transparent);
  border-radius: var(--radius-sm, 4px);
}

/* === 焦点提示 === */
.focus-hint {
  margin-top: 14px;
  padding: 10px 14px;
  background: linear-gradient(90deg, rgba(0, 212, 170, 0.06), transparent);
  border-left: 3px solid #00d4aa;
  border-radius: var(--radius-md, 8px);
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.hint-icon {
  color: #00d4aa;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 2px;
}

.hint-text {
  font-size: 12px;
  color: var(--color-ink-700, #374151);
  line-height: 1.5;
}

/* === 响应式 === */
@media (max-width: 768px) {
  .path-node {
    grid-template-columns: 22px 1fr;
    gap: 8px;
  }
  .marker-circle {
    width: 18px;
    height: 18px;
  }
  .path-node.target .marker-circle {
    width: 22px;
    height: 22px;
  }
  .marker-icon {
    font-size: 9px;
  }
  .node-head {
    gap: 6px;
  }
  .node-status {
    margin-left: 0;
  }
  .hit-score-detail {
    gap: 4px;
  }
}
</style>
