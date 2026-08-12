<script setup>
defineProps({
  report: {
    type: Object,
    default: () => ({})
  }
})

// 清洗 LLM 输出中的 markdown / HTML 标签
function cleanText(text) {
  if (text == null) return ''
  if (typeof text === 'object') {
    if (Array.isArray(text)) return text.map(t => cleanText(t)).join('、')
    return cleanText(text.point || text.name || text.description || text.knowledge_point ||
      text.topic || text.label || text.value || text.text ||
      text.title || text.content || JSON.stringify(text))
  }
  let t = String(text)
  // Strip HTML tags
  t = t.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  // Strip markdown code backticks
  t = t.replace(/`{1,3}/g, '')
  // Strip markdown bold/italic markers
  t = t.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
  // Collapse whitespace
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

// 补强方案：归一化为对象数组，供模板 v-for 结构化渲染
// 兼容 JSON 字符串、对象数组、单个对象、纯文本等情况
function parseRemediation(r) {
  if (!r) return []
  if (Array.isArray(r)) return r
  if (typeof r === 'string') {
    const s = r.trim()
    if (s.startsWith('[')) {
      try { return JSON.parse(s) } catch (e) { return [] }
    }
    return [{ step: 1, action: s }]
  }
  if (typeof r === 'object') return [r]
  return []
}

// 4 层根因链配置
const layers = [
  { key: 'weak_points', label: '表面问题', en: 'Surface', color: '#ff6b6b', desc: '错题表现' },
  { key: 'direct_causes', label: '直接原因', en: 'Direct', color: '#ffd166', desc: '知识点缺失' },
  { key: 'middle_causes', label: '中间原因', en: 'Middle', color: '#4d9de0', desc: '上游断层' },
  { key: 'root_causes', label: '根本原因', en: 'Root', color: '#1e3a5f', desc: '底层概念' }
]
</script>

<template>
  <div class="diagnosis-report">
    <!-- 头部：分数 + 科目 -->
    <div class="report-header">
      <div class="score-block">
        <div class="score-label">SCORE</div>
        <div class="score-value">
          <span class="score-num">{{ report.score ?? '—' }}</span>
          <span class="score-unit">分</span>
        </div>
        <div class="score-bar">
          <div
            class="score-fill"
            :style="{ width: `${Math.min(100, Math.max(0, (report.score || 0) / 1.5))}%` }"
          ></div>
        </div>
      </div>
      <div v-if="report.subject" class="subject-block">
        <div class="subject-label">SUBJECT</div>
        <div class="subject-value">{{ report.subject }}</div>
      </div>
    </div>

    <!-- 4 层根因链：纵向时间轴 -->
    <div v-if="layers.some(l => report[l.key]?.length)" class="root-chain">
      <div class="chain-title">
        <span class="title-text">4 层根因链</span>
        <span class="title-en">Root Cause Chain</span>
      </div>

      <div class="chain-track">
        <div
          v-for="(layer, idx) in layers"
          :key="layer.key"
          class="chain-layer"
          :class="{ empty: !report[layer.key]?.length }"
        >
          <!-- 节点 -->
          <div class="layer-node" :style="{ '--layer-color': layer.color }">
            <span class="node-num">{{ idx + 1 }}</span>
          </div>
          <!-- 连线 -->
          <div v-if="idx < layers.length - 1" class="layer-line"></div>
          <!-- 内容 -->
          <div class="layer-content">
            <div class="layer-header">
              <span class="layer-label">{{ layer.label }}</span>
              <span class="layer-en">{{ layer.en }}</span>
              <span class="layer-desc">{{ layer.desc }}</span>
            </div>
            <div v-if="report[layer.key]?.length" class="layer-points">
              <span
                v-for="(p, i) in report[layer.key]"
                :key="i"
                class="point-chip"
                :style="{ '--chip-color': layer.color }"
              >
                {{ cleanText(p) }}
              </span>
            </div>
            <div v-else class="layer-empty">— 未识别 —</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 补强方案 -->
    <div v-if="report.remediation || report.remediation_path" class="remediation">
      <div class="remediation-header">
        <span class="r-icon">◈</span>
        <span class="r-label">补强方案</span>
        <span class="r-en">Remediation</span>
      </div>
      <div class="remediation-list">
        <div
          v-for="(item, i) in parseRemediation(report.remediation || report.remediation_path)"
          :key="i"
          class="remediation-step"
        >
          <div class="step-head">
            <span class="step-num">{{ item.step || i + 1 }}</span>
            <span v-if="item.estimated_focus" class="step-focus">{{ item.estimated_focus }}</span>
          </div>
          <div class="step-action">{{ cleanText(item.action) }}</div>
          <div v-if="item.prerequisite" class="step-prereq">
            <span class="prereq-label">前置知识</span>
            <span class="prereq-text">{{ cleanText(item.prerequisite) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diagnosis-report {
  background: var(--color-bg-sunken);
  border-radius: var(--radius-lg);
  padding: 20px;
}

/* === 头部 === */
.report-header {
  display: flex;
  gap: 32px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border-subtle);
  margin-bottom: 20px;
}

.score-block {
  flex: 1;
}

.score-label,
.subject-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-tertiary);
  letter-spacing: 1.5px;
  margin-bottom: 6px;
}

.score-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 8px;
}

.score-num {
  font-family: var(--font-serif);
  font-size: 36px;
  font-weight: 700;
  color: var(--color-ink-900);
  line-height: 1;
}

.score-unit {
  font-size: 13px;
  color: var(--color-fg-secondary);
}

.score-bar {
  height: 4px;
  background: var(--color-bg-base);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.score-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-node-weak) 0%, var(--color-node-warn) 50%, var(--color-node-active) 100%);
  border-radius: var(--radius-full);
  transition: width var(--duration-slow) var(--ease-out);
}

.subject-value {
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 600;
  color: var(--color-ink-900);
}

/* === 4 层根因链 === */
.chain-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 16px;
}

.title-text {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-ink-900);
}

.title-en {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-tertiary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.chain-track {
  position: relative;
  padding-left: 4px;
}

.chain-layer {
  display: flex;
  gap: 14px;
  padding-bottom: 16px;
  position: relative;
}

.chain-layer:last-child {
  padding-bottom: 0;
}

.layer-node {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-bg-elevated);
  border: 2px solid var(--layer-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
  box-shadow: 0 0 0 4px var(--color-bg-sunken);
}

.node-num {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--layer-color);
}

.chain-layer:not(.empty) .layer-node {
  background: var(--layer-color);
}

.chain-layer:not(.empty) .node-num {
  color: var(--color-fg-inverse);
}

.layer-line {
  position: absolute;
  left: 13px;
  top: 28px;
  width: 2px;
  bottom: 0;
  background: linear-gradient(180deg, var(--layer-color) 0%, transparent 100%);
  opacity: 0.4;
}

.layer-content {
  flex: 1;
  padding-top: 2px;
}

.layer-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.layer-label {
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink-900);
}

.layer-en {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--color-fg-tertiary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.layer-desc {
  font-size: 11px;
  color: var(--color-fg-tertiary);
  margin-left: auto;
}

.layer-points {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.point-chip {
  padding: 4px 10px;
  background: var(--color-bg-elevated);
  border: 1px solid color-mix(in srgb, var(--chip-color) 40%, transparent);
  border-left: 3px solid var(--chip-color);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--color-ink-900);
}

.layer-empty {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-muted);
  font-style: italic;
}

/* === 补强方案 === */
.remediation {
  margin-top: 20px;
  padding: 14px 16px;
  background: var(--color-success-bg);
  border-left: 3px solid var(--color-success);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
}

.remediation-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.r-icon {
  color: var(--color-success);
  font-size: 13px;
}

.r-label {
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink-900);
}

.r-en {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-tertiary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.remediation-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.remediation-step {
  padding: 10px 12px;
  background: var(--color-bg-elevated);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-subtle);
}

.step-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-success);
  color: var(--color-fg-inverse);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.step-focus {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  background: color-mix(in srgb, var(--color-success) 18%, transparent);
  color: var(--color-success);
}

.step-action {
  font-size: 13px;
  color: var(--color-ink-900);
  line-height: 1.6;
}

.step-prereq {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 4px;
  font-size: 12px;
}

.prereq-label {
  color: var(--color-fg-tertiary);
  flex-shrink: 0;
}

.prereq-text {
  color: var(--color-ink-700);
}
</style>
