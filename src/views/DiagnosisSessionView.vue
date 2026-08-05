<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDiagnosisSessionStore } from '@/stores/diagnosisSession'
import { useProfileStore } from '@/stores/profile'
import DiagnosisReport from '@/components/DiagnosisReport.vue'

const router = useRouter()
const session = useDiagnosisSessionStore()
const profileStore = useProfileStore()

const step = ref(0) // 0=intro, 1=objective, 2=subjective, 3=result

const objectiveStep = computed(() => step.value === 1)
const subjectiveStep = computed(() => step.value === 2)
const resultStep = computed(() => step.value === 3)

const progress = computed(() => {
  if (session.phase === 'testing') {
    return Math.round((session.answeredCount / (session.totalQuestions || 1)) * 100)
  }
  return 0
})

async function startSession() {
  await session.start()
  if (session.phase === 'testing') {
    step.value = session.objectiveQuestions.length > 0 ? 1 : 2
  }
}

function nextFromObjective() {
  step.value = session.subjectiveQuestions.length > 0 ? 2 : 3
  if (step.value === 3) doSubmit()
}

async function doSubmit() {
  step.value = 3
  await session.submit()
}

function goToHistory() {
  router.push('/history')
}

function goToProfile() {
  router.push('/profile')
}

function restart() {
  session.reset()
  step.value = 0
}
</script>

<template>
  <div class="diag-session-view">
    <div class="page-content">
      <!-- 页头 -->
      <div class="page-header">
        <div class="page-eyebrow"><span class="dot"></span><span>Diagnosis · 混合模式</span></div>
        <h1 class="page-title">成长诊断</h1>
        <p class="page-subtitle">客观题库抽题 + 主观 AI 出题 · 精准定位薄弱知识点</p>
      </div>

      <!-- 阶段 0: 介绍 -->
      <section v-if="step === 0" class="intro-section">
        <div class="intro-card">
          <h2>混合诊断说明</h2>
          <ul class="intro-list">
            <li><strong>客观题</strong>：从题库按学科+难度抽取 {{ session.objectiveQuestions.length || '约 10' }} 道选择/填空题</li>
            <li><strong>主观题</strong>：AI 基于你的薄弱知识点动态生成 2 道简答题</li>
            <li><strong>诊断报告</strong>：客观题自动判分 + 主观题 AI 评判 → 生成 4 层根因链 + weak_points</li>
            <li><strong>数据持久化</strong>：结果写入 diagnoses 表，薄弱点同步到个人画像</li>
          </ul>
          <button class="start-btn" @click="startSession" :disabled="session.phase === 'loading'">
            <span v-if="session.phase === 'loading'" class="spinner"></span>
            {{ session.phase === 'loading' ? '准备题目中…' : '开始诊断' }}
          </button>
          <div v-if="session.error" class="error-msg">{{ session.error }}</div>
        </div>
      </section>

      <!-- 阶段 1: 客观题 -->
      <section v-else-if="objectiveStep && session.phase === 'testing'" class="quiz-section">
        <div class="quiz-bar">
          <span class="quiz-progress">客观题 {{ session.answeredCount }}/{{ session.objectiveQuestions.length }}</span>
          <div class="progress-track"><div class="progress-fill" :style="{ width: progress + '%' }"></div></div>
        </div>

        <div v-for="(q, idx) in session.objectiveQuestions" :key="q.id" class="question-card">
          <div class="q-meta">
            <span class="q-tag">{{ q.subject }}</span>
            <span class="q-tag q-tag--type">{{ q.question_type === 'choice' ? '选择' : '填空' }}</span>
            <span class="q-tag q-tag--diff">难度 {{ q.difficulty }}</span>
            <span class="q-kp">{{ q.knowledge_point }}</span>
          </div>
          <div class="q-stem">{{ idx + 1 }}. {{ q.stem }}</div>

          <!-- 选择题 -->
          <div v-if="q.question_type === 'choice' && q.options" class="q-options">
            <label v-for="(opt, i) in q.options" :key="i" class="q-option"
              :class="{ active: session.answers[q.id] === String.fromCharCode(65 + i) }">
              <input type="radio" :name="'q-' + q.id" :value="String.fromCharCode(65 + i)"
                :checked="session.answers[q.id] === String.fromCharCode(65 + i)"
                @change="session.setAnswer(q.id, String.fromCharCode(65 + i))" />
              <span class="opt-letter">{{ String.fromCharCode(65 + i) }}</span>
              <span class="opt-text">{{ typeof opt === 'string' ? opt : (opt.text || opt.label || opt) }}</span>
            </label>
          </div>

          <!-- 填空题 -->
          <div v-else class="q-fill">
            <input type="text" class="fill-input" placeholder="填写你的答案…"
              :value="session.answers[q.id] || ''"
              @input="session.setAnswer(q.id, $event.target.value)" />
          </div>
        </div>

        <button class="next-btn" @click="nextFromObjective">下一阶段 →</button>
      </section>

      <!-- 阶段 2: 主观题 -->
      <section v-else-if="subjectiveStep && session.phase === 'testing'" class="quiz-section">
        <div class="quiz-bar">
          <span class="quiz-progress">主观题 {{ session.answeredCount - session.objectiveQuestions.length }}/{{ session.subjectiveQuestions.length }}</span>
          <div class="progress-track"><div class="progress-fill" :style="{ width: progress + '%' }"></div></div>
        </div>

        <div v-for="(q, idx) in session.subjectiveQuestions" :key="q.id" class="question-card">
          <div class="q-meta">
            <span class="q-tag q-tag--type">简答</span>
            <span v-if="q.difficulty" class="q-tag q-tag--diff">难度 {{ q.difficulty }}</span>
            <span class="q-kp">{{ q.knowledge_point }}</span>
          </div>
          <div class="q-stem">{{ idx + 1 }}. {{ q.question }}</div>
          <textarea class="essay-input" rows="6" placeholder="请详细作答，展现你的理解深度…"
            :value="session.answers[q.id] || ''"
            @input="session.setAnswer(q.id, $event.target.value)"></textarea>
        </div>

        <button class="submit-btn" @click="doSubmit" :disabled="session.phase === 'grading'">
          <span v-if="session.phase === 'grading'" class="spinner"></span>
          {{ session.phase === 'grading' ? 'AI 评判中…' : '提交诊断' }}
        </button>
      </section>

      <!-- 阶段 3: 结果 -->
      <section v-else-if="step === 3" class="result-section">
        <!-- 评判中 -->
        <div v-if="session.phase === 'grading'" class="grading-card">
          <div class="grading-spinner"></div>
          <p>AI 正在分析你的做题表现，生成诊断报告…</p>
          <p class="grading-hint">客观题已自动判分，主观题正在由 LLM 评判</p>
        </div>

        <!-- 错误 -->
        <div v-else-if="session.phase === 'error'" class="error-card">
          <p class="error-title">诊断失败</p>
          <p class="error-detail">{{ session.error }}</p>
          <button class="retry-btn" @click="restart">重新开始</button>
        </div>

        <!-- 成功 -->
        <div v-else-if="session.phase === 'done' && session.result" class="done-card">
          <div class="done-banner">
            <span class="done-icon">✓</span>
            <span>诊断完成 · 结果已写入数据库</span>
          </div>

          <!-- 客观题统计 -->
          <div class="obj-stats" v-if="session.result.objective_stats">
            <div class="stat-item">
              <span class="stat-num">{{ session.result.objective_stats.correct }}</span>
              <span class="stat-label">正确</span>
            </div>
            <div class="stat-item">
              <span class="stat-num">{{ session.result.objective_stats.total }}</span>
              <span class="stat-label">总题数</span>
            </div>
            <div class="stat-item">
              <span class="stat-num">{{ session.result.objective_stats.accuracy }}%</span>
              <span class="stat-label">正确率</span>
            </div>
          </div>

          <!-- 诊断报告 -->
          <DiagnosisReport :report="session.result.structured || {}" />

          <!-- weak_points 摘要 -->
          <div v-if="session.result.structured?.weak_points?.length" class="weak-summary">
            <h3>薄弱知识点（已同步到个人画像）</h3>
            <div class="weak-tags">
              <span v-for="(wp, i) in session.result.structured.weak_points" :key="i" class="weak-tag">
                <span class="weak-priority" :class="'p-' + (wp.priority || 'P2').toLowerCase()">{{ wp.priority || 'P2' }}</span>
                {{ wp.knowledge_point || wp }}
              </span>
            </div>
          </div>

          <!-- 操作 -->
          <div class="done-actions">
            <button class="action-btn" @click="goToProfile">查看个人画像</button>
            <button class="action-btn action-btn--ghost" @click="goToHistory">诊断历史</button>
            <button class="action-btn action-btn--ghost" @click="restart">重新诊断</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.diag-session-view { min-height: 100vh; background: var(--bg-base, #f4f6fa); }
.page-content { max-width: 760px; margin: 0 auto; padding: 24px 20px 80px; }
.page-header { margin-bottom: 32px; }
.page-eyebrow { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted, #7a8ba3); font-family: var(--font-mono, monospace); margin-bottom: 8px; }
.page-eyebrow .dot { width: 6px; height: 6px; border-radius: 50%; background: #4d9de0; }
.page-title { font-size: 28px; font-weight: 700; color: var(--text-primary, #1a2332); margin: 0 0 8px; }
.page-subtitle { font-size: 14px; color: var(--text-secondary, #5a6b80); margin: 0; }

.intro-card { background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.intro-card h2 { font-size: 18px; margin: 0 0 16px; color: #1a2332; }
.intro-list { list-style: none; padding: 0; margin: 0 0 24px; }
.intro-list li { padding: 8px 0; font-size: 14px; color: #5a6b80; line-height: 1.6; }
.intro-list li::before { content: '→'; color: #4d9de0; margin-right: 8px; }

.start-btn, .next-btn, .submit-btn { width: 100%; padding: 14px; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; color: #fff; background: linear-gradient(135deg, #4d9de0, #2563eb); cursor: pointer; transition: opacity .2s; }
.start-btn:disabled, .next-btn:disabled, .submit-btn:disabled { opacity: .6; cursor: not-allowed; }

.spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; margin-right: 8px; vertical-align: middle; }
@keyframes spin { to { transform: rotate(360deg); } }

.quiz-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.quiz-progress { font-size: 13px; color: #5a6b80; white-space: nowrap; font-family: var(--font-mono, monospace); }
.progress-track { flex: 1; height: 6px; background: #e8ecf3; border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #4d9de0, #2563eb); transition: width .3s; }

.question-card { background: #fff; border-radius: 14px; padding: 24px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,.04); }
.q-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.q-tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: #eef2f7; color: #5a6b80; }
.q-tag--type { background: #e0f2fe; color: #0369a1; }
.q-tag--diff { background: #fef3c7; color: #92400e; }
.q-kp { font-size: 12px; color: #7a8ba3; }
.q-stem { font-size: 15px; color: #1a2332; line-height: 1.7; margin-bottom: 16px; }

.q-options { display: flex; flex-direction: column; gap: 8px; }
.q-option { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border: 2px solid #e8ecf3; border-radius: 10px; cursor: pointer; transition: all .15s; }
.q-option:hover { border-color: #c3daef; }
.q-option.active { border-color: #4d9de0; background: #f0f7ff; }
.q-option input { margin-top: 3px; }
.opt-letter { font-weight: 700; color: #4d9de0; min-width: 18px; }
.opt-text { font-size: 14px; color: #3a4a5e; }

.fill-input, .essay-input { width: 100%; border: 2px solid #e8ecf3; border-radius: 10px; padding: 12px; font-size: 14px; font-family: inherit; transition: border-color .15s; box-sizing: border-box; }
.fill-input:focus, .essay-input:focus { outline: none; border-color: #4d9de0; }
.essay-input { resize: vertical; line-height: 1.6; }

.grading-card, .error-card { background: #fff; border-radius: 16px; padding: 48px 32px; text-align: center; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.grading-spinner { width: 40px; height: 40px; border: 3px solid #e8ecf3; border-top-color: #4d9de0; border-radius: 50%; animation: spin .8s linear infinite; margin: 0 auto 20px; }
.grading-hint { font-size: 13px; color: #7a8ba3; }
.error-title { font-size: 18px; font-weight: 700; color: #e53e3e; }
.error-detail { font-size: 14px; color: #5a6b80; margin: 8px 0 24px; }
.retry-btn { padding: 10px 24px; border: 2px solid #4d9de0; background: #fff; color: #4d9de0; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; }

.done-card { display: flex; flex-direction: column; gap: 20px; }
.done-banner { display: flex; align-items: center; gap: 10px; padding: 14px 20px; background: #e6fffa; border: 1px solid #b2f5ea; border-radius: 12px; font-size: 14px; color: #234e52; }
.done-icon { color: #38b2ac; font-weight: 700; }

.obj-stats { display: flex; gap: 16px; }
.stat-item { flex: 1; background: #fff; border-radius: 12px; padding: 20px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,.04); }
.stat-num { display: block; font-size: 28px; font-weight: 700; color: #1a2332; }
.stat-label { font-size: 12px; color: #7a8ba3; }

.weak-summary { background: #fff; border-radius: 14px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,.04); }
.weak-summary h3 { font-size: 15px; margin: 0 0 12px; color: #1a2332; }
.weak-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.weak-tag { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: #fff5f5; border: 1px solid #fed7d7; border-radius: 8px; font-size: 13px; color: #c53030; }
.weak-priority { font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 3px; }
.weak-priority.p-p0 { background: #e53e3e; color: #fff; }
.weak-priority.p-p1 { background: #dd6b20; color: #fff; }
.weak-priority.p-p2 { background: #d69e2e; color: #fff; }

.done-actions { display: flex; gap: 12px; }
.action-btn { flex: 1; padding: 12px; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; background: #4d9de0; color: #fff; }
.action-btn--ghost { background: #fff; color: #4d9de0; border: 2px solid #4d9de0; }

.error-msg { color: #e53e3e; font-size: 13px; margin-top: 12px; }
</style>
