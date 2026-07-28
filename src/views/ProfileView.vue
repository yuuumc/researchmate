<script setup>
import { computed } from 'vue'
import { useProfileStore } from '@/stores/profile'
import KnowledgeGraph from '@/components/KnowledgeGraph.vue'

const profileStore = useProfileStore()
const profile = computed(() => profileStore.profile)
</script>

<template>
  <div class="profile-view">
    <KnowledgeGraph :node-count="14" :flow-dots="true" />

    <div class="profile-content">
      <div class="page-header">
        <div class="page-eyebrow">
          <span class="dot"></span>
          <span>Student Profile</span>
        </div>
        <h1 class="page-title">学生画像</h1>
        <p class="page-subtitle">全局共享 · 5 Agent 共读 · 互斥更新（mastered &gt; weak）</p>
      </div>

      <div class="profile-grid">
        <!-- 基础信息卡 -->
        <section class="card info-card">
          <div class="card-header">
            <span class="card-icon">●</span>
            <div>
              <div class="card-title">基础信息</div>
              <div class="card-en">Identity</div>
            </div>
          </div>
          <div class="info-rows">
            <div class="info-row">
              <span class="info-label">目标专业</span>
              <span class="info-value">{{ profile.target_major || '微电子' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">目标地区</span>
              <span class="info-value">{{ profile.target_region || '长三角' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">本科层次</span>
              <span class="info-value">{{ profile.bachelor_tier || '双非' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">备考周期</span>
              <span class="info-value">{{ profile.total_weeks || '38' }} 周</span>
            </div>
          </div>
        </section>

        <!-- 掌握点 -->
        <section class="card mastered-card">
          <div class="card-header">
            <span class="card-icon active">●</span>
            <div>
              <div class="card-title">已掌握</div>
              <div class="card-en">Mastered</div>
            </div>
            <span class="count">{{ profile.mastered_topics?.length || 0 }}</span>
          </div>
          <div v-if="profile.mastered_topics?.length" class="points-list">
            <span v-for="(p, i) in profile.mastered_topics" :key="i" class="point active">
              <span class="point-dot"></span>
              {{ p }}
            </span>
          </div>
          <div v-else class="empty">暂无数据，去和导师对话积累</div>
        </section>

        <!-- 薄弱点 -->
        <section class="card weak-card">
          <div class="card-header">
            <span class="card-icon weak">●</span>
            <div>
              <div class="card-title">待加强</div>
              <div class="card-en">Weak</div>
            </div>
            <span class="count">{{ profile.weak_topics?.length || 0 }}</span>
          </div>
          <div v-if="profile.weak_topics?.length" class="points-list">
            <span v-for="(p, i) in profile.weak_topics" :key="i" class="point weak">
              <span class="point-dot"></span>
              {{ p }}
            </span>
          </div>
          <div v-else class="empty">暂无数据，去做诊断测试</div>
        </section>

        <!-- 学习目标 -->
        <section class="card goal-card">
          <div class="card-header">
            <span class="card-icon">●</span>
            <div>
              <div class="card-title">学习目标</div>
              <div class="card-en">Goal</div>
            </div>
          </div>
          <div v-if="profile.goal" class="goal-text">{{ profile.goal }}</div>
          <div v-else class="empty">未设定目标</div>
        </section>

        <!-- 最近诊断 -->
        <section v-if="profile.recent_diagnosis" class="card diagnosis-card wide">
          <div class="card-header">
            <span class="card-icon">●</span>
            <div>
              <div class="card-title">最近诊断</div>
              <div class="card-en">Latest Diagnosis</div>
            </div>
          </div>
          <div class="diag-score">
            <span class="score-num">{{ profile.recent_diagnosis.score }}</span>
            <span class="score-unit">分</span>
            <span class="score-time">{{ profile.recent_diagnosis.time }}</span>
          </div>
        </section>
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

/* === 卡片网格 === */
.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: 20px 22px;
  box-shadow: var(--shadow-sm);
  transition: all var(--duration-base) var(--ease-out);
  animation: float-up 0.5s var(--ease-out) both;
}

.card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.card.wide {
  grid-column: span 2;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.card-icon {
  color: var(--color-fg-muted);
  font-size: 10px;
}

.card-icon.active {
  color: var(--color-node-active);
}

.card-icon.weak {
  color: var(--color-node-weak);
}

.card-title {
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 700;
  color: var(--color-ink-900);
}

.card-en {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-tertiary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.count {
  margin-left: auto;
  padding: 2px 10px;
  background: var(--color-bg-sunken);
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-ink-700);
}

/* === 基础信息 === */
.info-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px dashed var(--color-border-subtle);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 12px;
  color: var(--color-fg-secondary);
}

.info-value {
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink-900);
}

/* === 知识点列表 === */
.points-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.point {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--color-bg-sunken);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--color-ink-700);
}

.point-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

.point.active .point-dot {
  background: var(--color-node-active);
  box-shadow: 0 0 0 2px rgba(0, 212, 170, 0.25);
}

.point.weak .point-dot {
  background: var(--color-node-weak);
  box-shadow: 0 0 0 2px rgba(255, 107, 107, 0.25);
}

.empty {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-muted);
  font-style: italic;
  padding: 12px 0;
}

/* === 目标 === */
.goal-text {
  font-family: var(--font-serif);
  font-size: 14px;
  color: var(--color-ink-900);
  line-height: 1.7;
}

/* === 诊断 === */
.diag-score {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.score-num {
  font-family: var(--font-serif);
  font-size: 32px;
  font-weight: 700;
  color: var(--color-ink-900);
  line-height: 1;
}

.score-unit {
  font-size: 13px;
  color: var(--color-fg-secondary);
}

.score-time {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-muted);
}

/* === 移动端响应式 === */
@media (max-width: 768px) {
  .profile-content { padding: 24px 16px 48px; }
  .page-title { font-size: 26px; }
  .page-subtitle { font-size: 12px; }
  .profile-grid { grid-template-columns: 1fr; gap: 12px; }
  .card { padding: 16px 18px; }
  .card.wide { grid-column: span 1; }
  .page-eyebrow { font-size: 10px; padding: 3px 10px; }
}

@media (max-width: 375px) {
  .profile-content { padding: 20px 12px 40px; }
  .page-title { font-size: 22px; }
  .card-title { font-size: 14px; }
  .info-row { padding: 6px 0; }
  .info-value { font-size: 12px; }
}
</style>
