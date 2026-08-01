<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProfileStore } from '@/stores/profile'
import DiagnosisReport from '@/components/DiagnosisReport.vue'
import { SEED_DIAGNOSIS_REPORT, SEED_ABILITY_STARS } from '@/data/seedDemo'

const router = useRouter()
const profileStore = useProfileStore()

// 能力维度（优先用 store 实际画像，空时回退种子）
const abilityStars = computed(() => {
  const stars = profileStore.profile?.ability_stars
  if (stars && Object.keys(stars).length >= 3) {
    return Object.entries(stars).map(([topic, star]) => {
      const isWeak = star <= 2
      const score = profileStore.profile?.subject_scores?.find((s) => s.subject === topic)?.score
      return {
        topic,
        star,
        score: typeof score === 'number' ? score : star * 20,
        type: isWeak ? 'weak' : 'strength'
      }
    })
  }
  return SEED_ABILITY_STARS
})

const strengths = computed(() => abilityStars.value.filter((a) => a.type === 'strength').slice(0, 3))
const weakPoints = computed(() => abilityStars.value.filter((a) => a.type === 'weak').slice(0, 2))

const reportData = computed(() => SEED_DIAGNOSIS_REPORT)

// 能力总评
const overallLevel = computed(() => {
  const avg = abilityStars.value.reduce((s, a) => s + a.star, 0) / (abilityStars.value.length || 1)
  return Math.round((avg / 5) * 100)
})

function goChat() {
  router.push({ path: '/chat', query: { agent: 'diagnose' } })
}
</script>

<template>
  <div class="diagnosis-view">
    <div class="page-content">
      <!-- 页头 -->
      <div class="page-header">
        <div class="page-eyebrow"><span class="dot"></span><span>Diagnosis Agent</span></div>
        <h1 class="page-title">成长诊断</h1>
        <p class="page-subtitle">4 层根因链 · 能力星图 · 精准定位薄弱环节</p>
      </div>

      <!-- 顶部概览：总分 + 能力等级 -->
      <section class="overview-row">
        <div class="overview-card overview-card--score">
          <div class="ov-label">LAST DIAGNOSIS</div>
          <div class="ov-score">
            <span class="ov-num">{{ reportData.score }}</span><span class="ov-unit">分</span>
          </div>
          <div class="ov-bar">
            <div class="ov-fill" :style="{ width: (reportData.score / 1.5) + '%' }"></div>
          </div>
        </div>
        <div class="overview-card overview-card--level">
          <div class="ov-label">ABILITY LEVEL</div>
          <div class="ov-score">
            <span class="ov-num">{{ overallLevel }}</span><span class="ov-unit">%</span>
          </div>
          <div class="ov-hint">{{ strengths.length }} 优势 · {{ weakPoints.length }} 薄弱</div>
        </div>
        <div class="overview-card overview-card--subject">
          <div class="ov-label">SUBJECT</div>
          <div class="ov-subject">{{ reportData.subject }}</div>
        </div>
      </section>

      <!-- 能力星图 -->
      <section class="section">
        <div class="section-head">
          <span class="section-icon">★</span>
          <span class="section-title">能力星图</span>
          <span class="section-en">Ability Radar</span>
        </div>
        <div class="ability-grid">
          <div
            v-for="a in abilityStars"
            :key="a.topic"
            class="ability-item"
            :class="{ 'ability-item--weak': a.type === 'weak' }"
          >
            <div class="ability-top">
              <span class="ability-topic">{{ a.topic }}</span>
              <span class="ability-score">{{ a.score }}分</span>
            </div>
            <div class="ability-stars">
              <span
                v-for="n in 5"
                :key="n"
                class="star"
                :class="{ filled: n <= a.star }"
              >★</span>
            </div>
            <div class="ability-bar">
              <div class="ability-bar-fill" :style="{ width: (a.score) + '%' }"></div>
            </div>
            <span class="ability-tag" :class="a.type === 'weak' ? 'tag-weak' : 'tag-strong'">
              {{ a.type === 'weak' ? '薄弱' : '优势' }}
            </span>
          </div>
        </div>
      </section>

      <!-- 优势 / 薄弱点 双栏 -->
      <section class="duo-section">
        <div class="duo-card duo-card--strength">
          <div class="duo-head">
            <span class="duo-icon">▲</span>
            <span class="duo-title">优势项</span>
            <span class="duo-en">Strengths</span>
          </div>
          <ul class="duo-list">
            <li v-for="s in strengths" :key="s.topic">
              <span class="duo-name">{{ s.topic }}</span>
              <span class="duo-meta">{{ s.star }}★ · {{ s.score }}分</span>
            </li>
          </ul>
        </div>
        <div class="duo-card duo-card--weak">
          <div class="duo-head">
            <span class="duo-icon">▼</span>
            <span class="duo-title">薄弱点</span>
            <span class="duo-en">Weak Points</span>
          </div>
          <ul class="duo-list">
            <li v-for="w in weakPoints" :key="w.topic">
              <span class="duo-name">{{ w.topic }}</span>
              <span class="duo-meta">{{ w.star }}★ · {{ w.score }}分</span>
            </li>
          </ul>
        </div>
      </section>

      <!-- 诊断结论：4 层根因链（复用 DiagnosisReport） -->
      <section class="section">
        <div class="section-head">
          <span class="section-icon">◈</span>
          <span class="section-title">诊断结论 · 4 层根因链</span>
          <span class="section-en">Root Cause Chain</span>
        </div>
        <DiagnosisReport :report="reportData" />
      </section>

      <!-- 进对话入口 -->
      <section class="cta-section">
        <div class="cta-text">
          <span class="cta-title">需要深入诊断某个薄弱点？</span>
          <span class="cta-sub">进入与 Diagnosis Agent 的对话，获取针对性追问与即时讲解</span>
        </div>
        <button class="cta-btn" @click="goChat">
          <span>与诊断导师对话</span>
          <span class="cta-arrow">→</span>
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.diagnosis-view {
  min-height: calc(100vh - 72px);
  background: var(--color-bg-base);
  padding: 32px 24px 64px;
}

.page-content {
  max-width: 880px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 28px;
}

.page-eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-tertiary);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.page-eyebrow .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4d9de0;
}

.page-title {
  font-family: var(--font-serif);
  font-size: 28px;
  font-weight: 700;
  color: var(--color-ink-900);
  margin: 0;
}

.page-subtitle {
  font-size: 14px;
  color: var(--color-fg-secondary);
  margin: 6px 0 0;
}

/* === 概览行 === */
.overview-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
  margin-bottom: 32px;
}

.overview-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: 18px 20px;
}

.ov-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-tertiary);
  letter-spacing: 1.5px;
  margin-bottom: 8px;
}

.ov-score {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.ov-num {
  font-family: var(--font-serif);
  font-size: 34px;
  font-weight: 700;
  color: var(--color-ink-900);
  line-height: 1;
}

.ov-unit {
  font-size: 14px;
  color: var(--color-fg-secondary);
}

.ov-bar {
  height: 4px;
  background: var(--color-bg-sunken);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-top: 10px;
}

.ov-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff6b6b, #ffd166, #00d4aa);
  border-radius: var(--radius-full);
}

.ov-hint {
  font-size: 12px;
  color: var(--color-fg-tertiary);
  margin-top: 10px;
}

.ov-subject {
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 600;
  color: var(--color-ink-900);
}

/* === 通用 section === */
.section {
  margin-bottom: 32px;
}

.section-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 16px;
}

.section-icon {
  color: #4d9de0;
  font-size: 14px;
}

.section-title {
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 700;
  color: var(--color-ink-900);
}

.section-en {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-tertiary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* === 能力星图 === */
.ability-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.ability-item {
  position: relative;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  padding: 14px 16px;
}

.ability-item--weak {
  border-color: color-mix(in srgb, #ff6b6b 40%, transparent);
}

.ability-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}

.ability-topic {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-900);
}

.ability-score {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-fg-secondary);
}

.ability-stars {
  display: flex;
  gap: 2px;
  margin-bottom: 8px;
}

.star {
  font-size: 14px;
  color: var(--color-border-default);
}

.star.filled {
  color: #ffd166;
}

.ability-bar {
  height: 4px;
  background: var(--color-bg-sunken);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.ability-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #4d9de0, #00d4aa);
  border-radius: var(--radius-full);
}

.ability-tag {
  position: absolute;
  top: 12px;
  right: 14px;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.tag-strong {
  background: color-mix(in srgb, #00d4aa 15%, transparent);
  color: #00a07d;
}

.tag-weak {
  background: color-mix(in srgb, #ff6b6b 15%, transparent);
  color: #d9483f;
}

/* === 优势/薄弱双栏 === */
.duo-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 32px;
}

.duo-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: 18px 20px;
}

.duo-card--strength {
  border-left: 3px solid #00d4aa;
}

.duo-card--weak {
  border-left: 3px solid #ff6b6b;
}

.duo-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
}

.duo-icon {
  font-size: 12px;
}

.duo-card--strength .duo-icon { color: #00d4aa; }
.duo-card--weak .duo-icon { color: #ff6b6b; }

.duo-title {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-ink-900);
}

.duo-en {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-tertiary);
  text-transform: uppercase;
}

.duo-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.duo-list li {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border-subtle);
}

.duo-list li:last-child {
  border-bottom: none;
}

.duo-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-ink-900);
}

.duo-meta {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-tertiary);
}

/* === CTA === */
.cta-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px;
  background: color-mix(in srgb, #4d9de0 6%, var(--color-bg-elevated));
  border: 1px solid color-mix(in srgb, #4d9de0 30%, transparent);
  border-radius: var(--radius-lg);
}

.cta-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cta-title {
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-ink-900);
}

.cta-sub {
  font-size: 12px;
  color: var(--color-fg-secondary);
}

.cta-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: #4d9de0;
  color: #fff;
  border: none;
  border-radius: var(--radius-full);
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.cta-btn:hover {
  background: #3a87c4;
  transform: translateX(2px);
}

.cta-arrow {
  font-size: 16px;
}

@media (max-width: 768px) {
  .overview-row { grid-template-columns: 1fr; }
  .duo-section { grid-template-columns: 1fr; }
  .cta-section { flex-direction: column; align-items: flex-start; }
}
</style>
