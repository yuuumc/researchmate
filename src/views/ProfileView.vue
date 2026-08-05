<script setup>
// ============================================================
// 学生画像中心页（V2 · spec 对齐 + v2.0 编辑入口）
// 两列布局：左列 320px 基础信息卡 + AI 评价卡
//          右列知识图谱路径 + 成长时间线
// ============================================================
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProfileStore } from '@/stores/profile'
import { isSupabaseConfigured } from '@/services/supabase'
import KnowledgeGraph from '@/components/KnowledgeGraph.vue'
import { getKnowledgeStructure } from '@/utils/diagnosisInput'

const router = useRouter()
const profileStore = useProfileStore()
const profile = computed(() => profileStore.profile)

// #9: 知识图谱真实知识点标签
const knowledgeLabels = computed(() => {
  const structure = getKnowledgeStructure()
  return structure.slice(0, 8)
})

// 基础信息
const avatarInitial = computed(() => {
  const name = profile.value.name || '同'
  return name.charAt(0)
})

const stageLabel = computed(() => {
  const map = { initial: '起步阶段', basic: '基础阶段', intensive: '强化阶段', sprint: '冲刺阶段' }
  return map[profile.value.preparation_stage] || '基础阶段'
})

// 知识图谱路径数据
const knowledgePath = [
  { label: '半导体物理', status: 'mastered', icon: '半' },
  { label: 'MOSFET', status: 'learning', icon: 'M' },
  { label: 'CMOS', status: 'pending', icon: 'C' },
  { label: '数字IC', status: 'pending', icon: 'IC' },
  { label: 'AI Accelerator', status: 'target', icon: 'AI' }
]

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

const strengths = computed(() => profile.value.mastered_topics || [])
const weaknesses = computed(() => profile.value.weak_topics || profile.value.weak_points || [])

const timeline = [
  { date: '2026.08', status: 'done', text: '完成半导体物理基础学习' },
  { date: '2026.10', status: 'active', text: '掌握 Verilog HDL 数字电路设计' },
  { date: '2027.01', status: 'future', text: '完成 FPGA 项目实战' },
  { date: '2027.06', status: 'future', text: '复现 AI 芯片顶会论文' }
]

// v2.0: 编辑画像入口（仅 Supabase 配置后显示）
function goEdit() {
  router.push('/profile/edit')
}
</script>

<template>
  <div class="profile-view">
    <KnowledgeGraph :node-count="14" :flow-dots="true" :labels="knowledgeLabels" />

    <div class="profile-content">
      <!-- 页头 -->
      <div class="page-header">
        <div class="page-eyebrow">
          <span class="dot"></span>
          <span>Student Profile · AI Understanding</span>
        </div>
        <div class="page-header-row">
          <div>
            <h1 class="page-title">学生画像</h1>
            <p class="page-subtitle">AI 对你的完整理解 — 持续学习中的智能体</p>
          </div>
          <button
            v-if="isSupabaseConfigured"
            class="yx-btn yx-btn--secondary yx-btn--sm"
            @click="goEdit"
          >编辑画像</button>
        </div>
      </div>

      <!-- 两列布局 -->
      <div class="profile-layout">
        <!-- 左列：基础信息卡 -->
        <div class="profile-left">
          <div class="info-card">
            <div class="avatar-section">
              <div class="avatar">{{ avatarInitial }}</div>
              <div class="avatar-info">
                <div class="avatar-name">{{ profile.name || '未设置' }}</div>
                <div class="avatar-major">{{ profile.target_major || profile.major || '未设置专业' }}</div>
              </div>
            </div>

            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">目标院校</span>
                <span class="info-value">{{ profile.target_school || '未设置' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">备考阶段</span>
                <span class="info-value">{{ stageLabel }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">学习风格</span>
                <span class="info-value">{{ profileStore.learningStyleLabel }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">距考研</span>
                <span class="info-value highlight">{{ profileStore.daysLeft !== null ? profileStore.daysLeft + ' 天' : '未设置' }}</span>
              </div>
            </div>
          </div>

          <!-- AI 评价卡 -->
          <div class="ai-card">
            <div class="ai-header">
              <span class="ai-icon">AI</span>
              <span class="ai-title">AI 评价</span>
            </div>
            <div class="ai-content">
              <div v-if="strengths.length" class="ai-section">
                <span class="ai-tag ai-tag--good">优势</span>
                <div class="ai-tags">
                  <span v-for="s in strengths" :key="s" class="topic-tag topic-tag--good">{{ s }}</span>
                </div>
              </div>
              <div v-if="weaknesses.length" class="ai-section">
                <span class="ai-tag ai-tag--weak">薄弱</span>
                <div class="ai-tags">
                  <span v-for="w in weaknesses" :key="w" class="topic-tag topic-tag--weak">{{ w }}</span>
                </div>
              </div>
              <div v-if="!strengths.length && !weaknesses.length" class="ai-empty">
                完成诊断后 AI 将生成评价
              </div>
            </div>
          </div>
        </div>

        <!-- 右列：知识图谱 + 时间线 -->
        <div class="profile-right">
          <!-- 知识路径 -->
          <div class="path-card">
            <h3 class="card-title">知识图谱路径</h3>
            <div class="knowledge-path">
              <div v-for="(node, i) in knowledgePath" :key="node.label" class="path-node-wrap">
                <div class="path-node" :class="'path-node--' + node.status">
                  <span class="path-icon">{{ node.icon }}</span>
                  <span class="path-label">{{ node.label }}</span>
                </div>
                <div v-if="i < knowledgePath.length - 1" class="path-connector" :class="'connector--' + (connectorStates[i] || 'future')"></div>
              </div>
            </div>
          </div>

          <!-- 成长时间线 -->
          <div class="timeline-card">
            <h3 class="card-title">成长时间线</h3>
            <div class="timeline">
              <div v-for="item in timeline" :key="item.date" class="timeline-item" :class="'timeline-item--' + item.status">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                  <span class="timeline-date">{{ item.date }}</span>
                  <span class="timeline-text">{{ item.text }}</span>
                </div>
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
  min-height: 100vh;
}

.profile-content {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-8, 32px) var(--space-4, 16px) var(--space-16, 64px);
}

.page-header {
  margin-bottom: var(--space-8, 32px);
}

.page-eyebrow {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  font-family: var(--font-display, var(--font-body, sans-serif));
  font-size: var(--text-xs, 12px);
  color: var(--text-muted, var(--color-fg-tertiary, #94a3b8));
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: var(--space-2, 8px);
}

.page-eyebrow .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary, var(--color-node-active, #22d3ee));
}

.page-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4, 16px);
}

.page-title {
  margin: 0;
  font-family: var(--font-display, var(--font-serif, serif));
  font-size: var(--text-2xl, 28px);
  color: var(--text-primary, var(--color-ink-900, #f1f5f9));
}

.page-subtitle {
  margin: var(--space-1, 4px) 0 0;
  font-size: var(--text-sm, 14px);
  color: var(--text-secondary, var(--color-fg-secondary, #94a3b8));
}

.profile-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--space-6, 24px);
}

@media (max-width: 768px) {
  .profile-layout {
    grid-template-columns: 1fr;
  }
}

/* 基础信息卡 */
.info-card {
  background: var(--bg-surface, var(--color-bg-elevated, #12141d));
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-6, 24px);
  box-shadow: var(--shadow-card, 0 0 0 1px rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.4));
}

.avatar-section {
  display: flex;
  align-items: center;
  gap: var(--space-4, 16px);
  margin-bottom: var(--space-6, 24px);
}

.avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--primary-dim, rgba(34,211,238,0.12));
  color: var(--primary, #22d3ee);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 600;
}

.avatar-name {
  font-size: var(--text-lg, 18px);
  font-weight: 600;
  color: var(--text-primary, #f1f5f9);
}

.avatar-major {
  font-size: var(--text-sm, 14px);
  color: var(--text-secondary, #94a3b8);
  margin-top: 2px;
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  font-size: var(--text-sm, 14px);
  color: var(--text-muted, #64748b);
}

.info-value {
  font-size: var(--text-sm, 14px);
  color: var(--text-primary, #f1f5f9);
  font-weight: 500;
}

.info-value.highlight {
  color: var(--primary, #22d3ee);
  font-family: var(--font-display, sans-serif);
}

/* AI 评价卡 */
.ai-card {
  margin-top: var(--space-4, 16px);
  background: var(--bg-surface, #12141d);
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-6, 24px);
  box-shadow: var(--shadow-card, 0 0 0 1px rgba(255,255,255,0.08));
}

.ai-header {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  margin-bottom: var(--space-4, 16px);
}

.ai-icon {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm, 8px);
  background: var(--primary-dim, rgba(34,211,238,0.12));
  color: var(--primary, #22d3ee);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
}

.ai-title {
  font-size: var(--text-sm, 14px);
  font-weight: 600;
  color: var(--text-primary, #f1f5f9);
}

.ai-section {
  margin-bottom: var(--space-3, 12px);
}

.ai-tag {
  font-size: var(--text-xs, 12px);
  padding: 2px 8px;
  border-radius: var(--radius-pill, 999px);
  margin-bottom: var(--space-2, 8px);
  display: inline-block;
}

.ai-tag--good {
  background: rgba(52,211,153,0.1);
  color: var(--success, #34d399);
}

.ai-tag--weak {
  background: rgba(248,113,113,0.1);
  color: var(--danger, #f87171);
}

.ai-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
}

.topic-tag {
  font-size: var(--text-xs, 12px);
  padding: 4px 10px;
  border-radius: var(--radius-pill, 999px);
}

.topic-tag--good {
  background: rgba(52,211,153,0.1);
  color: var(--success, #34d399);
}

.topic-tag--weak {
  background: rgba(248,113,113,0.1);
  color: var(--danger, #f87171);
}

.ai-empty {
  font-size: var(--text-sm, 14px);
  color: var(--text-muted, #64748b);
}

/* 知识路径卡 */
.path-card,
.timeline-card {
  background: var(--bg-surface, #12141d);
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-6, 24px);
  box-shadow: var(--shadow-card, 0 0 0 1px rgba(255,255,255,0.08));
  margin-bottom: var(--space-6, 24px);
}

.card-title {
  margin: 0 0 var(--space-6, 24px);
  font-size: var(--text-lg, 18px);
  font-weight: 600;
  color: var(--text-primary, #f1f5f9);
}

.knowledge-path {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
}

.path-node-wrap {
  display: flex;
  align-items: center;
}

.path-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1, 4px);
  min-width: 80px;
}

.path-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}

.path-node--mastered .path-icon {
  background: rgba(52,211,153,0.15);
  color: var(--success, #34d399);
  border: 2px solid var(--success, #34d399);
}

.path-node--learning .path-icon {
  background: var(--primary-dim, rgba(34,211,238,0.12));
  color: var(--primary, #22d3ee);
  border: 2px solid var(--primary, #22d3ee);
}

.path-node--pending .path-icon {
  background: var(--bg-elevated, #1a1d29);
  color: var(--text-muted, #64748b);
  border: 2px solid var(--border-subtle, rgba(255,255,255,0.08));
}

.path-node--target .path-icon {
  background: rgba(168,85,247,0.1);
  color: var(--accent, #a855f7);
  border: 2px solid var(--accent, #a855f7);
}

.path-label {
  font-size: var(--text-xs, 12px);
  color: var(--text-secondary, #94a3b8);
}

.path-connector {
  width: 32px;
  height: 2px;
  margin: 0 var(--space-1, 4px);
}

.connector--done { background: var(--success, #34d399); }
.connector--active { background: var(--primary, #22d3ee); }
.connector--future { background: var(--border-subtle, rgba(255,255,255,0.08)); }

/* 时间线 */
.timeline {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.timeline-item {
  display: flex;
  gap: var(--space-3, 12px);
  position: relative;
}

.timeline-item:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 16px;
  bottom: -16px;
  width: 2px;
  background: var(--border-subtle, rgba(255,255,255,0.08));
}

.timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 4px;
  flex-shrink: 0;
}

.timeline-item--done .timeline-dot { background: var(--success, #34d399); }
.timeline-item--active .timeline-dot { background: var(--primary, #22d3ee); box-shadow: 0 0 0 4px var(--primary-dim, rgba(34,211,238,0.12)); }
.timeline-item--future .timeline-dot { background: var(--bg-elevated, #1a1d29); border: 2px solid var(--text-muted, #64748b); }

.timeline-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.timeline-date {
  font-size: var(--text-xs, 12px);
  color: var(--text-muted, #64748b);
  font-family: var(--font-display, var(--font-mono, monospace));
}

.timeline-text {
  font-size: var(--text-sm, 14px);
  color: var(--text-primary, #f1f5f9);
}
</style>
