<template>
  <div class="exam-view">
    <!-- Phase: idle -->
    <div v-if="phase === 'idle'" class="exam-idle">
      <div class="exam-card">
        <svg class="exam-icon" viewBox="0 0 24 24" width="48" height="48">
          <path fill="none" stroke="currentColor" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h4m-4 4h4m-4-8h4M9 13h.01M9 17h.01M9 9h.01" />
        </svg>
        <h2>模拟考试</h2>
        <p class="exam-desc">基于画像薄弱知识点智能组卷，客观题 + 主观题 AI 阅卷</p>

        <div v-if="weakCount === 0" class="exam-hint">
          <p>当前画像暂无薄弱知识点，请先完成诊断或练习。</p>
        </div>
        <div v-else class="exam-hint">
          <p>检测到 {{ weakCount }} 个薄弱知识点，将围绕这些知识点组卷。</p>
        </div>

        <div v-if="history.length > 0" class="exam-history">
          <h3>历史成绩</h3>
          <div class="history-list">
            <div v-for="(h, i) in history.slice(0, 5)" :key="i" class="history-item">
              <span class="history-date">{{ formatDate(h.date) }}</span>
              <span class="history-score">{{ h.total_score }}/{{ h.max_score }}</span>
              <span class="history-percent" :class="{ 'pass': h.score_percent >= 60 }">{{ h.score_percent }}%</span>
            </div>
          </div>
        </div>

        <button class="btn-primary" :disabled="weakCount === 0" @click="startExam">
          开始模考
        </button>
      </div>
    </div>

    <!-- Phase: composing -->
    <div v-if="phase === 'composing'" class="exam-composing">
      <div class="loading-spinner">
        <svg class="spin" viewBox="0 0 24 24" width="40" height="40">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="40 20" />
        </svg>
        <p>正在智能组卷...</p>
      </div>
    </div>

    <!-- Phase: answering -->
    <div v-if="phase === 'answering'" class="exam-answering">
      <div class="exam-header">
        <div class="timer" :class="{ 'timer-warning': timer.remaining < 60 }">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="none" stroke="currentColor" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{{ formatTime(timer.remaining) }}</span>
        </div>
        <div class="progress-text">{{ answeredCount }}/{{ questionCount }} 已作答</div>
      </div>

      <!-- 客观题 -->
      <div v-for="(q, idx) in paper.objective" :key="q.id" class="question-block">
        <div class="question-header">
          <span class="q-type q-obj">客观题 {{ idx + 1 }}</span>
          <span class="q-kp">{{ q.knowledge_point }}</span>
        </div>
        <div class="question-stem">{{ q.stem }}</div>
        <div v-if="q.options" class="question-options">
          <label v-for="(opt, oi) in q.options" :key="oi" class="option-item">
            <input
              type="radio"
              :name="'q-' + q.id"
              :value="getOptionValue(opt, oi)"
              :checked="answers[q.id] === getOptionValue(opt, oi)"
              @change="setAnswer(q.id, getOptionValue(opt, oi))"
            />
            <span>{{ opt }}</span>
          </label>
        </div>
        <div v-else class="question-fill">
          <input
            type="text"
            class="fill-input"
            placeholder="输入答案"
            :value="answers[q.id] || ''"
            @input="setAnswer(q.id, $event.target.value)"
          />
        </div>
      </div>

      <!-- 主观题 -->
      <div v-for="(q, idx) in paper.subjective" :key="q.id" class="question-block">
        <div class="question-header">
          <span class="q-type q-subj">主观题 {{ idx + 1 }}</span>
          <span class="q-kp">{{ q.knowledge_point }}</span>
          <span class="q-score">{{ q.max_score }} 分</span>
        </div>
        <div class="question-stem">{{ q.stem }}</div>
        <textarea
          class="essay-input"
          rows="6"
          placeholder="请输入你的解答..."
          :value="answers[q.id] || ''"
          @input="setAnswer(q.id, $event.target.value)"
        ></textarea>
      </div>

      <div class="exam-actions">
        <button class="btn-secondary" @click="confirmSubmit">提交试卷</button>
      </div>
    </div>

    <!-- Phase: grading -->
    <div v-if="phase === 'grading'" class="exam-grading">
      <div class="grading-card">
        <svg class="spin" viewBox="0 0 24 24" width="40" height="40">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="40 20" />
        </svg>
        <h3>AI 正在阅卷...</h3>
        <div class="grading-progress">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: gradingPercent + '%' }"></div>
          </div>
          <span>{{ gradingProgress.done }}/{{ gradingProgress.total }} 主观题已评分</span>
        </div>
      </div>
    </div>

    <!-- Phase: done -->
    <div v-if="phase === 'done' && results" class="exam-done">
      <div class="result-card">
        <h2>模考报告</h2>
        <div class="score-summary">
          <div class="score-main">
            <span class="score-value">{{ results.total_score }}</span>
            <span class="score-max">/{{ results.max_score }}</span>
          </div>
          <div class="score-percent" :class="{ 'pass': scorePercent >= 60 }">{{ scorePercent }}%</div>
        </div>

        <div class="score-breakdown">
          <div class="breakdown-item">
            <span class="bd-label">客观题</span>
            <span class="bd-score">{{ results.obj_score }}/{{ results.obj_max }}</span>
          </div>
          <div class="breakdown-item">
            <span class="bd-label">主观题</span>
            <span class="bd-score">{{ results.subj_score }}/{{ results.subj_max }}</span>
          </div>
        </div>

        <!-- 客观题详情 -->
        <div v-if="results.objective.length > 0" class="result-section">
          <h3>客观题</h3>
          <div v-for="(r, i) in results.objective" :key="r.question_id" class="result-item">
            <div class="ri-header">
              <span class="ri-num">Q{{ i + 1 }}</span>
              <span class="ri-kp">{{ r.knowledge_point }}</span>
              <span class="ri-result" :class="{ 'correct': r.is_correct, 'wrong': !r.is_correct }">
                {{ r.is_correct ? '正确' : '错误' }}
              </span>
            </div>
            <div class="ri-stem">{{ r.stem }}</div>
            <div class="ri-answer">
              <span class="ri-label">你的答案：</span>{{ r.user_answer || '（未作答）' }}
            </div>
            <div v-if="!r.is_correct" class="ri-answer">
              <span class="ri-label">正确答案：</span>{{ r.correct_answer }}
            </div>
          </div>
        </div>

        <!-- 主观题详情 -->
        <div v-if="results.subjective.length > 0" class="result-section">
          <h3>主观题 AI 阅卷</h3>
          <div v-for="(r, i) in results.subjective" :key="r.question_id" class="result-item">
            <div class="ri-header">
              <span class="ri-num">Q{{ i + 1 }}</span>
              <span class="ri-kp">{{ r.knowledge_point }}</span>
              <span v-if="r.pending_review" class="ri-result pending">待复评</span>
              <span v-else class="ri-result" :class="{ 'correct': r.score >= r.max_score * 0.6, 'wrong': r.score < r.max_score * 0.6 }">
                {{ r.score }}/{{ r.max_score }}
              </span>
            </div>
            <div class="ri-stem">{{ r.stem }}</div>
            <div v-if="r.grade_result?.dimensions" class="ri-dimensions">
              <div v-for="(d, dim) in r.grade_result.dimensions" :key="dim" class="dim-item">
                <span class="dim-name">{{ dimLabel(dim) }}</span>
                <span class="dim-score">{{ d.score }}/5</span>
                <span class="dim-comment">{{ d.comment }}</span>
              </div>
            </div>
            <div v-if="r.grade_result?.overall_comment" class="ri-overall">
              <span class="ri-label">总评：</span>{{ r.grade_result.overall_comment }}
            </div>
          </div>
        </div>

        <div class="exam-actions">
          <button class="btn-secondary" @click="reset">返回</button>
          <button class="btn-primary" @click="startExam">再考一次</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted } from 'vue'
import { useExamStore } from '@/stores/exam'
import { useProfileStore } from '@/stores/profile'

const examStore = useExamStore()
const profileStore = useProfileStore()

const phase = computed(() => examStore.phase)
const paper = computed(() => examStore.paper)
const answers = computed(() => examStore.answers)
const results = computed(() => examStore.results)
const timer = computed(() => examStore.timer)
const gradingProgress = computed(() => examStore.gradingProgress)
const history = computed(() => examStore.getHistory())

const weakCount = computed(() => profileStore.profile.weak_topics?.length || 0)
const questionCount = computed(() => examStore.questionCount)
const answeredCount = computed(() => examStore.answeredCount)

const scorePercent = computed(() => {
  if (!results.value || !results.value.max_score) return 0
  return Math.round((results.value.total_score / results.value.max_score) * 100)
})

const gradingPercent = computed(() => {
  if (!gradingProgress.value.total) return 0
  return Math.round((gradingProgress.value.done / gradingProgress.value.total) * 100)
})

function startExam() {
  examStore.reset()
  examStore.composePaper()
}

function confirmSubmit() {
  if (confirm('确定提交试卷吗？提交后将无法修改答案。')) {
    examStore.submitExam()
  }
}

function reset() {
  examStore.reset()
}

function getOptionValue(opt, idx) {
  if (typeof opt === 'string' && opt.length > 0) {
    // 提取选项字母（A/B/C/D）
    const m = opt.match(/^([A-D])/i)
    if (m) return m[1].toUpperCase()
  }
  return String.fromCharCode(65 + idx)
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`
}

function dimLabel(dim) {
  const map = { correctness: '正确性', completeness: '完整性', logic: '逻辑性' }
  return map[dim] || dim
}

onUnmounted(() => {
  examStore._stopTimer()
})
</script>

<style scoped>
.exam-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 16px;
}

/* Idle */
.exam-card {
  text-align: center;
  padding: 32px 24px;
  background: var(--bg-elevated);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.exam-icon {
  color: var(--accent, #00d4aa);
  margin-bottom: 12px;
}
.exam-card h2 {
  margin: 0 0 8px;
  font-size: 1.4rem;
}
.exam-desc {
  color: var(--text-secondary, #666);
  font-size: 0.9rem;
  margin: 0 0 20px;
}
.exam-hint {
  margin-bottom: 20px;
  color: var(--text-secondary, #888);
  font-size: 0.875rem;
}
.exam-history {
  margin: 20px 0;
  text-align: left;
}
.exam-history h3 {
  font-size: 0.9rem;
  margin: 0 0 8px;
  color: var(--text-secondary, #666);
}
.history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.history-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--color-bg-sunken);
  border-radius: 8px;
  font-size: 0.85rem;
}
.history-percent.pass { color: #00a878; }
.history-percent:not(.pass) { color: #e74c3c; }

/* Composing / Grading */
.exam-composing, .exam-grading {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}
.loading-spinner, .grading-card {
  text-align: center;
}
.loading-spinner p, .grading-card h3 {
  margin-top: 12px;
  color: var(--text-secondary, #666);
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.grading-progress {
  margin-top: 16px;
}
.progress-bar {
  width: 200px;
  height: 8px;
  background: var(--color-bg-sunken);
  border-radius: 4px;
  overflow: hidden;
  margin: 0 auto 8px;
}
.progress-fill {
  height: 100%;
  background: var(--accent, #00d4aa);
  transition: width 0.3s;
}

/* Answering */
.exam-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border-radius: 8px;
  position: sticky;
  top: 0;
  z-index: 10;
}
.timer {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--text-primary, #333);
}
.timer-warning {
  color: #e74c3c;
}
.progress-text {
  font-size: 0.85rem;
  color: var(--text-secondary, #888);
}
.question-block {
  margin-bottom: 24px;
  padding: 16px;
  background: var(--bg-elevated);
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.question-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.q-type {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}
.q-obj { background: rgba(0, 212, 170, 0.12); color: #00a878; }
.q-subj { background: rgba(77, 157, 224, 0.12); color: #4d9de0; }
.q-kp {
  font-size: 0.75rem;
  color: var(--text-secondary, #888);
}
.q-score {
  font-size: 0.75rem;
  color: var(--text-secondary, #888);
  margin-left: auto;
}
.question-stem {
  font-size: 0.95rem;
  line-height: 1.6;
  margin-bottom: 12px;
}
.question-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.option-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}
.option-item:hover {
  background: var(--color-bg-sunken);
}
.fill-input, .essay-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  font-size: 0.9rem;
  background: var(--input-bg);
  color: var(--text-primary, #333);
}
.essay-input {
  resize: vertical;
  font-family: inherit;
}
.exam-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 24px;
}

/* Done */
.result-card {
  padding: 24px;
  background: var(--bg-elevated);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.result-card h2 {
  text-align: center;
  margin: 0 0 16px;
}
.score-summary {
  text-align: center;
  margin-bottom: 16px;
}
.score-main {
  font-size: 2rem;
  font-weight: 700;
}
.score-max {
  font-size: 1.2rem;
  color: var(--text-secondary, #888);
}
.score-percent {
  font-size: 1.1rem;
  font-weight: 600;
  margin-top: 4px;
}
.score-percent.pass { color: #00a878; }
.score-percent:not(.pass) { color: #e74c3c; }
.score-breakdown {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-bottom: 24px;
}
.breakdown-item {
  text-align: center;
  padding: 8px 16px;
  background: var(--color-bg-sunken);
  border-radius: 8px;
}
.bd-label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary, #888);
  margin-bottom: 2px;
}
.bd-score {
  font-weight: 600;
}
.result-section {
  margin-bottom: 24px;
}
.result-section h3 {
  font-size: 1rem;
  margin: 0 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-subtle);
}
.result-item {
  padding: 12px;
  margin-bottom: 12px;
  background: var(--color-bg-sunken);
  border-radius: 8px;
}
.ri-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.ri-num {
  font-weight: 600;
  font-size: 0.85rem;
}
.ri-kp {
  font-size: 0.75rem;
  color: var(--text-secondary, #888);
}
.ri-result {
  margin-left: auto;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}
.ri-result.correct { background: rgba(0, 168, 120, 0.12); color: #00a878; }
.ri-result.wrong { background: rgba(231, 76, 60, 0.12); color: #e74c3c; }
.ri-result.pending { background: rgba(255, 209, 102, 0.15); color: #c99700; }
.ri-stem {
  font-size: 0.875rem;
  line-height: 1.5;
  margin-bottom: 8px;
}
.ri-answer, .ri-overall {
  font-size: 0.825rem;
  margin-top: 4px;
  color: var(--text-secondary, #666);
}
.ri-label {
  font-weight: 600;
}
.ri-dimensions {
  margin: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dim-item {
  display: grid;
  grid-template-columns: 60px 50px 1fr;
  gap: 8px;
  font-size: 0.8rem;
  align-items: start;
}
.dim-name { font-weight: 600; }
.dim-score { color: var(--text-secondary, #888); }
.dim-comment { color: var(--text-secondary, #666); }

/* Buttons */
.btn-primary, .btn-secondary {
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s;
}
.btn-primary {
  background: var(--accent, #00d4aa);
  color: #fff;
}
.btn-secondary {
  background: var(--color-bg-sunken);
  color: var(--text-primary, #333);
}
.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn-primary:not(:disabled):hover, .btn-secondary:hover {
  opacity: 0.85;
}

/* Mobile */
@media (max-width: 768px) {
  .exam-view {
    padding: 8px;
  }
  .exam-card {
    padding: 20px 16px;
  }
  .question-block {
    padding: 12px;
  }
  .score-breakdown {
    flex-direction: column;
    gap: 8px;
  }
  .dim-item {
    grid-template-columns: 50px 40px 1fr;
    font-size: 0.75rem;
  }
}
</style>
