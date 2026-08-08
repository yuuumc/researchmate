<script setup>
import { ref, computed, onMounted } from 'vue'
import { usePracticeStore } from '@/stores/practice'
import { useProfileStore } from '@/stores/profile'
import { useWrongBookStore } from '@/stores/wrongBook'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { SEED_QUESTIONS } from '@/data/seedDemo'
import { useAuthStore } from '@/stores/auth'
import AiGeneratedBadge from '@/components/AiGeneratedBadge.vue'

const practiceStore = usePracticeStore()
const profileStore = useProfileStore()
const wbStore = useWrongBookStore()

// 模式切换：llm | db | retry
const activeTab = ref('db')

// LLM 模式表单
const form = ref({
  knowledge_point: '',
  difficulty: '中级',
  question_type: '选择题',
  count: 5,
  student_level: '本科'
})
const difficulties = ['初级', '中级', '高级']
const questionTypes = ['选择题', '填空题', '简答题', '计算题']

// 薄弱知识点
const weakPoints = computed(() =>
  profileStore.profile?.weak_points || profileStore.profile?.weak_topics || []
)

onMounted(async () => {
  if (!form.value.knowledge_point && weakPoints.value.length > 0) {
    const first = weakPoints.value[0]
    form.value.knowledge_point = typeof first === 'string' ? first : (first.knowledge_point || first.topic || '')
  }
  // 加载错题本
  if (wbStore.unresolvedCount === 0) {
    try { await wbStore.loadFromDB() } catch (e) { /* silent */ }
  }
})

// LLM 模式
async function submitLLM() {
  if (!form.value.knowledge_point.trim()) return
  await practiceStore.runPractice({ ...form.value })
}

// DB 模式：按薄弱知识点抽题
async function startDBPractice() {
  if (starting.value) return
  starting.value = true
  try {
  const wps = weakPoints.value.map(wp =>
    typeof wp === 'string' ? wp : (wp.knowledge_point || wp.topic || '')
  ).filter(Boolean)
  if (wps.length === 0) {
    practiceStore.error = '请先完成诊断，生成薄弱知识点后再练习'
    return
  }
  await practiceStore.sampleByWeakPoints(wps, 5)
  } catch (e) {
    console.error('[practice] startDBPractice failed:', e)
  } finally {
    starting.value = false
  }
}

// 错题重练
async function startRetry() {
  if (starting.value) return
  starting.value = true
  try {
  await practiceStore.loadWrongQuestions()
  } catch (e) {
    console.error('[practice] startRetry failed:', e)
  } finally {
    starting.value = false
  }
}

// DB 模式判分
const grading = ref(false)
const starting = ref(false)
async function submitDBAnswers() {
  grading.value = true
  try {
    await practiceStore.gradeAndPersist()
  } catch (e) {
    console.error('grade failed:', e)
  } finally {
    grading.value = false
  }
}

// 掌握错题
async function markResolved(questionId) {
  await practiceStore.resolveWrongQuestion(questionId)
}

// 选择题选项
function setChoiceAnswer(qId, idx) {
  practiceStore.setDbAnswer(qId, String.fromCharCode(65 + idx))
}

// 状态
const dbQuestions = computed(() => practiceStore.dbQuestions)
const dbResults = computed(() => practiceStore.dbResults)
const loading = computed(() => practiceStore.loading)
const error = computed(() => practiceStore.error)
const hasResult = computed(() => practiceStore.hasResult)
const llmQuestions = computed(() => practiceStore.questions)

const expandedAnswers = ref(new Set())
function toggleAnswer(idx) {
  if (expandedAnswers.value.has(idx)) expandedAnswers.value.delete(idx)
  else expandedAnswers.value.add(idx)
}

const showSeed = computed(() => !hasResult.value && !practiceStore.hasDbQuestions && authStore.isGuest)
const seedQuestions = SEED_QUESTIONS
const authStore = useAuthStore()
const seedExpanded = ref(new Set())
function toggleSeedAnswer(idx) {
  if (seedExpanded.value.has(idx)) seedExpanded.value.delete(idx)
  else seedExpanded.value.add(idx)
}

// 切换 tab 时清理
// W3-3: AI 出题结果加入练习
function addToPractice() {
  practiceStore.addLLMToPractice(form.value.knowledge_point, form.value.difficulty)
  activeTab.value = 'db'
}

function switchTab(tab) {
  activeTab.value = tab
  practiceStore.clear()
}
</script>

<template>
  <div class="practice-view">
    <div class="page-content">
      <div class="page-header">
        <div class="page-eyebrow"><span class="dot"></span><span>Practice Agent</span></div>
        <h1 class="page-title">练习题</h1>
        <p class="page-subtitle">薄弱点抽题 · 自动判分 · 错题回写 · 错题重练</p>
      </div>

      <!-- 模式切换 -->
      <div class="tab-bar">
        <button :class="['tab', { active: activeTab === 'db' }]" @click="switchTab('db')">
          薄弱点练习
        </button>
        <button :class="['tab', { active: activeTab === 'retry' }]" @click="switchTab('retry')">
          错题重练 <span v-if="wbStore.unresolvedCount" class="tab-badge">{{ wbStore.unresolvedCount }}</span>
        </button>
        <button :class="['tab', { active: activeTab === 'llm' }]" @click="switchTab('llm')">
          AI 出题
        </button>
      </div>

      <div v-if="error" class="error-banner">{{ error }}</div>

      <!-- DB 模式 -->
      <section v-if="activeTab === 'db'" class="db-section">
        <div v-if="!practiceStore.hasDbQuestions && !loading" class="db-intro">
          <div class="db-intro-card">
            <h3>薄弱点练习</h3>
            <p>从题库按你的薄弱知识点抽取选择/填空题，做题后自动判分，错题自动进错题本。</p>
            <div v-if="weakPoints.length" class="weak-tags">
              <span v-for="(wp, i) in weakPoints.slice(0, 8)" :key="i" class="weak-tag">
                {{ typeof wp === 'string' ? wp : (wp.knowledge_point || wp.topic || JSON.stringify(wp)) }}
              </span>
            </div>
            <div v-else class="no-weak">
              <p>暂无薄弱知识点。请先完成一次 <router-link to="/diagnosis/session">混合诊断</router-link>。</p>
            </div>
            <button class="start-btn" @click="startDBPractice" :disabled="weakPoints.length === 0 || starting">
              {{ starting ? "加载中…" : "开始练习（5 题）" }}
            </button>
          </div>
        </div>

        <!-- 加载中 -->
        <div v-if="loading" class="loading-card">
          <div class="spinner-lg"></div>
          <p>正在从题库抽题…</p>
        </div>

        <!-- 做题 -->
        <div v-if="practiceStore.hasDbQuestions && !dbResults" class="quiz-section">
          <div class="quiz-bar">
            <span class="quiz-progress">{{ practiceStore.dbAnsweredCount }}/{{ dbQuestions.length }}</span>
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: (dbQuestions.length ? practiceStore.dbAnsweredCount / dbQuestions.length * 100 : 0) + '%' }"></div>
            </div>
          </div>

          <div v-for="(q, idx) in dbQuestions" :key="q.id" class="question-card">
            <div class="q-meta">
              <span class="q-tag">{{ q.subject }}</span>
              <span class="q-tag q-tag--type">{{ q.question_type === 'choice' ? '选择' : '填空' }}</span>
              <span class="q-tag q-tag--diff">难度 {{ q.difficulty }}</span>
              <span class="q-kp">{{ q.knowledge_point }}</span>
            </div>
            <div class="q-stem">{{ idx + 1 }}. {{ q.stem }}</div>

            <div v-if="q.question_type === 'choice' && q.options" class="q-options">
              <label v-for="(opt, i) in q.options" :key="i" class="q-option"
                :class="{ active: practiceStore.dbAnswers[q.id] === String.fromCharCode(65 + i) }">
                <input type="radio" :name="'pq-' + q.id" :value="String.fromCharCode(65 + i)"
                  :checked="practiceStore.dbAnswers[q.id] === String.fromCharCode(65 + i)"
                  @change="setChoiceAnswer(q.id, i)" />
                <span class="opt-letter">{{ String.fromCharCode(65 + i) }}</span>
                <span class="opt-text">{{ typeof opt === 'string' ? opt : (opt.text || opt.label || opt) }}</span>
              </label>
            </div>

            <div v-else class="q-fill">
              <input type="text" class="fill-input" placeholder="填写你的答案…"
                :value="practiceStore.dbAnswers[q.id] || ''"
                @input="practiceStore.setDbAnswer(q.id, $event.target.value)" />
            </div>
          </div>

          <button class="submit-btn" @click="submitDBAnswers" :disabled="grading">
            <span v-if="grading" class="spinner"></span>
            {{ grading ? '判分中…' : '提交判分' }}
          </button>
        </div>

        <!-- 判分结果 -->
        <div v-if="dbResults" class="result-section">
          <div class="result-banner" :class="{ 'result-good': dbResults.wrong === 0 }">
            <span class="result-icon">{{ dbResults.wrong === 0 ? '🎉' : '📝' }}</span>
            <span>答对 {{ dbResults.correct }}/{{ dbResults.total }} 题，{{ dbResults.wrong }} 题已加入错题本</span>
          </div>

          <div v-for="(d, idx) in dbResults.details" :key="d.question_id" class="result-card" :class="{ wrong: !d.is_correct }">
            <div class="q-meta">
              <span class="q-tag" :class="d.is_correct ? 'q-tag--ok' : 'q-tag--err'">{{ d.is_correct ? '✓ 正确' : '✗ 错误' }}</span>
              <span class="q-tag q-tag--diff">难度 {{ d.difficulty }}</span>
              <span class="q-kp">{{ d.knowledge_point }}</span>
            </div>
            <div class="q-stem">{{ idx + 1 }}. {{ d.stem }}</div>
            <div class="answer-row">
              <span class="answer-label">你的答案：</span>
              <span class="answer-value" :class="{ 'wrong-text': !d.is_correct }">{{ d.user_answer || '(未作答)' }}</span>
            </div>
            <div v-if="!d.is_correct" class="answer-row">
              <span class="answer-label">正确答案：</span>
              <span class="answer-value correct-text">{{ d.correct_answer }}</span>
            </div>
            <button v-if="!d.is_correct" class="resolve-btn" @click="markResolved(d.question_id)">
              已掌握，移出错题本
            </button>
          </div>

          <div class="done-actions">
            <button class="action-btn" @click="startDBPractice" :disabled="starting">{{ starting ? "加载中…" : "再来一组" }}</button>
            <button class="action-btn action-btn--ghost" @click="switchTab('retry')">错题重练</button>
          </div>
        </div>
      </section>

      <!-- 错题重练模式 -->
      <section v-if="activeTab === 'retry'" class="retry-section">
        <div v-if="!practiceStore.hasDbQuestions && !loading && !dbResults" class="retry-intro">
          <div class="db-intro-card">
            <h3>错题重练</h3>
            <p>从错题本中加载之前的错题，重新作答。答对后可标记为已掌握。</p>
            <button class="start-btn" @click="startRetry" :disabled="starting">{{ starting ? "加载中…" : "加载错题" }}</button>
          </div>
        </div>

        <div v-if="loading" class="loading-card">
          <div class="spinner-lg"></div>
          <p>正在加载错题…</p>
        </div>

        <!-- 同 DB 模式的做题 + 结果 UI -->
        <div v-if="practiceStore.hasDbQuestions && !dbResults" class="quiz-section">
          <div class="quiz-bar">
            <span class="quiz-progress">{{ practiceStore.dbAnsweredCount }}/{{ dbQuestions.length }}</span>
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: (dbQuestions.length ? practiceStore.dbAnsweredCount / dbQuestions.length * 100 : 0) + '%' }"></div>
            </div>
          </div>
          <div v-for="(q, idx) in dbQuestions" :key="q.id" class="question-card">
            <div class="q-meta">
              <span class="q-tag">{{ q.subject }}</span>
              <span class="q-tag q-tag--type">{{ q.question_type === 'choice' ? '选择' : '填空' }}</span>
              <span class="q-kp">{{ q.knowledge_point }}</span>
            </div>
            <div class="q-stem">{{ idx + 1 }}. {{ q.stem }}</div>
            <div v-if="q.question_type === 'choice' && q.options" class="q-options">
              <label v-for="(opt, i) in q.options" :key="i" class="q-option"
                :class="{ active: practiceStore.dbAnswers[q.id] === String.fromCharCode(65 + i) }">
                <input type="radio" :name="'rq-' + q.id" :value="String.fromCharCode(65 + i)"
                  :checked="practiceStore.dbAnswers[q.id] === String.fromCharCode(65 + i)"
                  @change="setChoiceAnswer(q.id, i)" />
                <span class="opt-letter">{{ String.fromCharCode(65 + i) }}</span>
                <span class="opt-text">{{ typeof opt === 'string' ? opt : (opt.text || opt.label || opt) }}</span>
              </label>
            </div>
            <div v-else class="q-fill">
              <input type="text" class="fill-input" placeholder="填写你的答案…"
                :value="practiceStore.dbAnswers[q.id] || ''"
                @input="practiceStore.setDbAnswer(q.id, $event.target.value)" />
            </div>
          </div>
          <button class="submit-btn" @click="submitDBAnswers" :disabled="grading">
            <span v-if="grading" class="spinner"></span>
            {{ grading ? '判分中…' : '提交判分' }}
          </button>
        </div>

        <div v-if="dbResults" class="result-section">
          <div class="result-banner" :class="{ 'result-good': dbResults.wrong === 0 }">
            <span class="result-icon">{{ dbResults.wrong === 0 ? '🎉' : '📝' }}</span>
            <span>答对 {{ dbResults.correct }}/{{ dbResults.total }} 题</span>
          </div>
          <div v-for="(d, idx) in dbResults.details" :key="d.question_id" class="result-card" :class="{ wrong: !d.is_correct }">
            <div class="q-meta">
              <span class="q-tag" :class="d.is_correct ? 'q-tag--ok' : 'q-tag--err'">{{ d.is_correct ? '✓ 正确' : '✗ 错误' }}</span>
              <span class="q-kp">{{ d.knowledge_point }}</span>
            </div>
            <div class="q-stem">{{ idx + 1 }}. {{ d.stem }}</div>
            <div class="answer-row">
              <span class="answer-label">你的答案：</span>
              <span class="answer-value" :class="{ 'wrong-text': !d.is_correct }">{{ d.user_answer || '(未作答)' }}</span>
            </div>
            <div v-if="!d.is_correct" class="answer-row">
              <span class="answer-label">正确答案：</span>
              <span class="answer-value correct-text">{{ d.correct_answer }}</span>
            </div>
            <button v-if="d.is_correct" class="resolve-btn" @click="markResolved(d.question_id)">
              已掌握，移出错题本
            </button>
          </div>
          <div class="done-actions">
            <button class="action-btn" @click="startRetry" :disabled="starting">{{ starting ? "加载中…" : "重新加载错题" }}</button>
            <button class="action-btn action-btn--ghost" @click="switchTab('db')">薄弱点练习</button>
          </div>
        </div>
      </section>

      <!-- LLM 模式（保留原有） -->
      <section v-if="activeTab === 'llm'" class="llm-section">
        <div class="form-row">
          <div class="form-group">
            <label>知识点</label>
            <input v-model="form.knowledge_point" type="text" placeholder="如：MOSFET 阈值电压" />
          </div>
          <div class="form-group">
            <label>难度</label>
            <select v-model="form.difficulty">
              <option v-for="d in difficulties" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>题型</label>
            <select v-model="form.question_type">
              <option v-for="t in questionTypes" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>数量</label>
            <input v-model.number="form.count" type="number" min="1" max="10" />
          </div>
        </div>
        <button class="submit-btn" @click="submitLLM" :disabled="loading">
          <span v-if="loading" class="spinner"></span>
          {{ loading ? 'AI 出题中…' : '生成练习题' }}
        </button>

        <div v-if="hasResult && llmQuestions.length" class="llm-results">
          <div class="add-to-practice-bar">
            <button class="add-practice-btn" @click="addToPractice">
              加入练习（{{ llmQuestions.length }} 题）
            </button>
            <span class="add-practice-hint">转为可做题模式，支持答题判分</span>
          </div>
          <div v-for="(q, idx) in llmQuestions" :key="idx" class="question-card">
            <div class="q-meta">
              <span class="q-tag q-tag--type">{{ q.type || q.question_type || '题目' }}</span>
              <span v-if="q.difficulty_label" class="q-tag q-tag--diff">{{ q.difficulty_label }}</span>
            </div>
            <div class="q-stem">{{ idx + 1 }}. {{ q.stem || q.question || '' }}</div>
            <div v-if="q.options" class="q-options">
              <div v-for="(opt, key) in q.options" :key="key" class="q-option q-option--static">
                <span class="opt-letter">{{ key }}</span>
                <span class="opt-text">{{ opt }}</span>
              </div>
            </div>
            <button class="answer-toggle" @click="toggleAnswer(idx)">
              {{ expandedAnswers.has(idx) ? '隐藏答案' : '查看答案' }}
            </button>
            <div v-if="expandedAnswers.has(idx)" class="answer-block">
              <p><strong>答案：</strong>{{ q.answer }}</p>
              <p v-if="q.explanation"><strong>解析：</strong>{{ q.explanation }}</p>
            </div>
          </div>
        </div>

        <!-- 种子题目 -->
        <div v-if="showSeed" class="seed-section">
          <h3 class="seed-title">示例题目</h3>
          <div v-for="(q, idx) in seedQuestions" :key="idx" class="question-card">
            <div class="q-meta">
              <span class="q-tag q-tag--type">{{ q.type || '题目' }}</span>
            </div>
            <div class="q-stem">{{ idx + 1 }}. {{ q.stem }}</div>
            <button class="answer-toggle" @click="toggleSeedAnswer(idx)">
              {{ seedExpanded.has(idx) ? '隐藏答案' : '查看答案' }}
            </button>
            <div v-if="seedExpanded.has(idx)" class="answer-block">
              <p><strong>答案：</strong>{{ q.answer }}</p>
              <p v-if="q.explanation"><strong>解析：</strong>{{ q.explanation }}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.practice-view { min-height: 100vh; background: var(--bg-base, #f4f6fa); }
.page-content { max-width: 760px; margin: 0 auto; padding: 24px 20px 80px; }
.page-header { margin-bottom: 24px; }
.page-eyebrow { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #7a8ba3; font-family: var(--font-mono, monospace); margin-bottom: 8px; }
.page-eyebrow .dot { width: 6px; height: 6px; border-radius: 50%; background: #4d9de0; }
.page-title { font-size: 28px; font-weight: 700; color: #1a2332; margin: 0 0 8px; }
.page-subtitle { font-size: 14px; color: #5a6b80; margin: 0; }

.tab-bar { display: flex; gap: 4px; margin-bottom: 20px; background: var(--bg-surface); border-radius: 12px; padding: 4px; box-shadow: var(--shadow-sm); }
.tab { flex: 1; padding: 10px; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; color: #5a6b80; background: transparent; cursor: pointer; transition: all .15s; position: relative; }
.tab.active { background: #4d9de0; color: #fff; }
.tab-badge { display: inline-block; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #e53e3e; color: #fff; font-size: 11px; line-height: 18px; text-align: center; margin-left: 4px; }

.error-banner { padding: 12px 16px; background: #fff5f5; border: 1px solid #fed7d7; border-radius: 10px; color: #c53030; font-size: 14px; margin-bottom: 16px; }

.db-intro-card { background: var(--bg-surface); border-radius: 16px; padding: 32px; box-shadow: var(--shadow-md); text-align: center; }
.db-intro-card h3 { font-size: 18px; margin: 0 0 12px; color: #1a2332; }
.db-intro-card p { font-size: 14px; color: #5a6b80; line-height: 1.6; margin: 0 0 20px; }
.weak-tags { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-bottom: 20px; }
.weak-tag { padding: 4px 10px; background: #fff5f5; border: 1px solid #fed7d7; border-radius: 6px; font-size: 12px; color: #c53030; }
.no-weak p { font-size: 14px; color: #7a8ba3; }
.no-weak a { color: #4d9de0; }

.start-btn { padding: 12px 32px; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; color: #fff; background: linear-gradient(135deg, #4d9de0, #2563eb); cursor: pointer; }
.start-btn:disabled { opacity: .5; cursor: not-allowed; }

.loading-card { text-align: center; padding: 48px; background: var(--bg-surface); border-radius: 16px; }
.spinner-lg { width: 40px; height: 40px; border: 3px solid #e8ecf3; border-top-color: #4d9de0; border-radius: 50%; animation: spin .8s linear infinite; margin: 0 auto 16px; }
.spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; margin-right: 8px; vertical-align: middle; }
@keyframes spin { to { transform: rotate(360deg); } }

.quiz-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.quiz-progress { font-size: 13px; color: #5a6b80; white-space: nowrap; font-family: var(--font-mono, monospace); }
.progress-track { flex: 1; height: 6px; background: #e8ecf3; border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #4d9de0, #2563eb); transition: width .3s; }

.question-card { background: var(--bg-surface); border-radius: 14px; padding: 24px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
.q-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.q-tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: #eef2f7; color: #5a6b80; }
.q-tag--type { background: #e0f2fe; color: #0369a1; }
.q-tag--diff { background: #fef3c7; color: #92400e; }
.q-tag--ok { background: #c6f6d5; color: #22543d; }
.q-tag--err { background: #fed7d7; color: #742a2a; }
.q-kp { font-size: 12px; color: #7a8ba3; }
.q-stem { font-size: 15px; color: #1a2332; line-height: 1.7; margin-bottom: 16px; }

.q-options { display: flex; flex-direction: column; gap: 8px; }
.q-option { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border: 2px solid #e8ecf3; border-radius: 10px; cursor: pointer; transition: all .15s; }
.q-option:hover { border-color: #c3daef; }
.q-option.active { border-color: #4d9de0; background: #f0f7ff; }
.q-option--static { cursor: default; }
.q-option--static:hover { border-color: #e8ecf3; }
.q-option input { margin-top: 3px; }
.opt-letter { font-weight: 700; color: #4d9de0; min-width: 18px; }
.opt-text { font-size: 14px; color: #3a4a5e; }

.fill-input { width: 100%; border: 2px solid #e8ecf3; border-radius: 10px; padding: 12px; font-size: 14px; box-sizing: border-box; }
.fill-input:focus { outline: none; border-color: #4d9de0; }

.submit-btn { width: 100%; padding: 14px; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; color: #fff; background: linear-gradient(135deg, #4d9de0, #2563eb); cursor: pointer; }
.submit-btn:disabled { opacity: .6; cursor: not-allowed; }

.result-banner { display: flex; align-items: center; gap: 10px; padding: 14px 20px; background: #fff5f5; border: 1px solid #fed7d7; border-radius: 12px; font-size: 14px; color: #c53030; margin-bottom: 16px; }
.result-banner.result-good { background: #f0fff4; border-color: #9ae6b4; color: #22543d; }
.result-icon { font-size: 20px; }

.result-card { background: var(--bg-surface); border-radius: 14px; padding: 24px; margin-bottom: 12px; box-shadow: var(--shadow-sm); border-left: 4px solid #48bb78; }
.result-card.wrong { border-left-color: #e53e3e; }
.answer-row { display: flex; gap: 8px; font-size: 14px; margin: 6px 0; }
.answer-label { color: #7a8ba3; white-space: nowrap; }
.answer-value { color: #1a2332; }
.wrong-text { color: #e53e3e; }
.correct-text { color: #38a169; font-weight: 600; }
.resolve-btn { margin-top: 12px; padding: 6px 16px; border: 1px solid #38a169; background: var(--bg-elevated); color: #38a169; border-radius: 8px; font-size: 13px; cursor: pointer; }
.resolve-btn:hover { background: #f0fff4; }

.done-actions { display: flex; gap: 12px; margin-top: 20px; }
.action-btn { flex: 1; padding: 12px; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; background: #4d9de0; color: #fff; }
.action-btn--ghost { background: var(--bg-elevated); color: #4d9de0; border: 2px solid #4d9de0; }

.form-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.form-group { flex: 1; min-width: 120px; }
.form-group label { display: block; font-size: 13px; color: #5a6b80; margin-bottom: 4px; }
.form-group input, .form-group select { width: 100%; padding: 10px; border: 2px solid #e8ecf3; border-radius: 8px; font-size: 14px; box-sizing: border-box; }

.answer-toggle { margin-top: 12px; padding: 6px 14px; border: 1px solid #4d9de0; background: var(--bg-elevated); color: #4d9de0; border-radius: 8px; font-size: 13px; cursor: pointer; }
.answer-block { margin-top: 12px; padding: 12px; background: #f7fafc; border-radius: 8px; font-size: 14px; line-height: 1.6; }
.answer-block p { margin: 4px 0; }

.seed-section { margin-top: 32px; }
.seed-title { font-size: 16px; color: #5a6b80; margin-bottom: 16px; }

/* W3-3: 加入练习 */
.add-to-practice-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  margin-bottom: 16px;
}

.add-practice-btn {
  padding: 8px 18px;
  background: var(--color-node-active);
  color: var(--color-fg-inverse);
  border: none;
  border-radius: var(--radius-full);
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.add-practice-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.add-practice-hint {
  font-size: 11px;
  color: var(--color-fg-tertiary);
}
</style>
