<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: {
    type: Object,
    default: () => ({})
  }
})

// 检测是 API 新 schema（roadmap）还是种子旧 schema（undergrad_path）
const isApiSchema = computed(() => Array.isArray(props.data.roadmap))

// 难度标签类
function difficultyClass(d) {
  return `diff-${d}`
}

// === 旧 schema：合并本科 + 科研路径成单一时间线 ===
const seedTimeline = computed(() => {
  const undergrad = (props.data.undergrad_path || []).map((p, i) => ({
    ...p,
    phase: '本科',
    phaseEn: 'Undergrad',
    color: '#4d9de0',
    idx: `u-${i}`
  }))
  const research = (props.data.research_path || []).map((p, i) => ({
    ...p,
    phase: '科研',
    phaseEn: 'Research',
    color: '#e67e22',
    idx: `r-${i}`
  }))
  return [...undergrad, ...research]
})

// === 新 schema：roadmap → timeline ===
const apiTimeline = computed(() => {
  return (props.data.roadmap || []).map((p, i) => ({
    phase: p.stage || `阶段 ${i + 1}`,
    phaseEn: p.duration || '',
    topic: p.focus || '',
    reason: p.milestone || '',
    color: i < 2 ? '#4d9de0' : '#e67e22',
    idx: `r-${i}`
  }))
})

// 统一 timeline
const fullTimeline = computed(() => isApiSchema.value ? apiTimeline.value : seedTimeline.value)

const hasTimeline = computed(() => fullTimeline.value.length > 0)
const hasPapers = computed(() => (props.data.papers?.length || 0) > 0)
const hasProjects = computed(() => (props.data.projects?.length || 0) > 0)
const hasTechStack = computed(() => (props.data.tech_stack?.length || 0) > 0)
const hasLabs = computed(() => (props.data.labs?.length || 0) > 0)
const hasSummary = computed(() => !!props.data.summary)

// tech_stack 兼容：新 schema 是 object 数组，旧 schema 是 string 数组
const techStackItems = computed(() => {
  const ts = props.data.tech_stack || []
  return ts.map((t) => {
    if (typeof t === 'string') return { name: t, priority: '', use_case: '' }
    return { name: t.name || '', priority: t.priority || '', use_case: t.use_case || '' }
  })
})
</script>

<template>
  <div class="research-card">
    <!-- 顶部方向/总览 -->
    <div v-if="data.direction" class="direction-bar">
      <span class="dir-label">DIRECTION</span>
      <span class="dir-name">{{ data.direction }}</span>
    </div>

    <!-- API 总览摘要 -->
    <div v-if="hasSummary" class="summary-bar">
      <span class="summary-icon">◈</span>
      <span class="summary-text">{{ data.summary }}</span>
    </div>

    <!-- 成长路线图（本科 → 研究生）-->
    <div v-if="hasTimeline" class="section">
      <div class="section-head">
        <span class="section-icon">◇</span>
        <span class="section-title">成长路线</span>
        <span class="section-en">GROWTH PATH</span>
      </div>
      <div class="timeline">
        <div
          v-for="(step, i) in fullTimeline"
          :key="step.idx"
          class="step"
          :class="{ last: i === fullTimeline.length - 1 }"
          :style="{ '--step-color': step.color, '--step-delay': `${i * 0.06}s` }"
        >
          <div class="step-node">
            <span class="node-dot"></span>
            <span v-if="i < fullTimeline.length - 1" class="node-line"></span>
          </div>
          <div class="step-body">
            <div class="step-head">
              <span class="step-phase" :style="{ color: step.color }">{{ step.phase }}</span>
              <span v-if="step.phaseEn" class="step-stage">{{ step.phaseEn }}</span>
              <span class="step-topic">{{ step.topic || step.task }}</span>
            </div>
            <div v-if="step.reason" class="step-reason">{{ step.reason }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 推荐论文 -->
    <div v-if="hasPapers" class="section">
      <div class="section-head">
        <span class="section-icon">▤</span>
        <span class="section-title">推荐论文</span>
        <span class="section-en">PAPERS</span>
        <span class="section-count">{{ data.papers.length }}</span>
      </div>
      <div class="paper-list">
        <div v-for="(paper, i) in data.papers" :key="i" class="paper-item">
          <div class="paper-num">{{ i + 1 }}</div>
          <div class="paper-body">
            <div class="paper-title">{{ paper.title }}</div>
            <div class="paper-meta">
              <span v-if="paper.field" class="paper-field">{{ paper.field }}</span>
              <span v-if="paper.venue" class="paper-venue">{{ paper.venue }}</span>
              <span v-if="paper.authors" class="paper-authors">{{ paper.authors }}</span>
              <span v-if="paper.difficulty" class="paper-difficulty" :class="difficultyClass(paper.difficulty)">{{ paper.difficulty }}</span>
            </div>
            <div v-if="paper.why" class="paper-value">{{ paper.why }}</div>
            <div v-else-if="paper.value" class="paper-value">{{ paper.value }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 推荐实验室/方向（新 schema） -->
    <div v-if="hasLabs" class="section">
      <div class="section-head">
        <span class="section-icon">⬡</span>
        <span class="section-title">推荐实验室</span>
        <span class="section-en">LABS</span>
        <span class="section-count">{{ data.labs.length }}</span>
      </div>
      <div class="lab-list">
        <div v-for="(lab, i) in data.labs" :key="i" class="lab-item">
          <div class="lab-head">
            <span class="lab-name">{{ lab.name }}</span>
            <span v-if="lab.direction" class="lab-direction">{{ lab.direction }}</span>
          </div>
          <div v-if="lab.match_reason" class="lab-reason">{{ lab.match_reason }}</div>
        </div>
      </div>
    </div>

    <!-- 推荐项目（旧 schema） -->
    <div v-if="hasProjects" class="section">
      <div class="section-head">
        <span class="section-icon">⬡</span>
        <span class="section-title">推荐项目</span>
        <span class="section-en">PROJECTS</span>
        <span class="section-count">{{ data.projects.length }}</span>
      </div>
      <div class="project-list">
        <div v-for="(proj, i) in data.projects" :key="i" class="project-item">
          <div class="project-head">
            <span class="project-name">{{ typeof proj === 'string' ? proj : proj.name }}</span>
            <span
              v-if="typeof proj === 'object' && proj.difficulty"
              class="project-difficulty"
              :class="difficultyClass(proj.difficulty)"
            >
              {{ proj.difficulty }}
            </span>
          </div>
          <div v-if="typeof proj === 'object' && proj.output" class="project-output">
            <span class="output-label">产出：</span>{{ proj.output }}
          </div>
        </div>
      </div>
    </div>

    <!-- 技术栈 -->
    <div v-if="hasTechStack" class="section">
      <div class="section-head">
        <span class="section-icon">⌘</span>
        <span class="section-title">技术栈</span>
        <span class="section-en">TECH STACK</span>
      </div>
      <div class="tech-list">
        <div v-for="(tech, i) in techStackItems" :key="i" class="tech-item-wrap">
          <span class="tech-item">{{ tech.name }}</span>
          <span v-if="tech.priority" class="tech-priority">{{ tech.priority }}</span>
          <span v-if="tech.use_case" class="tech-usecase">{{ tech.use_case }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.research-card {
  background: var(--color-bg-sunken, #f4f6fa);
  border-radius: var(--radius-lg, 12px);
  padding: 20px;
}

/* === 方向标签 === */
.direction-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: linear-gradient(90deg, rgba(230, 126, 34, 0.08), transparent);
  border-left: 3px solid #e67e22;
  border-radius: var(--radius-md, 8px);
  margin-bottom: 16px;
}

.dir-label {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  color: var(--color-fg-muted, #9ca3af);
  letter-spacing: 1px;
  text-transform: uppercase;
}

.dir-name {
  font-family: var(--font-serif, Georgia, serif);
  font-size: 16px;
  font-weight: 700;
  color: #e67e22;
}

/* === 区块通用 === */
.section {
  margin-bottom: 20px;
}

.section:last-child {
  margin-bottom: 0;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--color-border-subtle, #e5e7eb);
}

.section-icon {
  color: var(--color-fg-muted, #9ca3af);
  font-size: 14px;
}

.section-title {
  font-family: var(--font-serif, Georgia, serif);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-ink-900, #111827);
}

.section-en {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  color: var(--color-fg-tertiary, #9ca3af);
  letter-spacing: 1px;
}

.section-count {
  margin-left: auto;
  padding: 2px 8px;
  background: var(--color-bg-elevated, #fff);
  border-radius: var(--radius-full, 999px);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-ink-700, #374151);
}

/* === 时间线 === */
.timeline {
  display: flex;
  flex-direction: column;
}

.step {
  display: grid;
  grid-template-columns: 20px 1fr;
  gap: 12px;
  position: relative;
  animation: step-fade-in 0.4s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)) both;
  animation-delay: var(--step-delay, 0s);
}

@keyframes step-fade-in {
  from { opacity: 0; transform: translateX(-4px); }
  to { opacity: 1; transform: translateX(0); }
}

.step-node {
  position: relative;
  width: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.node-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--step-color, #7a8ba3);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--step-color, #7a8ba3) 18%, transparent);
  flex-shrink: 0;
  margin-top: 4px;
}

.node-line {
  width: 1.5px;
  flex: 1;
  background: linear-gradient(to bottom, var(--step-color, #e5e7eb), color-mix(in srgb, var(--step-color, #e5e7eb) 30%, transparent));
  margin-top: 2px;
  min-height: 28px;
}

.step.last .node-line {
  display: none;
}

.step-body {
  padding-bottom: 14px;
}

.step.last .step-body {
  padding-bottom: 0;
}

.step-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.step-phase {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.step-stage {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--color-fg-muted, #9ca3af);
  padding: 1px 6px;
  background: var(--color-bg-elevated, #fff);
  border-radius: var(--radius-sm, 4px);
}

.step-topic {
  font-family: var(--font-serif, Georgia, serif);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-900, #111827);
}

.step-reason {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-fg-secondary, #6b7280);
  line-height: 1.5;
}

/* === 论文 === */
.paper-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.paper-item {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  background: var(--color-bg-elevated, #fff);
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border-subtle, #e5e7eb);
  transition: all 0.2s;
}

.paper-item:hover {
  border-color: var(--color-brand-400, #00d4aa);
  transform: translateX(2px);
}

.paper-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #e67e22;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.paper-body {
  flex: 1;
  min-width: 0;
}

.paper-title {
  font-family: var(--font-serif, Georgia, serif);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink-900, #111827);
  line-height: 1.4;
}

.paper-authors {
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-fg-muted, #9ca3af);
  font-family: var(--font-mono, monospace);
  font-style: italic;
}

.paper-value {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-fg-secondary, #6b7280);
  line-height: 1.5;
}

/* === 项目 === */
.project-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-item {
  padding: 10px 12px;
  background: var(--color-bg-elevated, #fff);
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border-subtle, #e5e7eb);
  transition: all 0.2s;
}

.project-item:hover {
  border-color: var(--color-brand-400, #00d4aa);
}

.project-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.project-name {
  font-family: var(--font-serif, Georgia, serif);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink-900, #111827);
}

.project-difficulty {
  padding: 2px 8px;
  border-radius: var(--radius-full, 999px);
  font-size: 10px;
  font-weight: 600;
  font-family: var(--font-mono, monospace);
  flex-shrink: 0;
}

.project-difficulty.diff-入门 {
  background: rgba(0, 212, 170, 0.12);
  color: #00a483;
}

.project-difficulty.diff-进阶 {
  background: rgba(255, 209, 102, 0.18);
  color: #c79100;
}

.project-difficulty.diff-高级 {
  background: rgba(255, 107, 107, 0.12);
  color: #e85555;
}

.project-output {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-fg-secondary, #6b7280);
  line-height: 1.5;
}

.output-label {
  color: var(--color-fg-muted, #9ca3af);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
}

/* === 技术栈 === */
.tech-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tech-item-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--color-bg-elevated, #fff);
  border: 1px solid var(--color-border-subtle, #e5e7eb);
  border-radius: var(--radius-full, 999px);
  transition: all 0.2s;
}

.tech-item-wrap:hover {
  background: rgba(230, 126, 34, 0.06);
  border-color: #e67e22;
}

.tech-item {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 500;
  color: var(--color-ink-700, #374151);
}

.tech-priority {
  font-size: 9px;
  font-weight: 700;
  color: #e67e22;
  padding: 1px 4px;
  background: rgba(230, 126, 34, 0.1);
  border-radius: var(--radius-xs, 3px);
}

.tech-usecase {
  font-size: 10px;
  color: var(--color-fg-muted, #9ca3af);
}

/* === 总览摘要 === */
.summary-bar {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  background: linear-gradient(90deg, rgba(230, 126, 34, 0.08), transparent);
  border-left: 3px solid #e67e22;
  border-radius: var(--radius-md, 8px);
  margin-bottom: 16px;
}

.summary-icon {
  color: #e67e22;
  font-size: 14px;
  flex-shrink: 0;
}

.summary-text {
  font-family: var(--font-serif, Georgia, serif);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-900, #111827);
  line-height: 1.5;
}

/* === 论文 meta === */
.paper-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.paper-field {
  font-size: 11px;
  color: var(--color-fg-muted, #9ca3af);
  font-family: var(--font-mono, monospace);
}

.paper-venue {
  font-size: 11px;
  color: var(--color-fg-muted, #9ca3af);
  font-family: var(--font-mono, monospace);
  font-style: italic;
}

.paper-authors {
  font-size: 11px;
  color: var(--color-fg-muted, #9ca3af);
  font-family: var(--font-mono, monospace);
  font-style: italic;
}

.paper-difficulty {
  padding: 1px 6px;
  border-radius: var(--radius-full, 999px);
  font-size: 9px;
  font-weight: 700;
  font-family: var(--font-mono, monospace);
}

.paper-difficulty.diff-入门 { background: rgba(0, 212, 170, 0.12); color: #00a483; }
.paper-difficulty.diff-进阶 { background: rgba(255, 209, 102, 0.18); color: #c79100; }
.paper-difficulty.diff-高级 { background: rgba(255, 107, 107, 0.12); color: #e85555; }

/* === 实验室 === */
.lab-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.lab-item {
  padding: 12px 14px;
  background: var(--color-bg-elevated, #fff);
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border-subtle, #e5e7eb);
  transition: all 0.2s;
}

.lab-item:hover {
  border-color: #e67e22;
  transform: translateX(2px);
}

.lab-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.lab-name {
  font-family: var(--font-serif, Georgia, serif);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-900, #111827);
}

.lab-direction {
  padding: 2px 8px;
  background: rgba(230, 126, 34, 0.1);
  border-radius: var(--radius-full, 999px);
  font-size: 11px;
  font-weight: 500;
  color: #e67e22;
}

.lab-reason {
  font-size: 12px;
  color: var(--color-fg-secondary, #6b7280);
  line-height: 1.5;
}

/* === 响应式 === */
@media (max-width: 768px) {
  .step {
    grid-template-columns: 16px 1fr;
    gap: 8px;
  }
  .step-node {
    width: 16px;
  }
  .node-dot {
    width: 8px;
    height: 8px;
  }
  .section-head {
    flex-wrap: wrap;
  }
}
</style>
