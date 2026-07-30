<script setup>
import { ref, computed } from 'vue'
import { usePracticeStore } from '@/stores/practice'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'

const practiceStore = usePracticeStore()

const form = ref({
  knowledge_point: '',
  difficulty: '中级',
  question_type: '选择题',
  count: 5,
  student_level: '本科'
})

const difficulties = ['初级', '中级', '高级']
const questionTypes = ['选择题', '填空题', '简答题', '计算题']

async function submit() {
  if (!form.value.knowledge_point.trim()) return
  await practiceStore.runPractice({ ...form.value })
}

const questions = computed(() => practiceStore.questions)
const result = computed(() => practiceStore.result)
const loading = computed(() => practiceStore.loading)
const error = computed(() => practiceStore.error)

// 答案折叠状态
const expandedAnswers = ref(new Set())
function toggleAnswer(idx) {
  if (expandedAnswers.value.has(idx)) {
    expandedAnswers.value.delete(idx)
  } else {
    expandedAnswers.value.add(idx)
  }
}
</script>

<template>
  <div class="practice-view">
    <div class="page-content">
      <div class="page-header">
        <div class="page-eyebrow"><span class="dot"></span><span>Practice Agent</span></div>
        <h1 class="page-title">练习题</h1>
        <p class="page-subtitle">针对性出题 · 答案折叠 · 考点标签 · 解析</p>
      </div>

      <!-- 表单 -->
      <section class="form-section">
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
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>题型</label>
            <select v-model="form.question_type">
              <option v-for="t in questionTypes" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>数量</label>
            <input v-model.number="form.count" type="number" min="1" max="20" />
          </div>
          <div class="form-group">
            <label>学生水平</label>
            <select v-model="form.student_level">
              <option>本科</option>
              <option>硕士</option>
              <option>博士</option>
            </select>
          </div>
        </div>

        <button class="submit-btn" :disabled="loading || !form.knowledge_point.trim()" @click="submit">
          {{ loading ? '生成中…' : '生成练习题' }}
        </button>
        <div v-if="error" class="error-msg">{{ error }}</div>
      </section>

      <!-- 题目卡片 -->
      <section v-if="questions.length" class="result-section">
        <div class="section-header">
          <h2 class="section-title">练习题</h2>
          <span class="section-en">{{ questions.length }} Questions</span>
        </div>
        <div class="question-list">
          <div v-for="(q, i) in questions" :key="i" class="question-card">
            <div class="q-header">
              <span class="q-num">Q{{ i + 1 }}</span>
              <span v-if="q.difficulty" class="q-difficulty" :class="q.difficulty">{{ q.difficulty }}</span>
              <span v-if="q.question_type" class="q-type">{{ q.question_type }}</span>
            </div>
            <div class="q-content">{{ q.question || q.title || q.content }}</div>

            <!-- 选项 -->
            <div v-if="q.options?.length" class="q-options">
              <div v-for="(opt, j) in q.options" :key="j" class="q-option">
                <span class="opt-label">{{ String.fromCharCode(65 + j) }}.</span>
                <span class="opt-text">{{ typeof opt === 'string' ? opt : opt.text || opt.content }}</span>
              </div>
            </div>

            <!-- 考点标签 -->
            <div v-if="q.tags?.length || q.knowledge_points?.length" class="q-tags">
              <span v-for="t in (q.tags || q.knowledge_points)" :key="t" class="q-tag">{{ t }}</span>
            </div>

            <!-- 答案折叠 -->
            <div class="q-answer-area">
              <button class="answer-toggle" @click="toggleAnswer(i)">
                {{ expandedAnswers.has(i) ? '收起答案' : '查看答案' }}
              </button>
              <div v-if="expandedAnswers.has(i)" class="q-answer">
                <div v-if="q.answer" class="answer-line">
                  <span class="answer-label">答案：</span>{{ q.answer }}
                </div>
                <div v-if="q.analysis || q.explanation" class="answer-line">
                  <span class="answer-label">解析：</span>
                  <MarkdownRenderer :content="q.analysis || q.explanation" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Markdown fallback -->
      <section v-if="result?.content && !questions.length" class="report-section">
        <MarkdownRenderer :content="result.content" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.practice-view { min-height: calc(100vh - 72px); }
.page-content { max-width: 880px; margin: 0 auto; padding: 40px 32px 64px; }

.page-header { margin-bottom: 32px; }
.page-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 4px 12px; background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle); border-radius: var(--radius-full);
  font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-500); margin-bottom: 12px;
}
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-node-active); }
.page-title { font-family: var(--font-serif); font-size: 32px; font-weight: 700; color: var(--color-ink-900); margin: 0 0 8px; }
.page-subtitle { font-size: 13px; color: var(--color-fg-secondary); margin: 0; }

.form-section {
  background: var(--color-bg-elevated); border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg); padding: 24px; margin-bottom: 24px; box-shadow: var(--shadow-sm);
}
.form-row { display: flex; gap: 16px; margin-bottom: 16px; }
.form-group { flex: 1; margin-bottom: 16px; }
.form-group label { display: block; font-size: 12px; font-weight: 600; color: var(--color-ink-700); margin-bottom: 6px; }
.form-group input, .form-group select {
  width: 100%; padding: 10px 12px; background: var(--color-bg-base);
  border: 1px solid var(--color-border-default); border-radius: var(--radius-sm);
  font-size: 14px; color: var(--color-ink-900);
}
.form-group input:focus, .form-group select:focus { outline: none; border-color: var(--color-node-active); }

.submit-btn {
  padding: 12px 32px; background: var(--color-ink-900); color: var(--color-fg-inverse);
  border: none; border-radius: var(--radius-sm); font-size: 14px; font-weight: 600;
  cursor: pointer; transition: opacity var(--duration-fast);
}
.submit-btn:hover:not(:disabled) { opacity: 0.85; }
.submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.error-msg { margin-top: 12px; padding: 10px 14px; background: rgba(255,107,107,0.08); border-radius: var(--radius-sm); color: #ff6b6b; font-size: 13px; }

.section-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
.section-title { font-family: var(--font-serif); font-size: 18px; font-weight: 700; color: var(--color-ink-900); margin: 0; }
.section-en { font-family: var(--font-mono); font-size: 11px; color: var(--color-fg-tertiary); letter-spacing: 1px; }

.question-list { display: flex; flex-direction: column; gap: 16px; }
.question-card { background: var(--color-bg-elevated); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-lg); padding: 20px; }
.q-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.q-num { font-family: var(--font-mono); font-size: 14px; font-weight: 700; color: var(--color-ink-900); }
.q-difficulty { padding: 2px 8px; border-radius: var(--radius-xs); font-size: 11px; font-weight: 600; }
.q-difficulty.初级 { background: var(--color-success-bg); color: var(--color-success); }
.q-difficulty.中级 { background: rgba(255,209,102,0.15); color: #b8860b; }
.q-difficulty.高级 { background: rgba(255,107,107,0.1); color: #ff6b6b; }
.q-type { padding: 2px 8px; background: var(--color-bg-sunken); border-radius: var(--radius-xs); font-size: 11px; color: var(--color-fg-tertiary); }

.q-content { font-size: 15px; color: var(--color-ink-900); line-height: 1.7; margin-bottom: 12px; }
.q-options { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.q-option { display: flex; gap: 6px; font-size: 14px; color: var(--color-ink-700); }
.opt-label { font-weight: 600; color: var(--color-ink-900); }

.q-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }
.q-tag { padding: 2px 8px; background: var(--color-bg-sunken); border-radius: var(--radius-xs); font-size: 11px; color: var(--color-fg-tertiary); }

.q-answer-area { border-top: 1px solid var(--color-border-subtle); padding-top: 10px; }
.answer-toggle { background: none; border: none; cursor: pointer; font-size: 13px; color: var(--color-node-active); font-weight: 600; padding: 4px 0; }
.answer-toggle:hover { text-decoration: underline; }
.q-answer { margin-top: 8px; padding: 12px; background: var(--color-bg-sunken); border-radius: var(--radius-sm); }
.answer-line { font-size: 13px; color: var(--color-ink-700); line-height: 1.7; margin-bottom: 8px; }
.answer-line:last-child { margin-bottom: 0; }
.answer-label { font-weight: 600; color: var(--color-ink-900); }

.report-section { margin-top: 24px; }

@media (max-width: 768px) {
  .page-content { padding: 24px 16px 48px; }
  .page-title { font-size: 26px; }
  .form-row { flex-direction: column; gap: 0; }
}
</style>
