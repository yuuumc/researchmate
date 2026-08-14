<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProfileStore } from '@/stores/profile'
import { useDiagnosisStore } from '@/stores/diagnosis'
import { usePlanStore } from '@/stores/plan'
import { useJourneyStore } from '@/stores/journey'
import { useWrongBookStore } from '@/stores/wrongBook'
import KnowledgeGraph from '@/components/KnowledgeGraph.vue'
import WrongBook from '@/components/WrongBook.vue'

const router = useRouter()
const profileStore = useProfileStore()
const diagnosisStore = useDiagnosisStore()
const planStore = usePlanStore()
const journeyStore = useJourneyStore()
const wrongBookStore = useWrongBookStore()

// 欢迎语（按时段）
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

const displayName = computed(() => profileStore.profile.name || '同学')

// 综合能力等级（带文字标签）
const abilityLabel = computed(() => {
  const lv = profileStore.abilityLevel
  if (lv === 0) return '待诊断'
  if (lv < 40) return '基础薄弱'
  if (lv < 60) return '稳步提升'
  if (lv < 80) return '良好'
  return '优秀'
})

// 首页导师卡：优势数（4-5星知识点）、薄弱数（1-2星知识点）、建议
const strongCount = computed(() => {
  const stars = profileStore.profile.ability_stars || {}
  return Object.values(stars).filter((s) => s >= 4).length
})

const weakStarCount = computed(() => {
  const stars = profileStore.profile.ability_stars || {}
  return Object.values(stars).filter((s) => s <= 2 && s > 0).length
})

const mentorSuggestion = computed(() => {
  const w = profileStore.biggestWeakness
  if (w && w.topic) return `优先学习 ${w.topic}`
  if (profileStore.abilityLevel === 0) return '先做一次诊断，了解你的能力画像'
  return '保持节奏，继续巩固'
})

// 当前阶段（基于备考阶段 + 能力等级）
const stageLabel = computed(() => {
  const stageMap = { initial: '起步准备期', basic: '基础学习期', intensive: '强化提升期', sprint: '冲刺模考期' }
  const stage = profileStore.profile.preparation_stage
  if (stage && stageMap[stage]) return stageMap[stage]
  const lv = profileStore.abilityLevel
  if (lv === 0) return '尚未开始诊断'
  if (lv < 40) return '基础巩固期'
  if (lv < 60) return '稳步提升期'
  if (lv < 80) return '强化突破期'
  return '冲刺拔高期'
})

// 今日任务（从 plan store 读取本周任务，取今日 3 条）
const todayTasks = computed(() => {
  // 从最新 plan 的本周任务取前 3 条作为今日任务
  const latestPlan = planStore.current
  if (!latestPlan || !Array.isArray(latestPlan.weeks) || latestPlan.weeks.length === 0) {
    return []
  }
  const week1 = latestPlan.weeks[0]
  const tasks = Array.isArray(week1.tasks) ? week1.tasks : []
  return tasks.slice(0, 3)
})

// 任务完成状态（本地 ref，演示用）
const taskDone = ref({})

function toggleTask(i) {
  taskDone.value[i] = !taskDone.value[i]
}

// 快捷提问建议（V2：AI芯片科研路线图首位）
const quickPrompts = [
  { icon: 'X', text: '我以后想做 AI 芯片，给我科研路线图', agent: 'research', color: '#e67e22' },
  { icon: 'M', text: 'MOSFET 阈值电压怎么推导？', agent: 'tutor', color: '#00d4aa' },
  { icon: 'D', text: '我半导体物理考了 55 分，帮我诊断', agent: 'diagnose', color: '#4d9de0' },
  { icon: 'P', text: '基于上次诊断帮我做复习计划', agent: 'planner', color: '#ffd166' },
  { icon: 'A', text: '双非前 30%，想去长三角读微电子', agent: 'admission', color: '#ff6b6b' }
]

function goChat(prefill, agent) {
  // 跳转聊天页，可通过 query 传预填文本 + agent
  const query = {}
  if (prefill) query.q = prefill
  if (agent) query.agent = agent
  router.push({ path: '/chat', query })
}

function goDiagnose() {
  router.push({ path: '/chat', query: { q: '我半导体物理考了 55 分，MOSFET 阈值电压推导错，C-V 特性错，短沟道效应不会，帮我诊断' } })
}

function goPlan() {
  router.push('/plan')
}

function goHistory() {
  router.push('/history')
}

// === 旗舰旅程入口（P0 #8）===
const journeyStarted = computed(() => journeyStore.isStarted)
const journeyComplete = computed(() => journeyStore.isComplete)
const journeyProgress = computed(() => journeyStore.progress)
const journeyCurrentTitle = computed(() => {
  const key = journeyStore.currentStepKey
  const step = journeyStore.stepList.find((s) => s.key === key)
  return step ? step.title : ''
})

function goJourney() {
  router.push('/journey')
}

// 错题本折叠状态（默认展开，便于首屏即可见）
const wrongBookExpanded = ref(true)
</script>

<template>
  <div class="home-view">
    <!-- 知识图谱背景 -->
    <KnowledgeGraph :node-count="22" :flow-dots="true" />

    <!-- 仪表盘内容 -->
    <div class="dashboard">
      <!-- === AI导师状态卡（V2 · spec 对齐：左侧 4px 渐变色条 + 浅渐变底） === -->
      <section class="mentor-status-card" @click="goChat(undefined, 'tutor')">
        <div class="mentor-content">
          <div class="mentor-status-row">
            <span class="mentor-pulse"></span>
            <span class="mentor-badge-text">AI Mentor · Active</span>
          </div>
          <p class="mentor-stage">当前阶段：{{ stageLabel }}</p>
          <p class="mentor-summary">
            <span class="highlight-good">{{ strongCount }} 个优势</span> ·
            <span class="highlight-bad">{{ weakStarCount }} 个薄弱点</span> ·
            今日建议：{{ mentorSuggestion }}
          </p>
        </div>
        <span class="mentor-action">查看完整分析 →</span>
      </section>

      <!-- === 旗舰旅程入口卡（P0 #8 · 诊断→规划→科研三步级联） === -->
      <section class="journey-entry-card" @click="goJourney">
        <div class="journey-entry-content">
          <div class="journey-entry-head">
            <span class="journey-entry-icon">⇄</span>
            <span class="journey-entry-badge">Flagship Journey</span>
          </div>
          <p class="journey-entry-title">
            <template v-if="!journeyStarted">旗舰旅程：诊断 → 规划 → 科研</template>
            <template v-else-if="journeyComplete">旗舰旅程已完成</template>
            <template v-else>旗舰旅程进行中 · 当前：{{ journeyCurrentTitle }}</template>
          </p>
          <p class="journey-entry-sub">
            <template v-if="!journeyStarted">三个 Agent 接力协作，共享你的学生画像</template>
            <template v-else-if="journeyComplete">三个 Agent 已完成接力，可随时重跑任意步骤</template>
            <template v-else>已完成 {{ journeyProgress }}%，点击继续</template>
          </p>
          <div v-if="journeyStarted && !journeyComplete" class="journey-entry-progress">
            <div class="jep-track">
              <div class="jep-fill" :style="{ width: journeyProgress + '%' }"></div>
            </div>
          </div>
        </div>
        <span class="journey-entry-action">
          {{ !journeyStarted ? '开始旅程' : journeyComplete ? '查看旅程' : '继续旅程' }} →
        </span>
      </section>

      <!-- === 顶部：欢迎 + 倒计时 === -->
      <section class="hero-section">
        <div class="hero-left">
          <div class="hero-eyebrow">
            <span class="dot"></span>
            <span>AI Mentor Dashboard</span>
          </div>
          <h1 class="hero-title">{{ greeting }}，{{ displayName }}</h1>
          <p class="hero-sub">
            <span v-if="profileStore.profile.major">{{ profileStore.profile.major }}</span>
            <span v-if="profileStore.profile.target_direction" class="sub-dot">·</span>
            <span v-if="profileStore.profile.target_direction">{{ profileStore.profile.target_direction }}方向</span>
            <span class="sub-dot">·</span>
            <span>{{ profileStore.learningStyleLabel }}学习者</span>
          </p>
        </div>
        <div class="hero-right">
          <div class="countdown-card">
            <div class="countdown-label">距离考研</div>
            <div class="countdown-value">
              {{ profileStore.daysLeft ?? '—' }}<small>天</small>
            </div>
            <div class="countdown-date">{{ profileStore.profile.exam_date }}</div>
          </div>
        </div>
      </section>

      <!-- === 中部：能力总览 + 最大短板 === -->
      <section class="status-grid">
        <!-- 专业能力进度条 -->
        <div class="card ability-card">
          <div class="card-head">
            <div>
              <div class="card-title">专业能力</div>
              <div class="card-en">Ability Level</div>
            </div>
            <span class="ability-tag" :class="{ 'tag-empty': profileStore.abilityLevel === 0 }">
              {{ abilityLabel }}
            </span>
          </div>
          <div class="ability-bar-wrap">
            <div class="ability-bar-track">
              <div class="ability-bar-fill" :style="{ width: Math.max(2, profileStore.abilityLevel) + '%' }"></div>
            </div>
            <div class="ability-bar-label">
              <span>{{ profileStore.abilityLevel }}%</span>
              <span class="ability-hint" v-if="profileStore.abilityLevel === 0">先做一次诊断</span>
            </div>
          </div>
        </div>

        <!-- 最大短板 -->
        <div class="card weakness-card">
          <div class="card-head">
            <div>
              <div class="card-title">最大短板</div>
              <div class="card-en">Biggest Weakness</div>
            </div>
            <span class="weakness-icon">!</span>
          </div>
          <div v-if="profileStore.biggestWeakness" class="weakness-body">
            <div class="weakness-topic">{{ profileStore.biggestWeakness.topic }}</div>
            <button class="weakness-cta" @click="goChat('帮我补强 ' + profileStore.biggestWeakness.topic)">
              立即补强 →
            </button>
          </div>
          <div v-else class="empty-body">
            <span class="empty-text">暂无数据</span>
            <button class="empty-cta" @click="goDiagnose">去做诊断</button>
          </div>
        </div>
      </section>

      <!-- === 今日任务 === -->
      <section class="card tasks-card">
        <div class="card-head">
          <div>
            <div class="card-title">今日任务</div>
            <div class="card-en">Today's Tasks</div>
          </div>
          <span class="task-count">{{ todayTasks.length }}</span>
        </div>
        <div v-if="todayTasks.length > 0" class="task-list">
          <label
            v-for="(t, i) in todayTasks"
            :key="i"
            class="task-item"
            :class="{ done: taskDone[i] }"
          >
            <input type="checkbox" :checked="!!taskDone[i]" @change="toggleTask(i)" />
            <span class="task-check"></span>
            <span class="task-text">{{ t }}</span>
          </label>
        </div>
        <div v-else class="empty-body">
          <span class="empty-text">暂无今日任务</span>
          <button class="empty-cta" @click="goPlan">去生成计划</button>
        </div>
      </section>

      <!-- === 快捷提问入口 === -->
      <section class="quick-section">
        <div class="quick-header">
          <div>
            <div class="card-title">快捷提问</div>
            <div class="card-en">Quick Start</div>
          </div>
          <button class="chat-entry" @click="goChat()">
            <span>打开智能对话</span>
            <span class="arrow">→</span>
          </button>
        </div>
        <div class="quick-grid">
          <button
            v-for="(p, i) in quickPrompts"
            :key="i"
            class="quick-card"
            :style="{ '--accent': p.color }"
            @click="goChat(p.text)"
          >
            <span class="quick-icon">{{ p.icon }}</span>
            <span class="quick-text">{{ p.text }}</span>
          </button>
        </div>
      </section>

      <!-- === 最近诊断速览 === -->
      <section v-if="profileStore.profile.last_diagnosis_score !== null" class="card recent-card">
        <div class="card-head">
          <div>
            <div class="card-title">最近诊断</div>
            <div class="card-en">Latest Diagnosis</div>
          </div>
          <button class="link-btn" @click="goHistory">查看历史 →</button>
        </div>
        <div class="recent-body">
          <div class="recent-score">
            <span class="score-num">{{ profileStore.profile.last_diagnosis_score }}</span>
            <span class="score-unit">分</span>
          </div>
          <div class="recent-meta">
            <div class="meta-row">
              <span class="meta-label">薄弱知识点</span>
              <span class="meta-value">{{ profileStore.weakCount }} 个</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">已掌握</span>
              <span class="meta-value">{{ profileStore.masteredCount }} 个</span>
            </div>
          </div>
        </div>
      </section>

      <!-- === 错题本 === -->
      <section class="card wrong-card">
        <div class="card-head">
          <div>
            <div class="card-title">
              错题本
              <span v-if="wrongBookStore.unresolvedCount > 0" class="wb-badge">
                {{ wrongBookStore.unresolvedCount }}
              </span>
            </div>
            <div class="card-en">Wrong Book · 能力星 ≤ 2 自动入册</div>
          </div>
          <button
            v-if="wrongBookStore.count > 0"
            class="link-btn"
            @click="wrongBookExpanded = !wrongBookExpanded"
          >
            {{ wrongBookExpanded ? '收起' : '展开' }} →
          </button>
        </div>
        <div v-if="wrongBookExpanded || wrongBookStore.count === 0">
          <WrongBook />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.home-view {
  position: relative;
  min-height: calc(100vh - 72px);
  overflow: hidden;
}

.dashboard {
  position: relative;
  z-index: var(--z-base);
  max-width: 1080px;
  margin: 0 auto;
  padding: 32px 32px 64px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* === AI导师状态卡（V2 · spec：左侧 4px 渐变色条 + 浅渐变底） === */
.mentor-status-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 20px 24px 20px 28px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-ink-700) 3%, var(--color-bg-elevated)),
    color-mix(in srgb, var(--color-success) 2%, var(--color-bg-elevated))
  );
  border: 1px solid color-mix(in srgb, var(--color-ink-700) 10%, transparent);
  border-radius: 14px;
  cursor: pointer;
  transition: box-shadow 0.3s ease, border-color 0.3s ease;
  animation: float-up 0.5s var(--ease-out) both;
  overflow: hidden;
}

.mentor-status-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to bottom,
    var(--color-ink-700),
    var(--color-success)
  );
}

.mentor-status-card:hover {
  box-shadow: 0 4px 20px color-mix(in srgb, var(--color-ink-700) 8%, transparent);
  border-color: color-mix(in srgb, var(--color-ink-700) 25%, transparent);
}

.mentor-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mentor-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.mentor-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success);
  position: relative;
  flex-shrink: 0;
}

.mentor-pulse::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: var(--color-success);
  opacity: 0.3;
  animation: mentor-pulse 2s ease-in-out infinite;
}

@keyframes mentor-pulse {
  0%, 100% { transform: scale(1); opacity: 0.3; }
  50% { transform: scale(2); opacity: 0; }
}

.mentor-badge-text {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-fg-tertiary);
}

.mentor-stage {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-ink-900);
  margin: 0 0 2px;
}

.mentor-summary {
  font-size: 13px;
  color: var(--color-fg-secondary);
  margin: 0;
  line-height: 1.5;
}

.mentor-action {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--color-ink-700);
  font-weight: 500;
  transition: transform 0.2s;
}

.mentor-status-card:hover .mentor-action {
  transform: translateX(3px);
}

.highlight-good {
  color: var(--color-success);
  font-weight: 600;
}

.highlight-bad {
  color: var(--color-error);
  font-weight: 600;
}

@media (max-width: 768px) {
  .mentor-status-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .mentor-action {
    margin-left: 0;
  }
}

/* === 旗舰旅程入口卡（P0 #8） === */
.journey-entry-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 18px 24px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, #9b59b6 7%, var(--color-bg-elevated)),
    color-mix(in srgb, #4d9de0 4%, var(--color-bg-elevated))
  );
  border: 1px solid color-mix(in srgb, #9b59b6 25%, transparent);
  border-radius: 14px;
  cursor: pointer;
  transition: box-shadow 0.3s ease, border-color 0.3s ease;
  animation: float-up 0.5s var(--ease-out) 0.05s both;
}

.journey-entry-card:hover {
  box-shadow: 0 4px 20px color-mix(in srgb, #9b59b6 14%, transparent);
  border-color: color-mix(in srgb, #9b59b6 45%, transparent);
}

.journey-entry-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.journey-entry-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.journey-entry-icon {
  color: #9b59b6;
  font-size: 13px;
}

.journey-entry-badge {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  color: #9b59b6;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.journey-entry-title {
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 700;
  color: var(--color-ink-900);
  margin: 0;
}

.journey-entry-sub {
  font-size: 12px;
  color: var(--color-fg-secondary);
  margin: 0;
}

.journey-entry-progress {
  margin-top: 8px;
}

.jep-track {
  height: 4px;
  background: var(--color-bg-sunken);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.jep-fill {
  height: 100%;
  background: linear-gradient(90deg, #4d9de0, #9b59b6);
  border-radius: var(--radius-full);
  transition: width 0.6s var(--ease-out);
}

.journey-entry-action {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 13px;
  color: #9b59b6;
  font-weight: 600;
  transition: transform 0.2s;
}

.journey-entry-card:hover .journey-entry-action {
  transform: translateX(3px);
}

@media (max-width: 768px) {
  .journey-entry-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .journey-entry-action { margin-left: 0; }
}

/* === Hero === */
.hero-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--color-border-subtle);
  animation: float-up 0.5s var(--ease-out) both;
}

.hero-left { flex: 1; min-width: 0; }

.hero-eyebrow {
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
  animation: pulse 2s ease-in-out infinite;
}

.hero-title {
  font-family: var(--font-serif);
  font-size: 36px;
  font-weight: 700;
  color: var(--color-ink-900);
  margin: 0 0 8px;
  letter-spacing: 1px;
}

.hero-sub {
  font-size: 13px;
  color: var(--color-fg-secondary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sub-dot { color: var(--color-fg-tertiary); }

/* 倒计时卡 */
.countdown-card {
  padding: 16px 20px;
  background: linear-gradient(135deg, var(--color-bg-elevated), rgba(0, 212, 170, 0.04));
  border: 1px solid var(--color-border-subtle);
  border-left: 3px solid var(--color-brand-500);
  border-radius: var(--radius-lg);
  text-align: right;
  min-width: 140px;
  animation: float-up 0.5s var(--ease-out) 0.1s both;
}

.countdown-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
}

.countdown-value {
  font-family: var(--font-serif);
  font-size: 32px;
  font-weight: 700;
  color: var(--color-brand-700);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.countdown-value small {
  font-size: 13px;
  font-weight: 500;
  margin-left: 2px;
}

.countdown-date {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-muted);
  margin-top: 4px;
}

/* === 卡片通用 === */
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

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
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
  margin-top: 2px;
}

/* === 状态网格 === */
.status-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 16px;
}

.ability-card { animation-delay: 0.15s; }
.weakness-card { animation-delay: 0.2s; }

/* 能力卡 */
.ability-tag {
  padding: 3px 10px;
  background: var(--color-brand-50);
  color: var(--color-brand-700);
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
}

.ability-tag.tag-empty {
  background: var(--color-bg-sunken);
  color: var(--color-fg-muted);
}

.ability-bar-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ability-bar-track {
  height: 8px;
  background: var(--color-bg-sunken);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.ability-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-brand-400), var(--color-brand-600));
  border-radius: var(--radius-full);
  transition: width 0.8s var(--ease-out);
}

.ability-bar-label {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-secondary);
}

.ability-hint {
  color: var(--color-fg-muted);
  font-style: italic;
}

/* 短板卡 */
.weakness-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-error-bg);
  color: var(--color-error);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
}

.weakness-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.weakness-topic {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
  color: var(--color-error);
}

.weakness-cta {
  align-self: flex-start;
  padding: 6px 14px;
  background: var(--color-error);
  color: white;
  border: none;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.weakness-cta:hover {
  background: var(--color-error-hover, #e85555);
  transform: translateX(2px);
}

/* 空状态 */
.empty-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px 0;
}

.empty-text {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-muted);
  font-style: italic;
}

.empty-cta {
  align-self: flex-start;
  padding: 6px 14px;
  background: var(--color-bg-sunken);
  color: var(--color-ink-700);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-full);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.empty-cta:hover {
  background: var(--color-brand-50);
  color: var(--color-brand-700);
  border-color: var(--color-brand-400);
}

/* === 任务卡 === */
.tasks-card { animation-delay: 0.25s; }

.task-count {
  padding: 2px 10px;
  background: var(--color-bg-sunken);
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-ink-700);
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--color-bg-sunken);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
}

.task-item:hover {
  background: var(--color-bg-hover, rgba(0, 212, 170, 0.06));
}

.task-item input[type="checkbox"] {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.task-check {
  width: 18px;
  height: 18px;
  border: 1.5px solid var(--color-fg-muted);
  border-radius: 4px;
  flex-shrink: 0;
  position: relative;
  transition: all 0.2s;
}

.task-item.done .task-check {
  background: var(--color-node-active);
  border-color: var(--color-node-active);
}

.task-item.done .task-check::after {
  content: '✓';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
  font-weight: 700;
}

.task-text {
  font-size: 13px;
  color: var(--color-ink-900);
  transition: all 0.2s;
}

.task-item.done .task-text {
  color: var(--color-fg-muted);
  text-decoration: line-through;
}

/* === 快捷提问 === */
.quick-section {
  animation: float-up 0.5s var(--ease-out) 0.3s both;
}

.quick-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.chat-entry {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--color-ink-900);
  color: white;
  border: none;
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.chat-entry:hover {
  background: var(--color-brand-700, #1a3a5c);
  transform: translateX(2px);
}

.chat-entry .arrow {
  transition: transform 0.2s;
}

.chat-entry:hover .arrow {
  transform: translateX(3px);
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.quick-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-left: 3px solid var(--accent, var(--color-brand-500));
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
  font-family: inherit;
}

.quick-card:hover {
  transform: translateX(4px);
  box-shadow: var(--shadow-sm);
  background: var(--color-bg-hover, rgba(0, 212, 170, 0.04));
}

.quick-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-serif);
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}

.quick-text {
  font-size: 13px;
  color: var(--color-ink-900);
  line-height: 1.4;
}

/* === 最近诊断 === */
.recent-card { animation-delay: 0.35s; }

.wb-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 8px;
  background: var(--color-error);
  color: white;
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  vertical-align: middle;
}

.wrong-card { animation-delay: 0.4s; }

.link-btn {
  background: none;
  border: none;
  color: var(--color-brand-600);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
}

.link-btn:hover {
  background: var(--color-brand-50);
  color: var(--color-brand-700);
}

.recent-body {
  display: flex;
  align-items: center;
  gap: 32px;
}

.recent-score {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.score-num {
  font-family: var(--font-serif);
  font-size: 36px;
  font-weight: 700;
  color: var(--color-ink-900);
  line-height: 1;
}

.score-unit {
  font-size: 14px;
  color: var(--color-fg-secondary);
}

.recent-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 4px 0;
  border-bottom: 1px dashed var(--color-border-subtle);
}

.meta-row:last-child { border-bottom: none; }

.meta-label { color: var(--color-fg-secondary); }
.meta-value {
  color: var(--color-ink-900);
  font-weight: 600;
  font-family: var(--font-mono);
}

/* === 动画 === */
@keyframes float-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(0, 212, 170, 0.2); }
  50% { box-shadow: 0 0 0 6px rgba(0, 212, 170, 0.08); }
}

/* === 响应式 === */
@media (max-width: 768px) {
  .dashboard { padding: 24px 16px 48px; }
  .hero-section { flex-direction: column; align-items: flex-start; gap: 16px; }
  .hero-title { font-size: 28px; }
  .status-grid { grid-template-columns: 1fr; }
  .quick-grid { grid-template-columns: 1fr; }
  .recent-body { flex-direction: column; align-items: flex-start; gap: 16px; }
}
</style>
