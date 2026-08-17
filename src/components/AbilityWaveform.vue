<script setup>
import { computed, ref, onMounted } from 'vue'
import { useMasteryData } from '@/composables/useMasteryData'

const mastery = useMasteryData()
// 顶层解构使模板自动解包 ref（方案模板引用 mastery.weakStarCount 不会自动解包）
const { strongCount, weakStarCount } = mastery

// 5 个能力维度 — 关键词同时覆盖「向导自评知识点」和「诊断系统知识点」两套命名
const ABILITY_DIMS = [
  {
    key: 'concept', label: '概念理解', en: 'CONCEPT', color: '#00d4aa',
    keywords: ['半导体物理', '固体物理', '半导体工艺', '光学', '能带', '载流子', '杂质', '费米', '超导', 'BCS'],
  },
  {
    key: 'derive', label: '数学推导', en: 'DERIVE', color: '#ffd166',
    keywords: ['量子力学', '信号与系统', '晶体学', '倒格', '布里渊', '数学', '晶格'],
  },
  {
    key: 'circuit', label: '电路分析', en: 'CIRCUIT', color: '#4d9de0',
    keywords: ['电路分析', 'CMOS', 'MOSFET', 'JFET', '放大器', '运算放大', '锁相环', '数字逻辑', '电流镜', '反相器', '时序', '锁存', '触发', 'PN结原理'],
  },
  {
    key: 'apply', label: '综合应用', en: 'APPLY', color: '#ff6b6b',
    keywords: ['Verilog', '集成电路', '低功耗', 'FPGA', '数字IC', '集成电路设计'],
  },
  {
    key: 'intuition', label: '物理直觉', en: 'INTUIT', color: '#a78bfa',
    keywords: ['PN结', '微电子器件', '器件', '阈值', '耗尽', '击穿', 'MOS结构', 'I-V'],
  },
]

const dimScores = computed(() => {
  const stars = mastery.abilityStars.value || []
  if (stars.length === 0) return ABILITY_DIMS.map(() => 0)

  return ABILITY_DIMS.map(dim => {
    const matched = stars.filter(s =>
      dim.keywords.some(kw => s.topic?.includes(kw))
    )
    if (matched.length === 0) {
      // 无匹配时用全局均值填充，避免通道全空
      const avg = stars.reduce((sum, s) => sum + (s.score || 0), 0) / stars.length
      return Math.round(avg)
    }
    return Math.round(matched.reduce((sum, s) => sum + (s.score || 0), 0) / matched.length)
  })
})

const avgScore = computed(() => {
  const scores = dimScores.value
  if (!scores.some(s => s > 0)) return 0
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
})

function buildWavePath(value, seed) {
  if (value === 0) return ''
  const W = 200, H = 36, baseline = H / 2
  const amplitude = (value / 100) * (H * 0.42)
  const points = []
  for (let x = 0; x <= W; x += 2) {
    const noise =
      Math.sin(x * 0.08 + seed) * 2.5 +
      Math.sin(x * 0.18 + seed * 2) * 1.8 +
      Math.sin(x * 0.03 + seed * 3) * 3
    const y = baseline - amplitude + noise * (1 - value / 120)
    points.push(`${x},${y.toFixed(1)}`)
  }
  return 'M' + points.join(' L')
}

const waves = computed(() =>
  dimScores.value.map((score, i) => ({
    ...ABILITY_DIMS[i],
    score,
    path: buildWavePath(score, i * 1.7),
  }))
)

const scanX = ref(-20)
const animated = ref(false)
onMounted(() => {
  function scan() {
    scanX.value += 0.8
    if (scanX.value > 220) scanX.value = -20
    requestAnimationFrame(scan)
  }
  scan()
  setTimeout(() => { animated.value = true }, 200)
})
</script>

<template>
  <div class="ability-waveform">
    <div class="aw-header">
      <span class="aw-title">能力波形</span>
      <span class="aw-en">ABILITY WAVEFORM</span>
    </div>

    <div class="aw-screen">
      <div class="aw-grid"></div>
      <div class="aw-scanline" :style="{ left: scanX + 'px' }"></div>

      <div class="aw-channels">
        <div v-for="(w, i) in waves" :key="w.key" class="aw-channel">
          <span class="aw-ch-label" :style="{ color: w.score > 0 ? w.color : '#445566' }">{{ w.en }}</span>
          <svg class="aw-ch-svg" viewBox="0 0 200 36" preserveAspectRatio="none">
            <path
              v-if="w.path"
              :d="w.path"
              fill="none"
              :stroke="w.color"
              stroke-width="1.2"
              stroke-linecap="round"
              :class="{ 'aw-draw': animated }"
              :style="{ animationDelay: (i * 0.15) + 's', filter: `drop-shadow(0 0 3px ${w.color}88)` }"
            />
            <line x1="0" y1="18" x2="200" y2="18" stroke="rgba(100,200,150,0.06)" stroke-width="0.5"/>
          </svg>
          <span class="aw-ch-value" :style="{ color: w.score > 0 ? w.color : '#445566' }">{{ w.score || '––' }}</span>
        </div>
      </div>

      <div class="aw-readout">
        <div class="aw-stat">
          <span class="aw-stat-val" :style="{ color: avgScore > 0 ? '#00d4aa' : '#445566' }">{{ avgScore || '––' }}</span>
          <span class="aw-stat-label">AVG</span>
        </div>
        <div class="aw-stat">
          <span class="aw-stat-val" style="color:#ff6b6b">{{ weakStarCount ?? 0 }}</span>
          <span class="aw-stat-label">WEAK</span>
        </div>
        <div class="aw-stat">
          <span class="aw-stat-val" style="color:#00d4aa">{{ strongCount ?? 0 }}</span>
          <span class="aw-stat-label">STRONG</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ability-waveform {
  background: var(--bg-surface, var(--color-bg-elevated, #fff));
  border-radius: var(--radius-lg, 16px);
  padding: 16px 18px;
  box-shadow: var(--shadow-card, 0 0 0 1px rgba(0,0,0,0.06), 0 8px 32px rgba(0,0,0,0.06));
  margin-top: var(--space-4, 16px);
}

.aw-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}
.aw-title {
  font-size: var(--text-lg, 18px);
  font-weight: 600;
  color: var(--text-primary, var(--color-ink-900, #1a1a2e));
}
.aw-en {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  color: var(--text-muted, #94a3b8);
  letter-spacing: 1.5px;
}

.aw-screen {
  position: relative;
  background: #0a0f0d;
  border-radius: 10px;
  padding: 12px 14px 10px;
  overflow: hidden;
  border: 1px solid rgba(0,212,170,0.1);
}

.aw-grid {
  position: absolute;
  inset: 0;
  background-image:
    repeating-linear-gradient(0deg, transparent, transparent 11px, rgba(0,255,100,0.025) 12px),
    repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(0,255,100,0.025) 20px);
  pointer-events: none;
}

.aw-scanline {
  position: absolute;
  top: 0; bottom: 0;
  width: 2px;
  background: linear-gradient(180deg, transparent, rgba(0,255,150,0.15), transparent);
  pointer-events: none;
}

.aw-channels {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.aw-channel { display: flex; align-items: center; gap: 8px; }

.aw-ch-label {
  font-family: var(--font-mono, monospace);
  font-size: 8px;
  letter-spacing: 0.5px;
  width: 52px;
  text-align: right;
  flex-shrink: 0;
}

.aw-ch-svg { flex: 1; height: 30px; }

.aw-ch-value {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  font-weight: 700;
  width: 24px;
  text-align: right;
  flex-shrink: 0;
}

.aw-draw {
  stroke-dasharray: 500;
  stroke-dashoffset: 500;
  animation: aw-draw 1.5s ease-out forwards;
}
@keyframes aw-draw { to { stroke-dashoffset: 0; } }

.aw-readout {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-around;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(0,255,100,0.08);
}

.aw-stat { text-align: center; }
.aw-stat-val {
  font-family: var(--font-mono, monospace);
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
}
.aw-stat-label {
  display: block;
  font-family: var(--font-mono, monospace);
  font-size: 8px;
  color: rgba(140,180,160,0.5);
  letter-spacing: 1px;
  margin-top: 3px;
}
</style>
