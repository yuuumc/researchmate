<script setup>
// ============================================================
// 旗舰旅程页（P0 #8 · 诊断 → 规划 → 科研 三步级联编排）
// ============================================================
// 比赛演示核心链路：三个 Agent 依次执行，前一个的输出作为
// 后一个的输入，全程共享学生画像（profileStore）。
// 每步独立 API 调用 · 用户可中断（重试/跳过）· 数据链路飞可见
// ============================================================
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useJourneyStore } from '@/stores/journey'
import { useDiagnosisStore } from '@/stores/diagnosis'
import { useProfileStore } from '@/stores/profile'
import JourneyFlow from '@/components/JourneyFlow.vue'

const router = useRouter()
const journeyStore = useJourneyStore()
const diagnosisStore = useDiagnosisStore()
const profileStore = useProfileStore()

const steps = computed(() => journeyStore.stepList)
const currentKey = computed(() => journeyStore.currentStepKey)
const progress = computed(() => journeyStore.progress)
const isComplete = computed(() => journeyStore.isComplete)

function stepState(key) {
  return journeyStore.steps[key] || {}
}

// 规划步输入来源提示（诊断 → 规划的数据链路证据）
const planInputHint = computed(() => {
  const latest = diagnosisStore.latest
  if (stepState('diagnose').status === 'done' && latest) {
    return `将使用刚才的诊断结果（${latest.score ?? '—'} 分 · ${latest.weak_points?.length || 0} 个薄弱点）作为规划输入`
  }
  if (latest) {
    return `将使用最近诊断（${latest.score ?? '—'} 分）作为规划输入`
  }
  return '无诊断记录，规划 Agent 将基于当前画像自行分析'
})

async function run(key) {
  try {
    await journeyStore.runStep(key)
  } catch {
    // error 已写入 store（该步标记为 error，可独立重试）
  }
}

async function retry(key) {
  try {
    await journeyStore.retryStep(key)
  } catch {
    // 同上
  }
}

function skip(key) {
  journeyStore.skipStep(key)
}

function goResearch() {
  router.push('/research')
}

function goDiagnosisReport() {
  router.push('/diagnosis')
}

function goPlanDetail() {
  router.push('/plan')
}

function resetJourney() {
  journeyStore.resetJourney()
}
</script>

<template>
  <div class="journey-view">
    <div class="journey-content">
      <!-- 页头 -->
      <div class="page-header">
        <div class="page-eyebrow"><span class="dot"></span><span>Flagship Journey</span></div>
        <h1 class="page-title">旗舰旅程</h1>
        <p class="page-subtitle">诊断 → 规划 → 科研 · 三个 Agent 接力协作，全程共享你的学生画像</p>
      </div>

      <!-- 步骤条 + 进度 -->
      <JourneyFlow />
      <div class="progress-row">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: progress + '%' }"></div>
        </div>
        <span class="progress-text">{{ progress }}%</span>
      </div>

      <!-- === 各步骤卡片 === -->
      <section
        v-for="step in steps"
        :key="step.key"
        class="step-card"
        :class="{
          'step-card--active': currentKey === step.key,
          'step-card--done': step.status === 'done',
          'step-card--error': step.status === 'error',
          'step-card--skipped': step.status === 'skipped'
        }"
      >
        <div class="step-head">
          <span class="step-icon" :style="{ background: step.color }">{{ step.icon }}</span>
          <div class="step-head-text">
            <span class="step-title">Step {{ steps.indexOf(step) + 1 }} · {{ step.title }}</span>
            <span class="step-desc">{{ step.desc }}</span>
          </div>
          <span class="step-agent-tag">{{ step.en }} Agent</span>
        </div>

        <!-- 待开始 / 进行中 -->
        <div v-if="step.status === 'pending' || step.status === 'running'" class="step-body">
          <!-- 诊断步 -->
          <template v-if="step.key === 'diagnose'">
            <p class="step-note">
              基于你的知识图谱（{{ Object.keys(profileStore.profile.ability_stars || {}).length }} 个知识点）与学习画像，AI 诊断 Agent 将输出能力星图、薄弱点与 4 层根因链。
            </p>
            <div class="step-actions">
              <button class="step-btn step-btn--primary" :disabled="step.status === 'running'" @click="run('diagnose')">
                {{ step.status === 'running' ? 'AI 诊断中…' : '开始 AI 诊断' }}
              </button>
              <button class="step-btn step-btn--ghost" :disabled="step.status === 'running'" @click="skip('diagnose')">
                跳过此步
              </button>
            </div>
          </template>

          <!-- 规划步 -->
          <template v-else-if="step.key === 'plan'">
            <p class="step-note">{{ planInputHint }}</p>
            <div class="step-actions">
              <button class="step-btn step-btn--primary" :disabled="step.status === 'running'" @click="run('plan')">
                {{ step.status === 'running' ? 'AI 规划中…' : '生成个性化计划' }}
              </button>
              <button class="step-btn step-btn--ghost" :disabled="step.status === 'running'" @click="skip('plan')">
                跳过此步
              </button>
            </div>
          </template>

          <!-- 科研步（P1 前仅入口） -->
          <template v-else>
            <p class="step-note">完成规划后，科研路线入口将自动解锁。</p>
          </template>
        </div>

        <!-- 失败：可独立重试，不影响已完成步骤 -->
        <div v-else-if="step.status === 'error'" class="step-body">
          <div class="step-error-banner">
            {{ step.error }}
          </div>
          <div class="step-actions">
            <button class="step-btn step-btn--primary" @click="retry(step.key)">重试此步</button>
            <button class="step-btn step-btn--ghost" @click="skip(step.key)">跳过此步</button>
          </div>
        </div>

        <!-- 已完成：摘要 + 可重跑 -->
        <div v-else-if="step.status === 'done'" class="step-body">
          <div class="step-summary">
            <!-- 诊断摘要 -->
            <template v-if="step.key === 'diagnose'">
              <span v-if="step.summary?.score != null" class="summary-chip">诊断分数 {{ step.summary.score }}</span>
              <span class="summary-chip">{{ step.summary?.weakCount ?? 0 }} 个薄弱点</span>
              <span class="summary-chip">{{ step.summary?.rootCauseCount ?? 0 }} 条根因</span>
              <span v-if="step.summary?.overall" class="summary-chip summary-chip--wide">{{ step.summary.overall }}</span>
            </template>
            <!-- 规划摘要 -->
            <template v-else-if="step.key === 'plan'">
              <span class="summary-chip">{{ step.summary?.weeks ?? 0 }} 周计划</span>
              <span v-if="step.summary?.targetStage" class="summary-chip">阶段：{{ step.summary.targetStage }}</span>
              <span v-if="step.summary?.basedOnDiagnosis" class="summary-chip summary-chip--link">已衔接诊断结果</span>
            </template>
            <!-- 科研摘要 -->
            <template v-else>
              <span class="summary-chip summary-chip--link">入口已解锁</span>
            </template>
          </div>
          <div class="step-actions">
            <!-- 诊断完成 → 查看报告 / 重跑 -->
            <template v-if="step.key === 'diagnose'">
              <button class="step-btn step-btn--ghost" @click="goDiagnosisReport">查看诊断报告 →</button>
              <button class="step-btn step-btn--ghost" @click="retry('diagnose')">重新诊断</button>
            </template>
            <!-- 规划完成 → 查看计划 / 重跑 -->
            <template v-else-if="step.key === 'plan'">
              <button class="step-btn step-btn--ghost" @click="goPlanDetail">查看完整计划 →</button>
              <button class="step-btn step-btn--ghost" @click="retry('plan')">重新规划</button>
            </template>
            <!-- 科研解锁 → 进入科研探索 -->
            <template v-else>
              <button class="step-btn step-btn--primary step-btn--research" @click="goResearch">进入科研探索 →</button>
            </template>
          </div>
        </div>

        <!-- 已跳过 -->
        <div v-else class="step-body">
          <p class="step-note step-note--muted">此步骤已跳过</p>
          <div class="step-actions">
            <button class="step-btn step-btn--ghost" @click="retry(step.key)">重新执行</button>
          </div>
        </div>
      </section>

      <!-- === 数据链路可视化（答辩"Agent 间数据链路"实证） === -->
      <section v-if="journeyStore.isStarted" class="datalink-section">
        <div class="section-head">
          <span class="section-icon">⇄</span>
          <span class="section-title">Agent 间数据链路</span>
          <span class="section-en">Shared Context via Profile Store</span>
        </div>
        <div class="datalink-flow">
          <div class="dl-node" :class="{ 'dl-node--active': stepState('diagnose').status === 'done' }">
            <span class="dl-agent">Diagnose</span>
            <span class="dl-out">weak_points · root_causes · score</span>
          </div>
          <div class="dl-arrow" :class="{ 'dl-arrow--active': stepState('diagnose').status === 'done' }">
            <span class="dl-arrow-label">diagnosis_result</span>
            <span class="dl-arrow-line">──────→</span>
          </div>
          <div class="dl-node" :class="{ 'dl-node--active': stepState('plan').status === 'done' }">
            <span class="dl-agent">Planner</span>
            <span class="dl-out">weeks · target_stage · adjustments</span>
          </div>
          <div class="dl-arrow" :class="{ 'dl-arrow--active': stepState('plan').status === 'done' }">
            <span class="dl-arrow-label">画像更新</span>
            <span class="dl-arrow-line">──────→</span>
          </div>
          <div class="dl-node" :class="{ 'dl-node--active': stepState('research').status === 'done' }">
            <span class="dl-agent">Research</span>
            <span class="dl-out">科研路线入口</span>
          </div>
        </div>
        <p class="datalink-note">
          每一步的结构化输出写回学生画像（Profile Store），作为下一步 Agent 的输入上下文——这是多智能体「共享状态」架构的核心，也是与传统聊天机器人 / RAG 套壳的本质区别。
        </p>
      </section>

      <!-- === 完成态 === -->
      <section v-if="isComplete" class="complete-card">
        <div class="complete-title">旗舰旅程已完成</div>
        <p class="complete-desc">
          三个 Agent 已基于同一份学生画像完成接力。你可以随时重跑任意步骤，或进入各 Agent 页面深入探索。
        </p>
        <div class="step-actions">
          <button class="step-btn step-btn--ghost" @click="resetJourney">重置旅程</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.journey-view {
  min-height: calc(100vh - 72px);
  background: var(--color-bg-base);
  padding: 32px 24px 64px;
}

.journey-content {
  max-width: 880px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* === 页头 === */
.page-header { margin-bottom: 4px; }

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
  background: #9b59b6;
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

/* === 进度条 === */
.progress-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-track {
  flex: 1;
  height: 6px;
  background: var(--color-bg-sunken);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4d9de0, #ffd166, #e67e22);
  border-radius: var(--radius-full);
  transition: width 0.6s var(--ease-out);
}

.progress-text {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-fg-secondary);
}

/* === 步骤卡片 === */
.step-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: 20px 22px;
  transition: all 0.3s ease;
}

.step-card--active {
  border-color: color-mix(in srgb, #4d9de0 40%, transparent);
  box-shadow: 0 4px 16px color-mix(in srgb, #4d9de0 10%, transparent);
}

.step-card--done { border-left: 3px solid #00d4aa; }
.step-card--error { border-left: 3px solid #ff6b6b; }
.step-card--skipped { opacity: 0.72; }

.step-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.step-icon {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-serif);
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}

.step-head-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.step-title {
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 700;
  color: var(--color-ink-900);
}

.step-desc {
  font-size: 12px;
  color: var(--color-fg-secondary);
}

.step-agent-tag {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-tertiary);
  text-transform: uppercase;
  letter-spacing: 1px;
  flex-shrink: 0;
}

.step-body { margin-top: 14px; }

.step-note {
  font-size: 13px;
  color: var(--color-ink-700);
  line-height: 1.7;
  margin: 0 0 12px;
}

.step-note--muted { color: var(--color-fg-muted); }

.step-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.step-btn {
  padding: 9px 20px;
  border-radius: var(--radius-full);
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.step-btn--primary {
  background: var(--color-ink-900);
  color: var(--color-fg-inverse);
}

.step-btn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.step-btn--primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.step-btn--research { background: #e67e22; }

.step-btn--ghost {
  background: var(--color-bg-sunken);
  color: var(--color-ink-700);
  border: 1px solid var(--color-border-subtle);
}

.step-btn--ghost:hover:not(:disabled) {
  background: var(--color-brand-50);
  border-color: var(--color-brand-400);
}

.step-error-banner {
  padding: 10px 14px;
  background: color-mix(in srgb, #ff6b6b 10%, transparent);
  border: 1px solid color-mix(in srgb, #ff6b6b 30%, transparent);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: #d9483f;
  margin-bottom: 12px;
}

.step-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.summary-chip {
  padding: 4px 12px;
  background: color-mix(in srgb, #00d4aa 12%, transparent);
  color: #00a07d;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
}

.summary-chip--wide {
  background: var(--color-bg-sunken);
  color: var(--color-ink-700);
  font-weight: 500;
}

.summary-chip--link {
  background: color-mix(in srgb, #9b59b6 12%, transparent);
  color: #8e44ad;
}

/* === 数据链路可视化 === */
.datalink-section {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: 20px 22px;
}

.section-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 16px;
}

.section-icon { color: #9b59b6; font-size: 14px; }

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

.datalink-flow {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.dl-node {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  background: var(--color-bg-sunken);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  opacity: 0.55;
  transition: all 0.3s ease;
}

.dl-node--active {
  opacity: 1;
  border-color: color-mix(in srgb, #9b59b6 45%, transparent);
  background: color-mix(in srgb, #9b59b6 6%, var(--color-bg-elevated));
}

.dl-agent {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--color-ink-900);
}

.dl-out {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-tertiary);
}

.dl-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  opacity: 0.4;
  transition: opacity 0.3s ease;
}

.dl-arrow--active { opacity: 1; }

.dl-arrow-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: #9b59b6;
}

.dl-arrow-line {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-fg-secondary);
  letter-spacing: -1px;
}

.datalink-note {
  font-size: 12px;
  color: var(--color-fg-secondary);
  line-height: 1.7;
  margin: 0;
  padding-top: 12px;
  border-top: 1px dashed var(--color-border-subtle);
}

/* === 完成态 === */
.complete-card {
  text-align: center;
  padding: 32px 24px;
  background: linear-gradient(135deg, color-mix(in srgb, #00d4aa 8%, var(--color-bg-elevated)), color-mix(in srgb, #4d9de0 6%, var(--color-bg-elevated)));
  border: 1px solid color-mix(in srgb, #00d4aa 30%, transparent);
  border-radius: var(--radius-lg);
}

.complete-title {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
  color: var(--color-ink-900);
  margin-bottom: 8px;
}

.complete-desc {
  font-size: 13px;
  color: var(--color-fg-secondary);
  margin: 0 0 16px;
}

.complete-card .step-actions { justify-content: center; }

@media (max-width: 768px) {
  .journey-view { padding: 24px 16px 48px; }
  .page-title { font-size: 24px; }
  .step-head { flex-wrap: wrap; }
  .step-agent-tag { width: 100%; }
}
</style>
