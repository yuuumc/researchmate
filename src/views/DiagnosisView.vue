<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProfileStore } from '@/stores/profile'
import { useDiagnosisStore } from '@/stores/diagnosis'
import { useMasteryData } from '@/composables/useMasteryData'
import { buildDiagnosisInput } from '@/utils/diagnosisInput'
import DiagnosisReport from '@/components/DiagnosisReport.vue'
import AiGeneratedBadge from '@/components/AiGeneratedBadge.vue'
import { SEED_DIAGNOSIS_REPORT, SEED_ABILITY_STARS } from '@/data/seedDemo'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const profileStore = useProfileStore()
const diagnosisStore = useDiagnosisStore()
const authStore = useAuthStore()
// A1: 统一学情数据层 — 星图 / 根因链 / 分数均直读共享数据源（Bug2/A1-b）
const mastery = useMasteryData()

// P0-1: 进入诊断页先从 DB 拉历史，填充 latestDiagnosis（旧版 seeded 数据兜底加载链路）
onMounted(async () => {
  try { await diagnosisStore.loadFromDB() } catch (e) { /* silent */ }
})

// 是否有真实诊断数据（API 结果 / profile 能力星图 / 诊断历史记录）
// 已登录用户无数据时显示空状态，不回退到种子 mock
const hasRealData = computed(() => {
  if (hasApiResult.value) return true
  if (authStore.isGuest) return true
  // A1: 直读统一数据层 — 有最近诊断记录或能力星图非空即视为有数据
  if (mastery.latestDiagnosis.value) return true
  if (mastery.abilityStars.value.length >= 3) return true
  return false
})

// ========== v3.1.1: Agent API 结果 ==========
const hasApiResult = computed(() => !!diagnosisStore.lastReport?.structured)
const apiData = computed(() => diagnosisStore.lastReport?.structured || {})
const loading = computed(() => diagnosisStore.loading)
const error = computed(() => diagnosisStore.error)

// A1: 能力星图直读统一数据层（与主页同源同阈值：1-2弱/3发展中/4-5优势 — A1-b）
const abilityStars = computed(() => {
  const stars = mastery.abilityStars.value
  if (stars.length >= 3) return stars
  // 游客 fallback：profile 可能为空（store reset 后），用种子星图
  if (authStore.isGuest) {
    return SEED_ABILITY_STARS
  }
  return stars
})

const strengths = computed(() => abilityStars.value.filter((a) => a.type === 'strength').slice(0, 3))
// P2: /diagnosis 薄弱点对齐本次诊断 LLM 评分原始输出（不读历史星级、不过滤已掌握）
// 与下方 4 层根因链同源（reportData.weak_points），保证 duo-card 与根因链数量/名称一致
const weakPoints = computed(() => abilityStars.value.filter((a) => a.type === 'weak'))
// 摘要数字用完整计数（不 slice），与星图一致
const strengthsCount = computed(() => abilityStars.value.filter((a) => a.type === 'strength').length)
// P2: 薄弱计数对齐本次诊断（与 duo-card 同源），非历史星级计数
const weakPointsCount = computed(() => weakPoints.value.length)

// A1/Bug2: 诊断报告直读统一数据层 rootCauseChain（持久化 structured，离开完成页仍可渲染 4 层根因链）
const reportData = computed(() => {
  // 统一数据层（优先内存新鲜结果 → 持久化 structured）
  const rc = mastery.rootCauseChain.value
  if (rc) return rc
  // 游客：显示种子 demo 数据（评委展示用）
  if (authStore.isGuest) {
    return {
      score: SEED_DIAGNOSIS_REPORT.score,
      subject: SEED_DIAGNOSIS_REPORT.subject,
      weak_points: (SEED_DIAGNOSIS_REPORT.weak_points || []).map(p => typeof p === 'object' ? p.knowledge_point || p.reason || JSON.stringify(p) : p),
      direct_causes: SEED_DIAGNOSIS_REPORT.direct_causes || [],
      middle_causes: SEED_DIAGNOSIS_REPORT.middle_causes || [],
      root_causes: SEED_DIAGNOSIS_REPORT.root_causes || [],
      remediation: SEED_DIAGNOSIS_REPORT.remediation || ''
    }
  }
  return null
})

// 能力总评：API overall_level 优先，否则从星图均值计算
const overallLevel = computed(() => {
  if (apiData.value.overall_level != null) return apiData.value.overall_level
  const avg = abilityStars.value.reduce((s, a) => s + a.star, 0) / (abilityStars.value.length || 1)
  return Math.round((avg / 5) * 100)
})

// 诊断理由（v3.1.1 新增字段）
const diagnosisReason = computed(() => apiData.value.diagnosis_reason || '')

// 发起诊断
async function generateDiagnosis() {
  try {
    await diagnosisStore.runDiagnosis(buildDiagnosisInput())
  } catch {
    // error 已在 store 中设置
  }
}

function goChat() {
  router.push({ path: '/chat', query: { agent: 'diagnose' } })
}

// P0 #8: 诊断完成 → 引导进入旗舰旅程下一步（规划）
function goJourney() {
  router.push('/journey')
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

      <!-- 生成诊断入口 -->
      <section class="generate-section">
        <button class="generate-btn generate-btn--mixed" @click="router.push('/diagnosis/session')">开始混合诊断（做题模式）</button>
        <!-- T0-6: 隐藏「生成个性化诊断报告」模式入口，仅保留做题模式 -->
        <!-- <button class="generate-btn" :disabled="loading" @click="generateDiagnosis">
          <span v-if="loading" class="generate-spinner"></span>
          <span>{{ loading ? 'AI 诊断中…' : hasApiResult ? '重新生成诊断报告' : '生成个性化诊断报告' }}</span>
        </button> -->
      </section>

      <!-- 空状态：无诊断数据 -->
      <section v-if="!hasRealData && !loading" class="empty-state-card">
        <div class="empty-icon">◯</div>
        <div class="empty-title">尚未进行诊断</div>
        <div class="empty-desc">完成一次混合诊断或生成 AI 诊断报告后，这里将展示你的能力星图、优势薄弱点和 4 层根因链</div>
        <button class="empty-btn" @click="router.push('/diagnosis/session')">开始混合诊断</button>
        <!-- T0-6: 隐藏 AI 诊断报告入口 -->
        <!-- <button class="empty-btn empty-btn--ghost" @click="generateDiagnosis" :disabled="loading">生成 AI 诊断报告</button> -->
      </section>

      <!-- 顶部概览：总分 + 能力等级 -->
      <section v-if="hasRealData && reportData" class="overview-row">
        <div class="overview-card overview-card--score">
          <div class="ov-label">
            LAST DIAGNOSIS
            <span v-if="hasApiResult" class="api-badge">AI</span>
          </div>
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
          <div class="ov-hint">{{ strengthsCount }} 优势(累计) · {{ weakPointsCount }} 薄弱(累计)</div>
        </div>
        <div class="overview-card overview-card--subject">
          <div class="ov-label">SUBJECT</div>
          <div class="ov-subject">{{ reportData.subject }}</div>
        </div>
      </section>

      <!-- 能力星图 -->
      <section v-if="hasRealData" class="section">
        <div class="section-head">
          <span class="section-icon">★</span>
          <span class="section-title">能力星图</span>
          <span class="section-en">Ability Radar</span>
          <span class="section-legend">累计星级 · 含历史诊断与练习数据（非本次诊断输出）</span>
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
      <section v-if="hasRealData" class="duo-section">
        <div class="duo-card duo-card--strength">
          <div class="duo-head">
            <span class="duo-icon">▲</span>
            <span class="duo-title">优势项</span>
            <span class="duo-en">Strengths</span>
            <span class="duo-source">累计星级</span>
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
            <span class="duo-source">累计星级</span>
          </div>
          <ul class="duo-list">
            <li v-if="weakPoints.length === 0" class="duo-empty">暂无薄弱知识点</li>
            <li v-for="w in weakPoints" :key="w.topic">
              <span class="duo-name">{{ w.topic }}</span>
              <span class="duo-meta">{{ w.star }}★ · {{ w.score }}分</span>
            </li>
          </ul>
        </div>
      </section>

      <!-- 诊断结论：4 层根因链（复用 DiagnosisReport） -->
      <section v-if="hasRealData" class="section">
        <div class="section-head">
          <span class="section-icon">◈</span>
          <span class="section-title">诊断结论 · 4 层根因链</span>
          <span class="section-en">Root Cause Chain</span>
          <AiGeneratedBadge v-if="hasApiResult" />
        </div>
        <DiagnosisReport :report="reportData" />
      </section>

      <!-- 诊断理由（v3.1.1 新增字段） -->
      <section v-if="diagnosisReason" class="section">
        <div class="section-head">
          <span class="section-icon">◉</span>
          <span class="section-title">诊断理由</span>
          <span class="section-en">Diagnosis Reason</span>
        </div>
        <div class="reason-card">
          <p class="reason-text">{{ diagnosisReason }}</p>
        </div>
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

      <!-- P0 #8: 诊断完成 → 引导进入旗舰旅程（规划步） -->
      <section v-if="hasApiResult" class="journey-cta-section">
        <div class="journey-cta-content">
          <span class="journey-cta-badge">Flagship Journey</span>
          <span class="journey-cta-title">基于诊断结果生成个性化规划</span>
          <span class="journey-cta-desc">进入旗舰旅程，诊断 → 规划 → 科研三步接力</span>
        </div>
        <button class="journey-cta-btn" @click="goJourney">
          <span>继续旗舰旅程</span>
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

/* === 生成诊断入口 === */
.generate-section {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 28px;
  padding: 16px 20px;
  background: color-mix(in srgb, #4d9de0 5%, var(--color-bg-elevated));
  border: 1px dashed color-mix(in srgb, #4d9de0 30%, transparent);
  border-radius: var(--radius-lg);
}

.generate-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  background: #4d9de0;
  color: #fff;
  border: none;
  border-radius: var(--radius-full);
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.generate-btn:hover:not(:disabled) {
  background: #3a87c4;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px color-mix(in srgb, #4d9de0 30%, transparent);
}

.generate-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.generate-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.generate-hint {
  font-size: 12px;
  color: var(--color-fg-tertiary);
}

.generate-error {
  width: 100%;
  margin-top: 4px;
  padding: 8px 12px;
  background: color-mix(in srgb, #ff6b6b 10%, transparent);
  border: 1px solid color-mix(in srgb, #ff6b6b 30%, transparent);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: #d9483f;
}

.api-badge {
  display: inline-block;
  padding: 1px 6px;
  margin-left: 6px;
  background: linear-gradient(135deg, #4d9de0, #00d4aa);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  border-radius: var(--radius-full);
  letter-spacing: 0.5px;
  vertical-align: middle;
}

/* === 诊断理由 === */
.reason-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-left: 3px solid #4d9de0;
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  padding: 14px 18px;
}

.reason-text {
  font-size: 13px;
  color: var(--color-ink-700);
  line-height: 1.8;
  margin: 0;
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
  display: flex;
  flex-direction: column;
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
  display: inline-flex;
  align-items: center;
  align-self: flex-end;
  margin-top: 8px;
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

/* === 旗舰旅程引导 CTA（P0 #8） === */
.journey-cta-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 24px;
  margin-top: 16px;
  background: linear-gradient(135deg, color-mix(in srgb, #9b59b6 7%, var(--color-bg-elevated)), color-mix(in srgb, #4d9de0 4%, var(--color-bg-elevated)));
  border: 1px solid color-mix(in srgb, #9b59b6 25%, transparent);
  border-radius: var(--radius-lg);
}

.journey-cta-content {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.journey-cta-badge {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  color: #9b59b6;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.journey-cta-title {
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 700;
  color: var(--color-ink-900);
}

.journey-cta-desc {
  font-size: 12px;
  color: var(--color-fg-secondary);
}

.journey-cta-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: #9b59b6;
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

.journey-cta-btn:hover {
  background: #8e44ad;
  transform: translateX(2px);
}

@media (max-width: 768px) {
  .overview-row { grid-template-columns: 1fr; }
  .duo-section { grid-template-columns: 1fr; }
  .cta-section { flex-direction: column; align-items: flex-start; }
  .journey-cta-section { flex-direction: column; align-items: flex-start; }
}

.generate-btn--mixed {
  background: linear-gradient(135deg, #38b2ac, #319795);
}
/* 空状态卡片 */
.empty-state-card {
  text-align: center;
  padding: 64px 32px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  margin-bottom: 32px;
}
.empty-state-card .empty-icon {
  font-size: 48px;
  color: var(--color-fg-muted);
  margin-bottom: 16px;
}
.empty-state-card .empty-title {
  font-family: var(--font-serif);
  font-size: 24px;
  color: var(--color-ink-900);
  margin-bottom: 8px;
}
.empty-state-card .empty-desc {
  font-size: 14px;
  color: var(--color-fg-tertiary);
  max-width: 400px;
  margin: 0 auto 24px;
  line-height: 1.6;
}
.empty-state-card .empty-btn {
  display: block;
  width: 240px;
  margin: 0 auto 12px;
  padding: 12px 24px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-ink-700);
  color: var(--color-fg-inverse);
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s;
}
.empty-state-card .empty-btn:hover:not(:disabled) {
  background: var(--color-ink-900);
  box-shadow: var(--shadow-md);
}
.empty-state-card .empty-btn--ghost {
  background: transparent;
  color: var(--color-ink-500);
  border: 1px solid var(--color-border-default);
}
.empty-state-card .empty-btn--ghost:hover:not(:disabled) {
  border-color: var(--color-ink-500);
  color: var(--color-ink-700);
  background: var(--color-bg-sunken);
}
.empty-state-card .empty-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* P2: 数据源区分标识 */
.duo-source {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-fg-muted) 14%, transparent);
  color: var(--color-fg-secondary);
}
.duo-source--current {
  background: color-mix(in srgb, #4d9de0 16%, transparent);
  color: #2c7da0;
}
.duo-empty {
  font-size: 13px;
  color: var(--color-fg-tertiary);
  padding: 8px 0;
}
.section-legend {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-tertiary);
  letter-spacing: 0.3px;
}
</style>