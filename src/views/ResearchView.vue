<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import ResearchCard from '@/components/ResearchCard.vue'
import { SEED_RESEARCH } from '@/data/seedDemo'

const router = useRouter()
const researchData = computed(() => SEED_RESEARCH)

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

      <section class="section">
        <div class="section-head">
          <span class="section-icon">◇</span>
          <span class="section-title">科研成长路线</span>
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
