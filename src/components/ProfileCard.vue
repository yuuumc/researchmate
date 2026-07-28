<script setup>
import { computed } from 'vue'
import { useProfileStore } from '@/stores/profile'

const profileStore = useProfileStore()

// 能力星级列表（按星级升序，薄弱的在前）
const abilityList = computed(() => {
  const stars = profileStore.profile.ability_stars || {}
  return Object.entries(stars)
    .map(([topic, s]) => ({ topic, stars: s }))
    .sort((a, b) => a.stars - b.stars)
})

const stageLabel = computed(() => {
  const map = {
    initial: '起步',
    basic: '基础',
    intensive: '强化',
    sprint: '冲刺'
  }
  return map[profileStore.profile.preparation_stage] || '起步'
})

function renderStars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}
</script>

<template>
  <div class="profile-card">
    <div class="card-header">
      <h3>学生认知模型</h3>
      <span class="stage-badge">{{ stageLabel }}阶段</span>
    </div>

    <div class="card-body">
      <!-- 身份信息 -->
      <div class="identity-section">
        <div class="avatar">
          {{ profileStore.profile.name ? profileStore.profile.name.charAt(0) : '学' }}
        </div>
        <div class="identity-info">
          <div class="name">{{ profileStore.profile.name || '未命名学生' }}</div>
          <div class="meta">
            <span v-if="profileStore.profile.major">{{ profileStore.profile.major }}</span>
            <span v-if="profileStore.profile.target_direction" class="dot">·</span>
            <span v-if="profileStore.profile.target_direction">{{ profileStore.profile.target_direction }}</span>
          </div>
        </div>
      </div>

      <!-- 考研倒计时 -->
      <div v-if="profileStore.daysLeft !== null" class="countdown-row">
        <span class="label">距离考研</span>
        <span class="countdown-value">{{ profileStore.daysLeft }}<small>天</small></span>
      </div>

      <!-- 综合能力进度条 -->
      <div class="ability-overview">
        <div class="ability-header">
          <span class="label">专业能力</span>
          <span class="ability-percent">{{ profileStore.abilityLevel }}%</span>
        </div>
        <div class="ability-bar">
          <div class="ability-fill" :style="{ width: profileStore.abilityLevel + '%' }"></div>
        </div>
      </div>

      <!-- 最大短板（高亮） -->
      <div v-if="profileStore.biggestWeakness" class="weakness-highlight">
        <span class="weakness-label">最大短板</span>
        <span class="weakness-topic">{{ profileStore.biggestWeakness.topic }}</span>
      </div>

      <!-- 能力星级列表 -->
      <div v-if="abilityList.length > 0" class="topics-section">
        <div class="section-title">
          能力星级
          <span class="count">{{ abilityList.length }}</span>
        </div>
        <div class="star-list">
          <div
            v-for="item in abilityList"
            :key="item.topic"
            class="star-row"
            :class="{ 'star-weak': item.stars <= 2, 'star-mastered': item.stars === 5 }"
          >
            <span class="star-topic">{{ item.topic }}</span>
            <span class="star-value">{{ renderStars(item.stars) }}</span>
          </div>
        </div>
      </div>

      <!-- 薄弱知识点 chips -->
      <div class="topics-section">
        <div class="section-title">
          薄弱知识点
          <span class="count">{{ profileStore.weakCount }}</span>
        </div>
        <div v-if="profileStore.weakCount > 0" class="chip-list">
          <span
            v-for="t in profileStore.profile.weak_topics"
            :key="`w-${t}`"
            class="chip chip-weak"
          >
            {{ t }}
          </span>
        </div>
        <div v-else class="empty-hint">暂无</div>
      </div>

      <!-- 已掌握 chips -->
      <div class="topics-section">
        <div class="section-title">
          已掌握
          <span class="count">{{ profileStore.masteredCount }}</span>
        </div>
        <div v-if="profileStore.masteredCount > 0" class="chip-list">
          <span
            v-for="t in profileStore.profile.mastered_topics"
            :key="`m-${t}`"
            class="chip chip-mastered"
          >
            {{ t }}
          </span>
        </div>
        <div v-else class="empty-hint">暂无</div>
      </div>

      <!-- 学习风格 -->
      <div class="style-row">
        <span class="label">学习风格</span>
        <span class="style-value">{{ profileStore.learningStyleLabel }}</span>
      </div>

      <!-- 最近诊断 -->
      <div v-if="profileStore.profile.last_diagnosis_score !== null" class="diagnosis-row">
        <span class="label">最近诊断</span>
        <span class="value">{{ profileStore.profile.last_diagnosis_score }} 分</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-card {
  background: var(--color-surface-default);
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  overflow: hidden;
}

.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border-subtle);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.stage-badge {
  padding: 2px 8px;
  background: var(--color-brand-50);
  color: var(--color-brand-700);
  border-radius: 9999px;
  font-size: 12px;
}

.card-body {
  padding: 20px;
}

/* === 身份信息 === */
.identity-section {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--color-brand-100);
  color: var(--color-brand-700);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
}

.identity-info {
  flex: 1;
  min-width: 0;
}

.identity-info .name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-fg-primary);
  margin-bottom: 2px;
}

.identity-info .meta {
  font-size: 12px;
  color: var(--color-fg-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.identity-info .meta .dot {
  color: var(--color-fg-tertiary);
}

/* === 倒计时 === */
.countdown-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 10px 12px;
  margin-bottom: 14px;
  background: linear-gradient(135deg, var(--color-brand-50), transparent);
  border-radius: 6px;
  border-left: 3px solid var(--color-brand-500);
}

.countdown-row .label {
  font-size: 13px;
  color: var(--color-fg-secondary);
}

.countdown-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-brand-700);
  font-variant-numeric: tabular-nums;
}

.countdown-value small {
  font-size: 12px;
  font-weight: 500;
  margin-left: 2px;
}

/* === 综合能力 === */
.ability-overview {
  margin-bottom: 14px;
}

.ability-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 13px;
}

.ability-header .label {
  color: var(--color-fg-secondary);
}

.ability-percent {
  font-weight: 600;
  color: var(--color-fg-primary);
  font-variant-numeric: tabular-nums;
}

.ability-bar {
  height: 6px;
  background: var(--color-neutral-bg);
  border-radius: 3px;
  overflow: hidden;
}

.ability-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-brand-400), var(--color-brand-600));
  border-radius: 3px;
  transition: width 0.6s ease;
}

/* === 最大短板高亮 === */
.weakness-highlight {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  margin-bottom: 14px;
  background: var(--color-error-bg);
  border-radius: 6px;
  border-left: 3px solid var(--color-error);
}

.weakness-label {
  font-size: 12px;
  color: var(--color-error);
  font-weight: 500;
}

.weakness-topic {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-error);
}

/* === 能力星级列表 === */
.topics-section {
  margin-top: 16px;
}

.section-title {
  font-size: 13px;
  color: var(--color-fg-secondary);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.count {
  padding: 1px 6px;
  background: var(--color-neutral-bg);
  color: var(--color-fg-secondary);
  border-radius: 9999px;
  font-size: 11px;
}

.star-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.star-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: var(--color-neutral-bg);
  border-radius: 4px;
  font-size: 13px;
  transition: all 0.2s;
}

.star-row.star-weak {
  background: var(--color-error-bg);
}

.star-row.star-mastered {
  background: var(--color-success-bg);
}

.star-topic {
  color: var(--color-fg-primary);
}

.star-value {
  color: var(--color-brand-600);
  letter-spacing: 1px;
  font-variant-numeric: tabular-nums;
}

.star-weak .star-value {
  color: var(--color-error);
}

.star-mastered .star-value {
  color: var(--color-success);
}

/* === chips === */
.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
}

.chip-weak {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.chip-mastered {
  background: var(--color-success-bg);
  color: var(--color-success);
}

/* === 学习风格 / 诊断 === */
.style-row,
.diagnosis-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  margin-top: 12px;
  font-size: 13px;
  border-top: 1px solid var(--color-border-subtle);
}

.style-row .label,
.diagnosis-row .label {
  color: var(--color-fg-secondary);
}

.style-value,
.diagnosis-row .value {
  color: var(--color-fg-primary);
  font-weight: 500;
}

.empty-hint {
  font-size: 12px;
  color: var(--color-fg-tertiary);
}
</style>
