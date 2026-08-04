<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProfileStore } from '@/stores/profile'
import { usePlanStore } from '@/stores/plan'
import { useResearchStore } from '@/stores/research'
import ResearchCard from '@/components/ResearchCard.vue'
import { SEED_RESEARCH } from '@/data/seedDemo'

const router = useRouter()
const profileStore = useProfileStore()
const planStore = usePlanStore()
const researchStore = useResearchStore()

const loading = computed(() => researchStore.loading)
const error = computed(() => researchStore.error)
const hasApiResult = computed(() => researchStore.hasResult)

// API 结果优先，种子 fallback
const researchData = computed(() => {
  if (hasApiResult.value && researchStore.structured) {
    return researchStore.structured
  }
  return SEED_RESEARCH
})

// 发起科研路线生成
async function generateResearch() {
  const profile = profileStore.profile || {}
  // 从 planStore 获取规划结果作为 research agent 输入
  const planResult = planStore.lastPlan?.content || planStore.current?.raw_plan || ''
  try {
    await researchStore.runResearch({
      student_name: profile.name || '',
      target_major: profile.target_major || profile.major || '',
      target_direction: profile.target_direction || SEED_RESEARCH.direction || '',
      current_stage: profile.grade || profile.year || '本科',
      plan_result: planResult
    })
  } catch {
    // error 已在 store 中设置
  }
}

function goChat() {
  router.push({ path: '/chat', query: { agent: 'research' } })
}
</script>

<template>
  <div class="research-view">
    <div class="page-content">
      <div class="page-header">
        <div class="page-eyebrow"><span class="dot"></span><span>Research Agent</span></div>
        <h1 class="page-title">科研探索</h1>
        <p class="page-subtitle">本科→研究生成长路线 · 推荐论文 · 技术栈规划</p>
      </div>

      <!-- 生成入口 -->
      <section class="generate-section">
        <button
          class="generate-btn"
          :disabled="loading"
          @click="generateResearch"
        >
          <span v-if="loading" class="generate-spinner"></span>
          <span>{{ loading ? 'AI 生成科研路线中…' : hasApiResult ? '重新生成科研路线' : '生成个性化科研路线' }}</span>
        </button>
        <span class="generate-hint" v-if="!hasApiResult && !loading">
          基于你的学习画像 + 规划计划，由 AI 生成科研成长路线、推荐论文与技术栈
        </span>
        <span class="generate-hint" v-else-if="hasApiResult">
          已接入真实 AI · 5 字段结构化输出（roadmap/papers/tech_stack/labs/summary）
        </span>
        <div v-if="error" class="generate-error">
          科研路线生成失败：{{ error }}
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <span class="section-icon">◇</span>
          <span class="section-title">科研成长路线 <span v-if="hasApiResult" class="api-badge">AI</span></span>
          <span class="section-en">Research Roadmap</span>
        </div>
        <ResearchCard :data="researchData" />
      </section>

      <section class="cta-section">
        <div class="cta-text">
          <span class="cta-title">想细化某个阶段的科研计划？</span>
          <span class="cta-sub">进入与 Research Agent 的对话，获取论文阅读顺序与项目落地建议</span>
        </div>
        <button class="cta-btn" @click="goChat">
          <span>与科研导师对话</span>
          <span class="cta-arrow">→</span>
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.research-view {
  min-height: calc(100vh - 72px);
  background: var(--color-bg-base);
  padding: 32px 24px 64px;
}
.page-content { max-width: 880px; margin: 0 auto; }
.page-header { margin-bottom: 28px; }
.page-eyebrow {
  display: flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 11px;
  color: var(--color-fg-tertiary); letter-spacing: 1px; text-transform: uppercase;
  margin-bottom: 8px;
}
.page-eyebrow .dot { width: 6px; height: 6px; border-radius: 50%; background: #e67e22; }
.page-title {
  font-family: var(--font-serif); font-size: 28px; font-weight: 700;
  color: var(--color-ink-900); margin: 0;
}
.page-subtitle { font-size: 14px; color: var(--color-fg-secondary); margin: 6px 0 0; }
.section { margin-bottom: 32px; }
.section-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 16px; }
.section-icon { color: #e67e22; font-size: 14px; }
.section-title { font-family: var(--font-serif); font-size: 15px; font-weight: 700; color: var(--color-ink-900); }
.section-en { font-family: var(--font-mono); font-size: 10px; color: var(--color-fg-tertiary); text-transform: uppercase; letter-spacing: 1px; }

/* === 生成入口 === */
.generate-section {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 28px;
  padding: 16px 20px;
  background: color-mix(in srgb, #e67e22 5%, var(--color-bg-elevated));
  border: 1px dashed color-mix(in srgb, #e67e22 30%, transparent);
  border-radius: var(--radius-lg);
}

.generate-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  background: #e67e22;
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
  background: #c96d1c;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px color-mix(in srgb, #e67e22 30%, transparent);
}

.generate-btn:disabled { opacity: 0.7; cursor: not-allowed; }

.generate-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.generate-hint { font-size: 12px; color: var(--color-fg-tertiary); }

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
  margin-left: 4px;
  background: linear-gradient(135deg, #e67e22, #f39c12);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  border-radius: var(--radius-full);
  letter-spacing: 0.5px;
  vertical-align: middle;
}
.cta-section {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 20px 24px;
  background: color-mix(in srgb, #e67e22 6%, var(--color-bg-elevated));
  border: 1px solid color-mix(in srgb, #e67e22 30%, transparent);
  border-radius: var(--radius-lg);
}
.cta-text { display: flex; flex-direction: column; gap: 4px; }
.cta-title { font-family: var(--font-serif); font-size: 15px; font-weight: 600; color: var(--color-ink-900); }
.cta-sub { font-size: 12px; color: var(--color-fg-secondary); }
.cta-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 20px; background: #e67e22; color: #fff; border: none;
  border-radius: var(--radius-full); font-family: var(--font-serif);
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; white-space: nowrap;
}
.cta-btn:hover { background: #c96d1c; transform: translateX(2px); }
.cta-arrow { font-size: 16px; }
@media (max-width: 768px) {
  .cta-section { flex-direction: column; align-items: flex-start; }
}
</style>
