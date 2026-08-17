<script setup>
// ============================================================
// VariantPracticeView.vue — 变式题练习（B3）
// ============================================================
// 流程：错题知识点 → 生成变式 → 作答 → 判分（新容差）→ 回写
// ============================================================

import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWrongBookStore } from '@/stores/wrongBook'
import { gradeObjective } from '@/utils/grading'
import { normalizeVariant, validateVariant } from '@/utils/variantNormalize'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'

const route = useRoute()
const router = useRouter()
const wbStore = useWrongBookStore()

const topic = computed(() => route.params.topic || route.query.topic || '')
const loading = ref(false)
const variant = ref(null)
const userAnswer = ref('')
const result = ref(null) // { correct: boolean, correct_answer: string, explanation: string }
const error = ref(null)

async function generateVariant() {
  loading.value = true
  variant.value = null
  userAnswer.value = ''
  result.value = null
  error.value = null

  try {
    const { generateVariant: genVariant } = await import('@/api/variant')

    // 从 wrongBook 获取关联的 question_id，尝试加载原题
    const wbItem = wbStore.items.find(i => i.topic === topic.value && !i.resolved)
    let originalQuestion = null

    if (wbItem?._question_id && wbItem._question_id !== 'undefined') {
      // 尝试从 DB 加载原题
      try {
        const { supabase, isSupabaseConfigured } = await import('@/services/supabase')
        if (isSupabaseConfigured) {
          const { data } = await supabase
            .from('questions')
            .select('stem, question_type, options, correct_answer, knowledge_point')
            .eq('id', wbItem._question_id)
            .single()
          if (data) originalQuestion = data
        }
      } catch (_) {}
    }

    // 构建 API 参数
    const params = originalQuestion
      ? {
          original_stem: originalQuestion.stem,
          knowledge_point: originalQuestion.knowledge_point || topic.value,
          question_type: originalQuestion.question_type,
          correct_answer: String(originalQuestion.correct_answer),
        }
      : {
          original_stem: `关于「${topic.value}」的练习题`,
          knowledge_point: topic.value,
          question_type: 'fill',
          correct_answer: '0',
        }

    const variants = await genVariant(params)

    if (variants.length === 0) {
      error.value = 'AI 未能生成变式题，请稍后重试'
      return
    }

    // 取第一个变式题
    const v = variants[0]
    const normalized = normalizeVariant(v) || v
    const validation = validateVariant(normalized, params.question_type)

    variant.value = {
      ...normalized,
      _valid: validation.valid,
      _errors: validation.errors,
    }

    // 如果变式题无效，仍然展示但标记
    if (!validation.valid) {
      console.warn('[VariantPractice] variant validation failed:', validation.errors)
    }
  } catch (e) {
    error.value = e.message.replace('VARIANT_ERROR: ', '')
  } finally {
    loading.value = false
  }
}

async function submitAnswer() {
  if (!variant.value || !userAnswer.value) return

  const isCorrect = gradeObjective(
    { ...variant.value, correct_answer: variant.value.correct_answer },
    userAnswer.value
  )

  result.value = {
    correct: isCorrect,
    correct_answer: variant.value.correct_answer,
    explanation: variant.value.explanation,
  }

  // 回写 DB（best-effort）
  await writeBack(isCorrect)
}

async function writeBack(isCorrect) {
  try {
    const { supabase, isSupabaseConfigured } = await import('@/services/supabase')
    if (!isSupabaseConfigured) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 记录到 question_attempts（不污染原错题记录）
    const wbItem = wbStore.items.find(i => i.topic === topic.value && !i.resolved)
    if (wbItem?._question_id) {
      await supabase.from('question_attempts').insert({
        user_id: user.id,
        question_id: wbItem._question_id,
        user_answer: userAnswer.value,
        is_correct: isCorrect,
        is_variant: true,
        variant_stem: variant.value.stem,
        variant_correct_answer: variant.value.correct_answer,
        created_at: new Date().toISOString(),
      })

      // 如果答错，increment wrong_count
      if (!isCorrect) {
        await supabase.rpc('increment_wrong_count', {
          p_question_id: wbItem._question_id,
          p_user_id: user.id,
        })
      }
    }
  } catch (e) {
    console.warn('[VariantPractice] writeBack failed:', e)
  }
}

function nextVariant() {
  generateVariant()
}

function back() {
  router.back()
}

onMounted(() => {
  if (topic.value) {
    generateVariant()
  }
})
</script>

<template>
  <div class="variant-view">
    <div class="variant-header">
      <button class="btn-back" @click="back">← 返回</button>
      <h2 class="page-title">变式题练习 · {{ topic }}</h2>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <p>AI 正在生成变式题...</p>
    </div>

    <!-- 错误 -->
    <div v-else-if="error" class="error-state">
      <p class="error-msg">{{ error }}</p>
      <button class="btn-retry" @click="generateVariant">重试</button>
    </div>

    <!-- 变式题展示 -->
    <div v-else-if="variant" class="variant-card">
      <div class="variant-badge">变式题</div>

      <div class="question-stem">
        <MarkdownRenderer :content="variant.stem" />
      </div>

      <!-- 选择题选项 -->
      <div v-if="variant.question_type === 'choice' && variant.options" class="question-options">
        <label
          v-for="opt in variant.options"
          :key="opt"
          class="option-item"
          :class="{
            selected: userAnswer === opt.charAt(0),
            correct: result && opt.charAt(0) === variant.correct_answer,
            wrong: result && userAnswer === opt.charAt(0) && !result.correct
          }"
        >
          <input
            v-model="userAnswer"
            type="radio"
            :value="opt.charAt(0)"
            :disabled="!!result"
          />
          <span class="option-text">
            <MarkdownRenderer :content="opt" :inline="true" />
          </span>
        </label>
      </div>

      <!-- 填空题输入 -->
      <div v-else class="fill-input">
        <input
          v-model="userAnswer"
          type="text"
          placeholder="输入你的答案..."
          :disabled="!!result"
          @keyup.enter="submitAnswer"
        />
      </div>

      <!-- 提交按钮 -->
      <div v-if="!result" class="action-row">
        <button
          class="btn-primary"
          :disabled="!userAnswer"
          @click="submitAnswer"
        >
          提交答案
        </button>
      </div>

      <!-- 结果展示 -->
      <div v-else class="result-section">
        <div class="result-banner" :class="{ correct: result.correct, wrong: !result.correct }">
          <span class="result-icon">{{ result.correct ? '✓' : '✗' }}</span>
          <span class="result-text">{{ result.correct ? '回答正确！' : '回答错误' }}</span>
        </div>

        <div v-if="!result.correct" class="correct-answer">
          <span class="label">正确答案：</span>
          <MarkdownRenderer :content="result.correct_answer" :inline="true" />
        </div>

        <div v-if="result.explanation" class="explanation">
          <div class="exp-title">解析</div>
          <MarkdownRenderer :content="result.explanation" />
        </div>

        <div class="action-row">
          <button class="btn-primary" @click="nextVariant">再来一题</button>
          <button class="btn-secondary" @click="back">返回错题本</button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <p>点击下方按钮生成变式题</p>
      <button class="btn-primary" @click="generateVariant">生成变式题</button>
    </div>
  </div>
</template>

<style scoped>
.variant-view {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 20px;
}

.variant-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.btn-back {
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #e5e7eb);
  background: transparent;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  font-size: 0.85rem;
}

.page-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-primary, #1a1a2e);
  margin: 0;
}

.loading-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-tertiary, #9ca3af);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color, #e5e7eb);
  border-top-color: var(--primary, #6366f1);
  border-radius: 50%;
  margin: 0 auto 12px;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-state {
  text-align: center;
  padding: 40px 20px;
}

.error-msg {
  color: #ef4444;
  margin-bottom: 16px;
  font-size: 0.9rem;
}

.btn-retry {
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px solid var(--primary, #6366f1);
  background: transparent;
  color: var(--primary, #6366f1);
  cursor: pointer;
  font-size: 0.85rem;
}

.variant-card {
  background: var(--bg-secondary, #f9fafb);
  border-radius: 12px;
  padding: 24px;
}

.variant-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  background: var(--primary, #6366f1);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  margin-bottom: 16px;
}

.question-stem {
  font-size: 1rem;
  line-height: 1.7;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 20px;
}

.question-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.option-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #e5e7eb);
  cursor: pointer;
  transition: all 0.2s;
}

.option-item:hover {
  border-color: var(--primary, #6366f1);
}

.option-item.selected {
  border-color: var(--primary, #6366f1);
  background: rgba(99, 102, 241, 0.05);
}

.option-item.correct {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

.option-item.wrong {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.option-item input {
  margin-top: 3px;
}

.option-text {
  flex: 1;
  font-size: 0.9rem;
}

.fill-input input {
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #1a1a2e);
  font-size: 0.9rem;
  outline: none;
}

.fill-input input:focus {
  border-color: var(--primary, #6366f1);
}

.action-row {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.btn-primary {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  background: var(--primary, #6366f1);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #1a1a2e);
  font-size: 0.9rem;
  cursor: pointer;
}

.result-section {
  margin-top: 20px;
}

.result-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 16px;
}

.result-banner.correct {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.result-banner.wrong {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.correct-answer {
  padding: 10px 14px;
  background: rgba(16, 185, 129, 0.05);
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 0.9rem;
}

.correct-answer .label {
  font-weight: 600;
  color: #10b981;
}

.explanation {
  padding: 14px 16px;
  background: var(--bg-tertiary, #f3f4f6);
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--text-secondary, #4b5563);
}

.exp-title {
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 8px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-tertiary, #9ca3af);
}

.empty-state p {
  margin-bottom: 16px;
  font-size: 0.9rem;
}
</style>
