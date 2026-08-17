<script setup>
// ============================================================
// F2 拍题讲解（多模态）
// 闭环：上传照片 → 多模态识别 → 苏格拉底式分步讲解（SSE）→ 知识点经 F1 事件总线写回画像 → 一键生成同知识点变式题
// ============================================================
import { ref, computed } from 'vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import AiGeneratedBadge from '@/components/AiGeneratedBadge.vue'
import { profileBus, EVT } from '@/core/profileBus'
import { generateVariant } from '@/api/variant'
import { gradeObjective } from '@/utils/grading'

// ---- 状态机 ----
// idle → recognizing → recognized → explaining → explained → (variant)
const phase = ref('idle')
const errorMsg = ref('')
const recognizing = ref(false)
const explaining = ref(false)

// 识别结果
const recognizeResult = ref(null) // { is_valid, knowledge_point, question_type, question_stem, correct_answer, message }

// 讲解
const explanation = ref('')
const explainStartTime = ref(0)
const firstTokenLatency = ref(null)

// 变式题
const variantLoading = ref(false)
const variantQuestion = ref(null)
const variantAnswer = ref('')
const variantResult = ref(null) // { is_correct, correct_answer }

// 画像写回
const profileWritten = ref(false)

// 文件输入
const fileInput = ref(null)
const previewUrl = ref('')

// ---- 图片压缩（<1MB）----
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请上传图片文件'))
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        // 目标：长边 ≤1600，JPEG quality 0.8，循环降到 <1MB
        const MAX_DIM = 1600
        let { width, height } = img
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        let quality = 0.8
        let dataUrl = canvas.toDataURL('image/jpeg', quality)
        // 逐步降质量直到 <1MB（base64 字符串约 1.33x 字节数）
        while (dataUrl.length > 1_300_000 && quality > 0.3) {
          quality -= 0.15
          dataUrl = canvas.toDataURL('image/jpeg', quality)
        }
        resolve(dataUrl)
      }
      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

// ---- 选择文件 ----
async function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  resetResult()
  errorMsg.value = ''
  try {
    const dataUrl = await compressImage(file)
    previewUrl.value = dataUrl
    await recognize(dataUrl)
  } catch (err) {
    errorMsg.value = err.message || '图片处理失败'
    phase.value = 'idle'
  } finally {
    // 允许重复选同一文件
    if (fileInput.value) fileInput.value.value = ''
  }
}

function resetResult() {
  recognizeResult.value = null
  explanation.value = ''
  firstTokenLatency.value = null
  variantQuestion.value = null
  variantAnswer.value = ''
  variantResult.value = null
  profileWritten.value = false
}

// ---- Stage 1: 识别 ----
async function recognize(image) {
  recognizing.value = true
  phase.value = 'recognizing'
  try {
    const r = await fetch('/api/tutor-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'recognize', image }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      throw new Error(err.message || `识别失败 (HTTP ${r.status})`)
    }
    const data = await r.json()
    recognizeResult.value = data
    if (!data.is_valid) {
      phase.value = 'idle'
      errorMsg.value = data.message || '图片无法识别为有效题目，请重新拍摄'
      return
    }
    phase.value = 'recognized'
    // 自动开始讲解
    await explain()
  } catch (err) {
    errorMsg.value = err.message || '识别失败，请重试'
    phase.value = 'idle'
  } finally {
    recognizing.value = false
  }
}

// ---- Stage 2: SSE 讲解 ----
async function explain() {
  const rr = recognizeResult.value
  if (!rr || !rr.is_valid) return
  explaining.value = true
  phase.value = 'explaining'
  explanation.value = ''
  explainStartTime.value = Date.now()
  firstTokenLatency.value = null

  try {
    const response = await fetch('/api/tutor-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage: 'explain',
        question_stem: rr.question_stem,
        knowledge_point: rr.knowledge_point,
        question_type: rr.question_type,
        correct_answer: rr.correct_answer,
      }),
    })
    if (!response.ok || !response.body) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.message || `讲解失败 (HTTP ${response.status})`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let firstTokenTime = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''
      for (const evt of events) {
        for (const line of evt.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (payload === '[DONE]') {
            continue
          }
          try {
            const parsed = JSON.parse(payload)
            if (parsed.error) {
              throw new Error(parsed.message || parsed.error)
            }
            const delta = parsed.choices?.[0]?.delta?.content || ''
            if (delta) {
              if (firstTokenTime === null) {
                firstTokenTime = Date.now()
                firstTokenLatency.value = firstTokenTime - explainStartTime.value
              }
              explanation.value += delta
            }
          } catch (parseErr) {
            if (parseErr.message && !parseErr.message.startsWith('Unexpected')) {
              throw parseErr
            }
          }
        }
      }
    }

    phase.value = 'explained'
    // 讲解完成 → 经 F1 事件总线写回画像（统一写入口）
    writeProfile()
  } catch (err) {
    errorMsg.value = err.message || '讲解失败，请重试'
    phase.value = 'recognized'
  } finally {
    explaining.value = false
  }
}

// ---- 画像写回（profileBus 统一入口）----
function writeProfile() {
  const rr = recognizeResult.value
  if (!rr || !rr.knowledge_point) return
  try {
    // 讲解完成 = 一次学习事件，outcome=correct（正向掌握度）
    // questionType 映射到规则引擎权重：essay→essay, choice→choice, fill→fill, 其余→practice
    const qtMap = { choice: 'choice', fill: 'fill', essay: 'essay' }
    profileBus.emit(EVT.LEARNING_EVENT, {
      topic: rr.knowledge_point,
      outcome: 'correct',
      questionType: qtMap[rr.question_type] || 'practice',
      timestamp: new Date().toISOString(),
    })
    profileWritten.value = true
  } catch (e) {
    console.warn('[tutor-photo] profile writeback failed:', e)
  }
}

// ---- 变式题 ----
async function fetchVariant() {
  const rr = recognizeResult.value
  if (!rr || !rr.is_valid) return
  variantLoading.value = true
  variantResult.value = null
  variantAnswer.value = ''
  try {
    // 题型：essay 简答/计算题不便做选择/填空判分，降级为 fill
    const qt = rr.question_type === 'choice' ? 'choice' : 'fill'
    const variants = await generateVariant({
      original_stem: rr.question_stem,
      knowledge_point: rr.knowledge_point,
      question_type: qt,
      correct_answer: rr.correct_answer || '（见解析）',
      variant_count: 1,
    })
    if (variants && variants.length > 0) {
      variantQuestion.value = { ...variants[0], question_type: qt }
    } else {
      errorMsg.value = '变式题生成失败，请稍后重试'
    }
  } catch (err) {
    errorMsg.value = err.message || '变式题生成失败'
  } finally {
    variantLoading.value = false
  }
}

// ---- 变式题判分（回写走 F1）----
function gradeVariant() {
  const q = variantQuestion.value
  if (!q || !variantAnswer.value.trim()) return
  const normalized = {
    question_type: q.question_type,
    options: q.options,
    correct_answer: q.correct_answer,
  }
  const isCorrect = gradeObjective(normalized, variantAnswer.value.trim())
  variantResult.value = {
    is_correct: isCorrect,
    correct_answer: q.correct_answer,
  }
  // 判分回写走 F1 事件总线
  try {
    profileBus.emit(EVT.LEARNING_EVENT, {
      topic: q.knowledge_point || recognizeResult.value?.knowledge_point,
      outcome: isCorrect ? 'correct' : 'incorrect',
      questionType: q.question_type,
      errorType: isCorrect ? undefined : q.question_type,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('[tutor-photo] variant grade writeback failed:', e)
  }
}

const canGrade = computed(() => {
  return variantQuestion.value && variantAnswer.value.trim().length > 0 && !variantResult.value
})
</script>

<template>
  <div class="tutor-photo-view">
    <div class="page-content">
      <div class="page-header">
        <div class="page-eyebrow"><span class="dot"></span><span>Photo Tutor · F2</span></div>
        <h1 class="page-title">拍题讲解</h1>
        <p class="page-subtitle">拍照识别 → 苏格拉底式分步讲解 → 知识点写回画像 → 同知识点变式题</p>
      </div>

      <div v-if="errorMsg" class="error-banner">
        <svg class="err-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>{{ errorMsg }}</span>
      </div>

      <!-- 上传区 -->
      <section class="upload-section" v-if="phase === 'idle' || phase === 'recognizing'">
        <div class="upload-card" :class="{ loading: recognizing }" @click="!recognizing && fileInput && fileInput.click()">
          <input ref="fileInput" type="file" accept="image/*" capture="environment" class="file-input" @change="onFileChange" />
          <div class="upload-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </div>
          <div class="upload-text">
            <div class="upload-title">{{ recognizing ? '识别中…' : '点击上传考题照片' }}</div>
            <div class="upload-hint">支持拍照或相册选择，自动压缩至 1MB 以内</div>
          </div>
          <div v-if="recognizing" class="spinner"></div>
        </div>
        <div v-if="previewUrl && recognizing" class="preview-wrap">
          <img :src="previewUrl" alt="题目预览" class="preview-img" />
        </div>
      </section>

      <!-- 识别结果 + 讲解 -->
      <section v-if="recognizeResult && recognizeResult.is_valid" class="result-section">
        <div class="recognize-card">
          <div class="rr-head">
            <AiGeneratedBadge />
            <span class="rr-kp">知识点：{{ recognizeResult.knowledge_point }}</span>
            <span class="rr-qt">题型：{{ recognizeResult.question_type || '—' }}</span>
          </div>
          <div class="rr-stem"><MarkdownRenderer :content="recognizeResult.question_stem || ''" /></div>
          <div v-if="recognizeResult.correct_answer" class="rr-ans">参考答案：<code>{{ recognizeResult.correct_answer }}</code></div>
        </div>

        <!-- 讲解区 -->
        <div class="explain-card">
          <div class="explain-head">
            <svg class="explain-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4 3 5v3h8v-3c1.5-1 3-2.5 3-5a7 7 0 0 0-7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>
            <span class="explain-title">{{ explaining ? '苏格拉底式讲解中…' : '苏格拉底式分步讲解' }}</span>
            <span v-if="firstTokenLatency !== null" class="latency">首 token {{ firstTokenLatency }}ms</span>
          </div>
          <div v-if="explaining && !explanation" class="explain-waiting">
            <div class="spinner-sm"></div><span>正在生成讲解…</span>
          </div>
          <MarkdownRenderer v-if="explanation" :content="explanation" />
          <div v-if="phase === 'explained'" class="explain-done">
            <span v-if="profileWritten" class="writeback-tag">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              已写回画像
            </span>
          </div>
        </div>

        <!-- 变式题 -->
        <div v-if="phase === 'explained'" class="variant-section">
          <button v-if="!variantQuestion && !variantLoading" class="variant-btn" @click="fetchVariant">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            练一道变式题
          </button>
          <div v-if="variantLoading" class="variant-loading"><div class="spinner-sm"></div><span>生成变式题中…</span></div>

          <div v-if="variantQuestion" class="variant-card">
            <div class="variant-head">
              <span class="variant-label">变式题</span>
              <span class="variant-kp">{{ variantQuestion.knowledge_point }}</span>
            </div>
            <div class="variant-stem"><MarkdownRenderer :content="variantQuestion.stem || ''" /></div>
            <div v-if="variantQuestion.options && variantQuestion.options.length" class="variant-options">
              <label v-for="(opt, i) in variantQuestion.options" :key="i" class="opt-item">
                <input type="radio" :value="opt.charAt(0)" v-model="variantAnswer" :disabled="!!variantResult" />
                <span>{{ opt }}</span>
              </label>
            </div>
            <div v-else class="variant-fill">
              <input type="text" v-model="variantAnswer" placeholder="输入你的答案" :disabled="!!variantResult" class="fill-input" />
            </div>
            <button v-if="canGrade" class="grade-btn" @click="gradeVariant">提交判分</button>
            <div v-if="variantResult" class="variant-result" :class="{ correct: variantResult.is_correct, wrong: !variantResult.is_correct }">
              <svg v-if="variantResult.is_correct" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              <span>{{ variantResult.is_correct ? '回答正确！' : '回答错误' }}</span>
              <span class="variant-correct-ans">正确答案：{{ variantResult.correct_answer }}</span>
            </div>
            <div v-if="variantQuestion.explanation && variantResult" class="variant-explain">
              <MarkdownRenderer :content="variantQuestion.explanation" />
            </div>
          </div>
        </div>

        <!-- 重新拍题 -->
        <button class="restart-btn" @click="resetResult(); phase='idle'; previewUrl=''">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          重新拍题
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.tutor-photo-view {
  min-height: 100vh;
  background: var(--color-bg-base);
  color: var(--color-fg-primary);
}
.page-content {
  max-width: 820px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4) var(--space-12);
}
.page-header { margin-bottom: var(--space-6); }
.page-eyebrow {
  display: flex; align-items: center; gap: var(--space-2);
  font-size: var(--text-caption); color: var(--color-fg-tertiary);
  letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: var(--space-2);
}
.page-eyebrow .dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--color-node-active);
}
.page-title { font-size: var(--text-section); font-weight: 700; margin: 0 0 var(--space-1); }
.page-subtitle { font-size: var(--text-body); color: var(--color-fg-secondary); margin: 0; }

.error-banner {
  display: flex; align-items: center; gap: var(--space-2);
  background: var(--color-error-bg); color: var(--color-error);
  padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
  margin-bottom: var(--space-4); font-size: var(--text-body);
}
.err-icon { width: 18px; height: 18px; flex-shrink: 0; }

.upload-section { margin-bottom: var(--space-6); }
.upload-card {
  display: flex; align-items: center; gap: var(--space-4);
  background: var(--color-bg-elevated); border: 1.5px dashed var(--color-border-default);
  border-radius: var(--radius-lg); padding: var(--space-8) var(--space-6);
  cursor: pointer; transition: border-color var(--duration-base), background var(--duration-base);
}
.upload-card:hover { border-color: var(--color-node-active); background: var(--color-success-bg); }
.upload-card.loading { cursor: wait; opacity: 0.7; }
.file-input { display: none; }
.upload-icon {
  width: 48px; height: 48px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-success-bg); color: var(--color-node-active);
  border-radius: var(--radius-md);
}
.upload-icon svg { width: 26px; height: 26px; }
.upload-title { font-size: var(--text-subtitle); font-weight: 600; }
.upload-hint { font-size: var(--text-caption); color: var(--color-fg-tertiary); margin-top: 2px; }

.preview-wrap { margin-top: var(--space-4); text-align: center; }
.preview-img { max-width: 100%; max-height: 320px; border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle); }

.result-section { display: flex; flex-direction: column; gap: var(--space-5); }
.recognize-card {
  background: var(--color-bg-elevated); border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg); padding: var(--space-5);
}
.rr-head {
  display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;
  margin-bottom: var(--space-3); font-size: var(--text-caption);
}
.rr-kp { color: var(--color-node-active); font-weight: 600; }
.rr-qt { color: var(--color-fg-tertiary); }
.rr-stem { font-size: var(--text-body); line-height: 1.7; }
.rr-ans { margin-top: var(--space-2); font-size: var(--text-caption); color: var(--color-fg-secondary); }
.rr-ans code { background: var(--color-bg-sunken); padding: 2px 6px; border-radius: var(--radius-xs); font-family: var(--font-mono); }

.explain-card {
  background: var(--color-bg-elevated); border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg); padding: var(--space-5);
}
.explain-head {
  display: flex; align-items: center; gap: var(--space-2);
  margin-bottom: var(--space-4); padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-border-subtle);
}
.explain-icon { width: 20px; height: 20px; color: var(--color-node-active); }
.explain-title { font-size: var(--text-subtitle); font-weight: 600; }
.latency { margin-left: auto; font-size: var(--text-meta); color: var(--color-fg-tertiary); }
.explain-waiting { display: flex; align-items: center; gap: var(--space-2); color: var(--color-fg-tertiary); font-size: var(--text-body); }
.explain-done { margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--color-border-subtle); }
.writeback-tag {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: var(--text-caption); color: var(--color-success);
  background: var(--color-success-bg); padding: 4px 10px; border-radius: var(--radius-full);
}
.writeback-tag svg { width: 14px; height: 14px; }

.variant-section { margin-top: var(--space-2); }
.variant-btn {
  display: inline-flex; align-items: center; gap: var(--space-2);
  background: var(--color-info-bg); color: var(--color-info);
  border: 1px solid transparent; padding: var(--space-3) var(--space-5);
  border-radius: var(--radius-md); font-size: var(--text-body); font-weight: 600;
  cursor: pointer; transition: background var(--duration-base);
}
.variant-btn:hover { background: var(--color-node-active); color: var(--color-bg-elevated); }
.variant-btn svg { width: 18px; height: 18px; }
.variant-loading { display: flex; align-items: center; gap: var(--space-2); color: var(--color-fg-tertiary); }

.variant-card {
  background: var(--color-bg-elevated); border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg); padding: var(--space-5); margin-top: var(--space-3);
}
.variant-head { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
.variant-label { font-size: var(--text-caption); font-weight: 700; color: var(--color-info); text-transform: uppercase; letter-spacing: 0.05em; }
.variant-kp { font-size: var(--text-caption); color: var(--color-fg-tertiary); }
.variant-stem { font-size: var(--text-body); line-height: 1.7; margin-bottom: var(--space-4); }
.variant-options { display: flex; flex-direction: column; gap: var(--space-2); }
.opt-item { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-body); cursor: pointer; padding: var(--space-2); border-radius: var(--radius-sm); }
.opt-item:hover { background: var(--color-bg-sunken); }
.variant-fill .fill-input {
  width: 100%; padding: var(--space-3); font-size: var(--text-body);
  border: 1px solid var(--color-border-default); border-radius: var(--radius-md);
  background: var(--color-bg-base); color: var(--color-fg-primary);
}
.grade-btn {
  margin-top: var(--space-4); background: var(--color-node-active); color: #fff;
  border: none; padding: var(--space-3) var(--space-5); border-radius: var(--radius-md);
  font-size: var(--text-body); font-weight: 600; cursor: pointer;
}
.grade-btn:hover { opacity: 0.9; }
.variant-result {
  display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
  margin-top: var(--space-4); padding: var(--space-3); border-radius: var(--radius-md); font-size: var(--text-body);
}
.variant-result.correct { background: var(--color-success-bg); color: var(--color-success); }
.variant-result.wrong { background: var(--color-error-bg); color: var(--color-error); }
.variant-result svg { width: 18px; height: 18px; }
.variant-correct-ans { margin-left: var(--space-2); font-size: var(--text-caption); }
.variant-explain { margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--color-border-subtle); font-size: var(--text-body); }

.restart-btn {
  display: inline-flex; align-items: center; gap: var(--space-2);
  background: transparent; color: var(--color-fg-secondary);
  border: 1px solid var(--color-border-default); padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md); font-size: var(--text-body); cursor: pointer;
  margin-top: var(--space-4);
}
.restart-btn:hover { border-color: var(--color-node-active); color: var(--color-node-active); }
.restart-btn svg { width: 16px; height: 16px; }

.spinner, .spinner-sm, .spinner-lg {
  border: 2px solid var(--color-border-subtle);
  border-top-color: var(--color-node-active);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.spinner { width: 22px; height: 22px; }
.spinner-sm { width: 16px; height: 16px; display: inline-block; }
.spinner-lg { width: 36px; height: 36px; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 768px) {
  .page-content { padding: var(--space-4) var(--space-3) var(--space-8); }
  .upload-card { padding: var(--space-5) var(--space-4); flex-direction: column; text-align: center; }
  .rr-head { font-size: var(--text-meta); }
}
</style>
