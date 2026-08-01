<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AdmissionCard from '@/components/AdmissionCard.vue'
import { SEED_ADMISSION } from '@/data/seedDemo'

const router = useRouter()
const recommendations = computed(() => SEED_ADMISSION)

function goChat() {
  router.push({ path: '/chat', query: { agent: 'admission' } })
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

      <section class="section">
        <div class="section-head">
          <span class="section-icon">◎</span>
          <span class="section-title">推荐院校（三梯度）</span>
          <span class="section-en">Recommended Schools</span>
        </div>
        <AdmissionCard :recommendations="recommendations" />
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
.section { margin-bottom: 32px; }
.section-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 16px; }
.section-icon { color: #ff6b6b; font-size: 14px; }
.section-title { font-family: var(--font-serif); font-size: 15px; font-weight: 700; color: var(--color-ink-900); }
.section-en { font-family: var(--font-mono); font-size: 10px; color: var(--color-fg-tertiary); text-transform: uppercase; letter-spacing: 1px; }
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
