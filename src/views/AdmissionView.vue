<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import AdmissionCard from '@/components/AdmissionCard.vue'
import { SEED_ADMISSION } from '@/data/seedDemo'
import { useProfileStore } from '@/stores/profile'
import { useAuthStore } from '@/stores/auth'
import { admissionAgent } from '@/core/agents/admission'
import { loadProfile } from '@/core/profileLoader'
import AiGeneratedBadge from '@/components/AiGeneratedBadge.vue'

const router = useRouter()
const profileStore = useProfileStore()
const authStore = useAuthStore()

const loading = ref(false)
const error = ref('')
const aiRecommendations = ref([])   // admissionAgent 返回的真实推荐
const aiContent = ref('')           // Agent 原始 Markdown（备选展示）

// 是否有真实画像数据供择校推荐使用
// 游客 → 视为有数据（显示种子 demo）；登录用户无画像 → 空状态引导去填向导
const hasRealData = computed(() => {
  if (authStore.isGuest) return true
  const p = profileStore.profile || {}
  if (p.target_school || p.target_major) return true
  if (p.last_diagnosis_score !== null && p.last_diagnosis_score !== undefined) return true
  if (p.ability_stars && Object.keys(p.ability_stars).length > 0) return true
  return false
})

// 游客：种子数据；登录用户有画像但尚未生成 → 仍展示种子作为 demo 底线
const recommendations = computed(() => {
  if (aiRecommendations.value.length) return aiRecommendations.value
  return SEED_ADMISSION
})

// 是否展示 AI 生成标记（有真实 Agent 结果时）
const showAiBadge = computed(() => aiRecommendations.value.length > 0)

function buildQuery() {
  const p = profileStore.profile || {}
  const stars = p.ability_stars || {}
  const abilitySummary = Object.keys(stars).length
    ? Object.entries(stars).map(([t, s]) => `${t}(${s}星)`).join('、')
    : '暂无'
  const weak = (p.weak_topics || []).join('、') || '暂无'
  const score = p.last_diagnosis_score !== null && p.last_diagnosis_score !== undefined
    ? p.last_diagnosis_score
    : '尚未诊断'
  return [
    `我是一名微电子/集成电路方向考研学生。`,
    `目标专业：${p.target_major || p.major || '集成电路工程'}。`,
    `意向院校方向：${p.target_school || '待定（请结合我的层次推荐）'}。`,
    `最近诊断分数：${score}。`,
    `能力星级：${abilitySummary}。`,
    `薄弱知识点：${weak}。`,
    `请结合我的画像，从院校库中推荐冲刺 / 匹配 / 保底三梯度院校，并给出推荐理由。`
  ].join('')
}

async function generate() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    // admissionAgent(userInput, profile, ctx) —— 与聊天自动路由同一链路
    const profile = loadProfile()
    const result = await admissionAgent(buildQuery(), profile, {})
    const recs = result?.structured?.recommendations || []
    if (recs.length) {
      aiRecommendations.value = recs
    } else {
      // Agent 未匹配到院校库数据 → 展示原始内容作为兜底
      aiContent.value = result?.content || ''
      if (!aiContent.value) error.value = '未匹配到合适的院校，请先完善画像或稍后重试。'
    }
  } catch (e) {
    error.value = e?.message || '择校推荐服务暂不可用，请稍后重试。'
  } finally {
    loading.value = false
  }
}

function goChat() {
  router.push({ path: '/chat', query: { agent: 'admission' } })
}

function goWizard() {
  router.push({ path: '/profile/wizard' })
}
</script>

<template>
  <div class="admission-view">
    <div class="page-content">
      <div class="page-header">
        <div class="page-eyebrow"><span class="dot"></span><span>Admission Agent</span></div>
        <h1 class="page-title">择校推荐</h1>
        <p class="page-subtitle">数据驱动 · 冲刺/匹配/保底三梯度 · 录取概率评估</p>
      </div>

      <!-- 登录用户无画像：空状态引导去填向导 -->
      <section v-if="!hasRealData && !loading" class="empty-state-card">
        <div class="empty-icon">◎</div>
        <h2 class="empty-title">尚无画像数据</h2>
        <p class="empty-desc">择校推荐需要你的目标院校 / 专业、诊断分数等画像信息。先完成画像向导，即可获得个性化三梯度推荐。</p>
        <button class="empty-btn" @click="goWizard">去填写画像向导</button>
      </section>

      <template v-else>
        <!-- 生成按钮（登录用户有画像时可触发真实 Agent） -->
        <section v-if="!authStore.isGuest" class="action-section">
          <button class="gen-btn" :disabled="loading" @click="generate">
            {{ loading ? '正在匹配院校…' : (showAiBadge ? '重新生成推荐' : '基于我的画像生成推荐') }}
          </button>
          <div v-if="error" class="error-msg">{{ error }}</div>
        </section>

        <section class="section">
          <div class="section-head">
            <span class="section-icon">◎</span>
            <span class="section-title">推荐院校（三梯度）</span>
            <span class="section-en">Recommended Schools</span>
            <AiGeneratedBadge v-if="showAiBadge" />
            <span v-else class="seed-tag">Demo</span>
          </div>
          <AdmissionCard :recommendations="recommendations" />
        </section>

        <!-- Agent 原始内容兜底展示 -->
        <section v-if="aiContent" class="report-section">
          <div class="section-head">
            <span class="section-icon">◎</span>
            <span class="section-title">推荐说明</span>
            <span class="section-en">Agent Report</span>
            <AiGeneratedBadge />
          </div>
          <p class="report-text">{{ aiContent }}</p>
        </section>

        <section class="cta-section">
          <div class="cta-text">
            <span class="cta-title">想了解某所院校的详细招生信息？</span>
            <span class="cta-sub">进入与 Admission Agent 的对话，获取历年分数线趋势与备考建议</span>
          </div>
          <button class="cta-btn" @click="goChat">
            <span>与择校导师对话</span>
            <span class="cta-arrow">→</span>
          </button>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.admission-view {
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
.page-eyebrow .dot { width: 6px; height: 6px; border-radius: 50%; background: #ff6b6b; }
.page-title {
  font-family: var(--font-serif); font-size: 28px; font-weight: 700;
  color: var(--color-ink-900); margin: 0;
}
.page-subtitle { font-size: 14px; color: var(--color-fg-secondary); margin: 6px 0 0; }

.action-section { margin-bottom: 20px; }
.gen-btn {
  padding: 11px 28px; background: #ff6b6b; color: #fff; border: none;
  border-radius: var(--radius-full); font-family: var(--font-serif);
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;
}
.gen-btn:hover:not(:disabled) { background: #e85555; }
.gen-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.error-msg { margin-top: 10px; padding: 10px 14px; background: rgba(255,107,107,0.08); border-radius: var(--radius-sm); color: #ff6b6b; font-size: 13px; }

.section { margin-bottom: 32px; }
.section-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.section-icon { color: #ff6b6b; font-size: 14px; }
.section-title { font-family: var(--font-serif); font-size: 15px; font-weight: 700; color: var(--color-ink-900); }
.section-en { font-family: var(--font-mono); font-size: 10px; color: var(--color-fg-tertiary); text-transform: uppercase; letter-spacing: 1px; }
.seed-tag { display: inline-block; padding: 1px 8px; background: color-mix(in srgb, #9b59b6 15%, transparent); color: #9b59b6; border-radius: var(--radius-full); font-size: 10px; font-weight: 600; font-family: var(--font-mono); }

.report-section { margin-bottom: 28px; }
.report-text { font-size: 14px; color: var(--color-ink-700); line-height: 1.7; white-space: pre-wrap; }

/* 空状态卡片 */
.empty-state-card {
  background: var(--color-bg-elevated); border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg); padding: 48px 32px; text-align: center;
  box-shadow: var(--shadow-sm);
}
.empty-icon { font-size: 40px; color: #ff6b6b; margin-bottom: 12px; }
.empty-title { font-family: var(--font-serif); font-size: 20px; font-weight: 700; color: var(--color-ink-900); margin: 0 0 8px; }
.empty-desc { font-size: 14px; color: var(--color-fg-secondary); line-height: 1.7; margin: 0 auto 20px; max-width: 460px; }
.empty-btn {
  padding: 11px 28px; background: #ff6b6b; color: #fff; border: none;
  border-radius: var(--radius-full); font-family: var(--font-serif);
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;
}
.empty-btn:hover { background: #e85555; }

.cta-section {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 20px 24px;
  background: color-mix(in srgb, #ff6b6b 6%, var(--color-bg-elevated));
  border: 1px solid color-mix(in srgb, #ff6b6b 30%, transparent);
  border-radius: var(--radius-lg);
}
.cta-text { display: flex; flex-direction: column; gap: 4px; }
.cta-title { font-family: var(--font-serif); font-size: 15px; font-weight: 600; color: var(--color-ink-900); }
.cta-sub { font-size: 12px; color: var(--color-fg-secondary); }
.cta-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 20px; background: #ff6b6b; color: #fff; border: none;
  border-radius: var(--radius-full); font-family: var(--font-serif);
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; white-space: nowrap;
}
.cta-btn:hover { background: #e85555; transform: translateX(2px); }
.cta-arrow { font-size: 16px; }
@media (max-width: 768px) {
  .cta-section { flex-direction: column; align-items: flex-start; }
}
</style>
