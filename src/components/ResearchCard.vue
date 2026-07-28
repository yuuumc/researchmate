<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: {
    type: Object,
    default: () => ({})
  }
})

// 难度颜色映射
const difficultyColor = {
  入门: '#00d4aa',
  进阶: '#ffd166',
  高级: '#ff6b6b'
}

// 难度标签类
function difficultyClass(d) {
  return `diff-${d}`
}

// 合并本科 + 科研路径成单一时间线
const fullTimeline = computed(() => {
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

const hasTimeline = computed(() => fullTimeline.value.length > 0)
const hasPapers = computed(() => (props.data.papers?.length || 0) > 0)
const hasProjects = computed(() => (props.data.projects?.length || 0) > 0)
const hasTechStack = computed(() => (props.data.tech_stack?.length || 0) > 0)
</script>

<template>
  <div class="research-card">
    <!-- 顶部方向标签 -->
    <div v-if="data.direction" class="direction-bar">
      <span class="dir-label">DIRECTION</span>
      <span class="dir-name">{{ data.direction }}</span>
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
              <span class="step-stage">{{ step.stage }}</span>
              <span class="step-topic">{{ step.topic }}</span>
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
            <div v-if="paper.authors" class="paper-authors">{{ paper.authors }}</div>
            <div v-if="paper.value" class="paper-value">{{ paper.value }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 推荐项目 -->
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
            <span class="project-name">{{ proj.name }}</span>
            <span
              v-if="proj.difficulty"
              class="project-difficulty"
              :class="difficultyClass(proj.difficulty)"
            >
              {{ proj.difficulty }}
            </span>
          </div>
          <div v-if="proj.output" class="project-output">
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
        <span v-for="(tech, i) in data.tech_stack" :key="i" class="tech-item">
          {{ tech }}
        </span>
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

.tech-item {
  padding: 4px 12px;
  background: var(--color-bg-elevated, #fff);
  border: 1px solid var(--color-border-subtle, #e5e7eb);
  border-radius: var(--radius-full, 999px);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 500;
  color: var(--color-ink-700, #374151);
  transition: all 0.2s;
}

.tech-item:hover {
  background: rgba(230, 126, 34, 0.06);
  border-color: #e67e22;
  color: #e67e22;
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
