<script setup>
// ============================================================
// 学生画像中心页（V2 · spec 对齐）
// 两列布局：左列 320px 基础信息卡 + AI 评价卡
//          右列知识图谱路径 + 成长时间线
// ============================================================
import { computed } from 'vue'
import { useProfileStore } from '@/stores/profile'
import KnowledgeGraph from '@/components/KnowledgeGraph.vue'

const profileStore = useProfileStore()
const profile = computed(() => profileStore.profile)

// 基础信息
const avatarInitial = computed(() => {
  const name = profile.value.name || '同'
  return name.charAt(0)
})

const stageLabel = computed(() => {
  const map = { initial: '起步阶段', basic: '基础阶段', intensive: '强化阶段', sprint: '冲刺阶段' }
  return map[profile.value.preparation_stage] || '基础阶段'
})

// 知识图谱路径数据（5 节点三态）
const knowledgePath = [
  { label: '半导体物理', status: 'mastered', icon: '半' },
  { label: 'MOSFET', status: 'learning', icon: 'M' },
  { label: 'CMOS', status: 'pending', icon: 'C' },
  { label: '数字IC', status: 'pending', icon: 'IC' },
  { label: 'AI Accelerator', status: 'target', icon: 'AI' }
]

// 连接线状态：done / active / future
const connectorStates = computed(() => {
  const states = []
  for (let i = 0; i < knowledgePath.length - 1; i++) {
    const cur = knowledgePath[i].status
    const next = knowledgePath[i + 1].status
    if (cur === 'mastered' && (next === 'mastered' || next === 'learning')) {
      states.push('done')
    } else if (cur === 'mastered' && next === 'learning') {
      states.push('active')
    } else if (cur === 'learning') {
      states.push('active')
    } else {
      states.push('future')
    }
  }
  return states
})

// AI 评价数据
const strengths = computed(() => profile.value.mastered_topics || [])
const weaknesses = computed(() => profile.value.weak_topics || [])

// 成长时间线数据（Demo 种子）
const timeline = [
  { date: '2026.08', status: 'done', text: '完成半导体物理基础学习' },
  { date: '2026.10', status: 'active', text: '掌握 Verilog HDL 数字电路设计' },
  { date: '2027.01', status: 'future', text: '完成 FPGA 项目实战' },
  { date: '2027.06', status: 'future', text: '复现 AI 芯片顶会论文' }
]
</script>

<template>
  <div class="profile-view">
    <KnowledgeGraph :node-count="14" :flow-dots="true" />

    <div class="profile-content">
      <!-- 页头 -->
      <div class="page-header">
        <div class="page-eyebrow">
          <span class="dot"></span>
          <span>Student Profile · AI Understanding</span>
        </div>
        <h1 class="page-title">学生画像</h1>
        <p class="page-subtitle">AI 对你的完整理解 — 持续学习中的智能体</p>
      </div>

      <!-- 两列布局 -->
      <div class="profile-layout">
        <!-- === 左列 === -->
        <div class="profile-left">
          <!-- 基础信息卡 -->
          <div class="profile-info-card">
            <div class="profile-info-card__avatar">{{ avatarInitial }}</div>
            <h3 class="profile-info-card__name">{{ profile.name || '同学' }}</h3>
            <p class="profile-info-card__meta">
              {{ profile.major || '未设定专业' }} · 大二
            </p>
            <div class="profile-info-card__rows">
              <div class="profile-info-card__row">
                <span class="profile-info-card__label">目标方向</span>
                <span class="profile-info-card__value">{{ profile.target_direction || '未设定' }}</span>
              </div>
              <div class="profile-info-card__row">
                <span class="profile-info-card__label">目标院校</span>
                <span class="profile-info-card__value">{{ profile.target_school || '未设定' }}</span>
              </div>
              <div class="profile-info-card__row">
                <span class="profile-info-card__label">备考阶段</span>
                <span class="profile-info-card__value">{{ stageLabel }}</span>
              </div>
              <div class="profile-info-card__row">
                <span class="profile-info-card__label">专业能力</span>
                <span class="profile-info-card__value">{{ profileStore.abilityLevel }}%</span>
              </div>
            </div>
          </div>

          <!-- AI 评价卡 -->
          <div class="profile-eval-card">
            <h4 class="profile-eval-card__title">
              AI 评价
              <span class="profile-eval-card__ai-badge">AI</span>
            </h4>
            <div class="profile-eval-card__section profile-eval-card__section--strength">
              <p class="profile-eval-card__section-title">优势</p>
              <div class="profile-eval-card__tags">
                <span v-for="s in strengths" :key="s" class="profile-eval-card__tag">{{ s }}</span>
                <span v-if="strengths.length === 0" class="profile-eval-card__empty">暂无数据</span>
              </div>
            </div>
            <div class="profile-eval-card__section profile-eval-card__section--weakness">
              <p class="profile-eval-card__section-title">待提升</p>
              <div class="profile-eval-card__tags">
                <span v-for="w in weaknesses" :key="w" class="profile-eval-card__tag">{{ w }}</span>
                <span v-if="weaknesses.length === 0" class="profile-eval-card__empty">暂无数据</span>
              </div>
            </div>
            <div class="profile-eval-card__conclusion">
              理论基础较好，实践能力不足——建议加强 Verilog 与 FPGA 实战训练
            </div>
          </div>
        </div>

        <!-- === 右列 === -->
        <div class="profile-right">
          <!-- 知识图谱路径 -->
          <div class="knowledge-path">
            <h4 class="knowledge-path__title">知识图谱路径</h4>
            <div class="knowledge-path__flow">
              <template v-for="(node, i) in knowledgePath" :key="i">
                <div class="knowledge-path__node" :class="'knowledge-path__node--' + node.status">
                  <div class="knowledge-path__node-circle">{{ node.icon }}</div>
                  <span class="knowledge-path__node-label">{{ node.label }}</span>
                </div>
                <div
                  v-if="i < knowledgePath.length - 1"
                  class="knowledge-path__connector"
                  :class="'knowledge-path__connector--' + connectorStates[i]"
                ></div>
              </template>
            </div>
          </div>

          <!-- 成长时间线 -->
          <div class="growth-timeline">
            <h4 class="growth-timeline__title">成长时间线</h4>
            <div class="growth-timeline__list">
              <div
                v-for="(item, i) in timeline"
                :key="i"
                class="growth-timeline__item"
                :class="'growth-timeline__item--' + item.status"
              >
                <span class="growth-timeline__dot"></span>
                <p class="growth-timeline__date">{{ item.date }}</p>
                <p class="growth-timeline__text">{{ item.text }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-view {
  position: relative;
  min-height: calc(100vh - 72px);
  overflow: hidden;
}

.profile-content {
  position: relative;
  z-index: var(--z-base);
  max-width: 1080px;
  margin: 0 auto;
  padding: 40px 32px 64px;
}

/* === 页头 === */
.page-header {
  margin-bottom: 32px;
  animation: float-up 0.5s var(--ease-out) both;
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
  background: var(--color-node-active);
  box-shadow: 0 0 0 3px rgba(0, 212, 170, 0.2);
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

/* === 两列布局 === */
.profile-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 20px;
  animation: float-up 0.5s var(--ease-out) 0.1s both;
}

.profile-left {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.profile-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* === 基础信息卡 === */
.profile-info-card {
  padding: 24px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
}

.profile-info-card__avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-ink-700), var(--color-success));
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 16px;
}

.profile-info-card__name {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-ink-900);
  margin: 0 0 4px;
}

.profile-info-card__meta {
  font-size: 13px;
  color: var(--color-fg-secondary);
  margin: 0 0 16px;
}

.profile-info-card__rows {
  display: flex;
  flex-direction: column;
}

.profile-info-card__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-bg-sunken);
}

.profile-info-card__row:last-child {
  border-bottom: none;
}

.profile-info-card__label {
  font-size: 13px;
  color: var(--color-fg-tertiary);
}

.profile-info-card__value {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-ink-900);
}

/* === AI 评价卡 === */
.profile-eval-card {
  padding: 24px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
}

.profile-eval-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-900);
  margin: 0 0 16px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.profile-eval-card__ai-badge {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-700);
  background: color-mix(in srgb, var(--color-ink-700) 8%, transparent);
  padding: 2px 6px;
  border-radius: 4px;
}

.profile-eval-card__section {
  margin-bottom: 16px;
}

.profile-eval-card__section-title {
  font-size: 12px;
  font-weight: 500;
  margin: 0 0 8px;
}

.profile-eval-card__section--strength .profile-eval-card__section-title {
  color: var(--color-success);
}

.profile-eval-card__section--weakness .profile-eval-card__section-title {
  color: var(--color-warning);
}

.profile-eval-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.profile-eval-card__tag {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
}

.profile-eval-card__section--strength .profile-eval-card__tag {
  background: color-mix(in srgb, var(--color-success) 8%, transparent);
  color: var(--color-success);
}

.profile-eval-card__section--weakness .profile-eval-card__tag {
  background: color-mix(in srgb, var(--color-warning) 8%, transparent);
  color: var(--color-warning);
}

.profile-eval-card__empty {
  font-size: 12px;
  color: var(--color-fg-muted);
  font-style: italic;
}

.profile-eval-card__conclusion {
  font-size: 12px;
  color: var(--color-fg-secondary);
  line-height: 1.5;
  padding-top: 12px;
  border-top: 1px solid var(--color-bg-sunken);
}

/* === 知识图谱路径 === */
.knowledge-path {
  padding: 24px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
  overflow-x: auto;
}

.knowledge-path__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-900);
  margin: 0 0 20px;
}

.knowledge-path__flow {
  display: flex;
  align-items: center;
  gap: 0;
  min-width: 600px;
}

.knowledge-path__node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.knowledge-path__node-circle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  border: 2.5px solid;
  transition: all 0.3s ease;
}

/* 已掌握 */
.knowledge-path__node--mastered .knowledge-path__node-circle {
  background: var(--color-success);
  border-color: var(--color-success);
  color: white;
}

/* 学习中 */
.knowledge-path__node--learning .knowledge-path__node-circle {
  background: color-mix(in srgb, var(--color-ink-700) 10%, var(--color-bg-elevated));
  border-color: var(--color-ink-700);
  color: var(--color-ink-700);
  animation: node-pulse 2s ease-in-out infinite;
}

@keyframes node-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-ink-700) 30%, transparent); }
  50% { box-shadow: 0 0 0 8px transparent; }
}

/* 待学习 */
.knowledge-path__node--pending .knowledge-path__node-circle {
  background: var(--color-bg-elevated);
  border-color: var(--color-border-subtle);
  color: var(--color-fg-muted);
}

/* 目标 */
.knowledge-path__node--target .knowledge-path__node-circle {
  background: var(--color-bg-elevated);
  border-color: var(--color-ink-700);
  border-style: dashed;
  color: var(--color-ink-700);
}

.knowledge-path__node-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-fg-secondary);
  text-align: center;
  white-space: nowrap;
}

/* 连接线 */
.knowledge-path__connector {
  width: 40px;
  height: 2px;
  flex-shrink: 0;
}

.knowledge-path__connector--done {
  background: var(--color-success);
}

.knowledge-path__connector--active {
  background: linear-gradient(to right, var(--color-success), var(--color-ink-700));
}

.knowledge-path__connector--future {
  background: var(--color-border-subtle);
}

/* === 成长时间线 === */
.growth-timeline {
  padding: 24px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
}

.growth-timeline__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-900);
  margin: 0 0 20px;
}

.growth-timeline__list {
  position: relative;
  padding-left: 24px;
}

/* 竖线 */
.growth-timeline__list::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: var(--color-border-subtle);
}

.growth-timeline__item {
  position: relative;
  padding-bottom: 24px;
}

.growth-timeline__item:last-child {
  padding-bottom: 0;
}

/* 三态圆点 */
.growth-timeline__dot {
  position: absolute;
  left: -24px;
  top: 4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2.5px solid;
  background: var(--color-bg-elevated);
  z-index: 1;
}

/* 已完成 */
.growth-timeline__item--done .growth-timeline__dot {
  border-color: var(--color-success);
  background: var(--color-success);
}

/* 进行中 */
.growth-timeline__item--active .growth-timeline__dot {
  border-color: var(--color-ink-700);
  animation: node-pulse 2s ease-in-out infinite;
}

/* 未来 */
.growth-timeline__item--future .growth-timeline__dot {
  border-color: var(--color-border-subtle);
}

.growth-timeline__date {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-fg-tertiary);
  margin: 0 0 2px;
}

.growth-timeline__item--done .growth-timeline__date {
  color: var(--color-success);
}

.growth-timeline__item--active .growth-timeline__date {
  color: var(--color-ink-700);
}

.growth-timeline__text {
  font-size: 14px;
  color: var(--color-ink-900);
  margin: 0;
  line-height: 1.5;
}

.growth-timeline__item--future .growth-timeline__text {
  color: var(--color-fg-tertiary);
}

/* === 响应式 === */
@media (max-width: 768px) {
  .profile-content { padding: 24px 16px 48px; }
  .page-title { font-size: 26px; }
  .profile-layout {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .knowledge-path__flow {
    min-width: 500px;
  }
}

@media (max-width: 480px) {
  .profile-content { padding: 20px 12px 40px; }
  .page-title { font-size: 22px; }
  .profile-info-card,
  .profile-eval-card,
  .knowledge-path,
  .growth-timeline {
    padding: 16px;
  }
  .knowledge-path__flow {
    min-width: 400px;
  }
}
</style>
