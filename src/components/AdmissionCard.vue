<script setup>
import { computed } from 'vue'

const props = defineProps({
  recommendations: {
    type: Array,
    default: () => []
  }
})

// 梯度配置
const tierConfig = {
  reach: { label: '冲刺', en: 'Reach', color: '#ff6b6b', desc: '难度略高于当前水平' },
  match: { label: '匹配', en: 'Match', color: '#00d4aa', desc: '与当前水平契合' },
  safety: { label: '保底', en: 'Safety', color: '#4d9de0', desc: '录取把握较大' }
}

function getTier(tier) {
  return tierConfig[tier] || { label: tier || '推荐', en: '', color: '#7a8ba3', desc: '' }
}

// 字段 aliasing：v1 评审保命修复
// agent 实际输出：school / score_line / ratio / enrollment（数字字段强制来自本地数据）
// 旧 v1 代码误用了 name / rank_range / admission_rate / tags —— 全部空，导致卡片全是占位
const items = computed(() => {
  return (props.recommendations || []).map((u) => {
    const score = u.score_line ?? u.scoreLine
    const ratio = u.ratio ?? u.rank_range ?? u.rankRange
    const enrollment = u.enrollment ?? u.admission_rate ?? u.admissionRate
    const tags = Array.isArray(u.tags) ? u.tags : []
    return {
      school: u.school ?? u.name ?? '（未命名院校）',
      region: u.region ?? '',
      tier: u.tier,
      level: u.level,
      major: u.major,
      year: u.year,
      sourceUrl: u.source_url,
      reason: u.reason || '',
      // 每个 metric 单独判断是否存在 + 配套 label / unit
      metrics: [
        score != null
          ? { key: 'score_line', label: '分数线', value: score, unit: '分' }
          : null,
        ratio != null
          ? { key: 'ratio', label: '报录比', value: ratio, unit: ':1' }
          : null,
        enrollment != null
          ? { key: 'enrollment', label: '招生人数', value: enrollment, unit: '人' }
          : null
      ].filter(Boolean),
      tags
    }
  })
})
</script>

<template>
  <div class="admission-card">
    <div v-if="!items.length" class="empty-state">
      <span class="empty-icon">◯</span>
      <span class="empty-text">暂无推荐院校</span>
    </div>

    <div v-else class="uni-grid">
      <div
        v-for="(uni, idx) in items"
        :key="idx"
        class="uni-card"
        :style="{ '--tier-color': getTier(uni.tier).color }"
      >
        <!-- 头部：排名 + 梯度 -->
        <div class="card-top">
          <div class="rank-block">
            <span class="rank-label">RANK</span>
            <span class="rank-num">{{ idx + 1 }}</span>
          </div>
          <div class="tier-badge">
            <span class="tier-dot"></span>
            <span class="tier-label">{{ getTier(uni.tier).label }}</span>
            <span class="tier-en">{{ getTier(uni.tier).en }}</span>
          </div>
        </div>

        <!-- 院校名 -->
        <div class="uni-name-block">
          <div class="uni-name">{{ uni.school }}</div>
          <div v-if="uni.region" class="uni-region">
            <span class="region-node"></span>
            {{ uni.region }}
          </div>
        </div>

        <!-- 关键数字（铁律：只从 JSON 渲染）-->
        <div v-if="uni.metrics.length" class="metrics">
          <div v-for="m in uni.metrics" :key="m.key" class="metric">
            <div class="metric-label">{{ m.label }}</div>
            <div class="metric-value">
              <span class="num">{{ m.value }}</span>
              <span class="unit">{{ m.unit }}</span>
            </div>
          </div>
        </div>

        <!-- 推荐理由 -->
        <div v-if="uni.reason" class="reason">
          <span class="reason-icon">▸</span>
          <span class="reason-text">{{ uni.reason }}</span>
        </div>

        <!-- 标签（agent 暂未输出 tags，v-if 防御） -->
        <div v-if="uni.tags.length" class="tags">
          <span v-for="(tag, ti) in uni.tags" :key="ti" class="tag">{{ tag }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admission-card {
  background: var(--color-bg-sunken);
  border-radius: var(--radius-lg);
  padding: 16px;
}

/* 空态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px;
  color: var(--color-fg-tertiary);
}

.empty-icon {
  font-size: 24px;
  opacity: 0.4;
}

.empty-text {
  font-size: 13px;
}

/* === 院校网格 === */
.uni-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.uni-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  padding: 16px;
  position: relative;
  overflow: hidden;
  transition: all var(--duration-base) var(--ease-out);
}

.uni-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--tier-color);
}

.uni-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: color-mix(in srgb, var(--tier-color) 40%, var(--color-border-subtle));
}

/* === 顶部 === */
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.rank-block {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.rank-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--color-fg-tertiary);
  letter-spacing: 1px;
}

.rank-num {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
  color: var(--color-ink-900);
}

.tier-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  background: color-mix(in srgb, var(--tier-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--tier-color) 30%, transparent);
  border-radius: var(--radius-full);
}

.tier-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tier-color);
}

.tier-label {
  font-family: var(--font-serif);
  font-size: 11px;
  font-weight: 600;
  color: var(--tier-color);
}

.tier-en {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--color-fg-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* === 院校名 === */
.uni-name-block {
  margin-bottom: 12px;
}

.uni-name {
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 700;
  color: var(--color-ink-900);
  line-height: 1.3;
  margin-bottom: 4px;
}

.uni-region {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-secondary);
}

.region-node {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--color-ink-300);
}

/* === 数字指标 === */
.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  gap: 8px;
  padding: 12px 0;
  border-top: 1px dashed var(--color-border-subtle);
  border-bottom: 1px dashed var(--color-border-subtle);
  margin-bottom: 12px;
}

.metric {
  text-align: center;
}

.metric-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--color-fg-tertiary);
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.metric-value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 2px;
}

.metric-value .num {
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 700;
  color: var(--color-ink-900);
}

.metric-value .unit {
  font-size: 10px;
  color: var(--color-fg-tertiary);
}

/* === 推荐理由 === */
.reason {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  color: var(--color-ink-700);
  line-height: 1.6;
  margin-bottom: 10px;
}

.reason-icon {
  color: var(--tier-color);
  font-family: var(--font-mono);
  flex-shrink: 0;
  margin-top: 2px;
}

/* === 标签 === */
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  padding: 2px 8px;
  background: var(--color-bg-sunken);
  border-radius: var(--radius-xs);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-ink-500);
  letter-spacing: 0.3px;
}
</style>
