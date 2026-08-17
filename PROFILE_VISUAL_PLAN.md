# 学生画像页集成晶圆穹顶 + 能力波形 — 完整实现方案

> 目标页面：`src/views/ProfileView.vue`（学生画像页，侧边栏「学生画像」入口）
>
> 效果：将晶圆地图与 Dome Gallery 3D 穹顶效果融合，作为画像页右列主视觉卡片；能力波形放在左列个人信息与 AI 评价之间。

---

## 一、布局结构（改后）

```
┌──────────────────────────────────────────────────────┐
│  Student Profile · AI Understanding        [编辑画像] │
├────────────┬─────────────────────────────────────────┤
│ 信息卡      │  知识晶圆卡片（新）                       │
│ (头像/院校  │  ┌─────────────────────────────────┐    │
│  /阶段/风格 │  │ 知识晶圆 · KNOWLEDGE WAFER  图例  │    │
│  /倒计时)  │  │                                 │    │
│            │  │      3D 穹顶晶粒（可拖拽旋转）     │    │
│ 能力波形卡  │  │      绿=掌握 黄=学习中 红=薄弱    │    │
│ （新）     │  │      点击晶粒→跳转练习题           │    │
│            │  └─────────────────────────────────┘    │
│ AI 评价卡  │  知识图谱路径卡（保留不动）                │
│ (优势/薄弱) │  成长时间线卡（保留不动）                  │
└────────────┴─────────────────────────────────────────┘
```

- 左列宽度保持 320px，右列 1fr
- 移除当前页面的 `<KnowledgeGraph>` 全屏背景（穹顶在卡片内自带深色视口，不需要全屏背景）
- 信息卡、AI 评价卡、知识路径卡、时间线卡**全部保留不动**

---

## 二、文件改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/WaferDome.vue` | **覆盖重写** | 从全屏背景改为卡片内嵌组件，加标题栏/图例/点击事件 |
| `src/components/AbilityWaveform.vue` | **覆盖重写** | 宽度 100% 自适应，维度映射覆盖向导+诊断两套知识点命名 |
| `src/views/ProfileView.vue` | **修改 3 处** | 见下方第四节 |

---

## 三、组件完整代码

### 3.1 `src/components/WaferDome.vue`（覆盖重写）

```vue
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMasteryData } from '@/composables/useMasteryData'

const emit = defineEmits(['tile-click'])
const router = useRouter()
const mastery = useMasteryData()

// ===== 穹顶参数 =====
const RADIUS = 260
const COLS = 20
const ROWS = 8
const AUTO_SPEED = 0.05

const rotX = ref(-12)
const rotY = ref(0)
const dragging = ref(false)
const hoveredTile = ref(null)
let startX = 0, startY = 0, startRotX = 0, startRotY = 0
let velX = 0, velY = 0
let rafId = null, autoRaf = null

// ===== 生成穹顶晶粒 =====
const tiles = computed(() => {
  const stars = mastery.abilityStars.value || []
  const result = []
  let idx = 0

  for (let row = 0; row < ROWS; row++) {
    const phi = (row / ROWS) * Math.PI * 0.48
    const ringRadius = Math.sin(phi) * RADIUS
    const y = -Math.cos(phi) * RADIUS * 0.55
    const colsInRing = Math.max(6, Math.round(COLS * Math.sin(phi) * 1.1))

    for (let col = 0; col < colsInRing; col++) {
      const theta = (col / colsInRing) * Math.PI * 2 + (row % 2) * 0.2
      const x = Math.sin(theta) * ringRadius
      const z = Math.cos(theta) * ringRadius
      if (z < -RADIUS * 0.35) continue

      const star = stars.length > 0
        ? (stars[idx % stars.length] || { topic: '', score: 0, type: 'empty' })
        : { topic: '', score: 0, type: 'empty' }
      idx++

      const sizeScale = 0.5 + (1 - row / ROWS) * 0.5
      const w = 30 * sizeScale
      const h = 20 * sizeScale

      result.push({ x, y, z, w, h, ...star, key: `${row}-${col}` })
    }
  }
  return result
})

const stats = computed(() => ({
  total: mastery.abilityStars.value?.length || 0,
  strong: mastery.strongCount.value,
  weak: mastery.weakStarCount.value,
  developing: mastery.developingCount.value,
}))

function getColor(type) {
  switch (type) {
    case 'strength':   return { border: 'rgba(0,212,170,0.75)', bg: 'rgba(0,212,170,0.13)', glow: 'rgba(0,212,170,0.45)' }
    case 'weak':       return { border: 'rgba(255,107,107,0.75)', bg: 'rgba(255,107,107,0.13)', glow: 'rgba(255,107,107,0.45)' }
    case 'developing': return { border: 'rgba(255,209,102,0.6)',  bg: 'rgba(255,209,102,0.08)', glow: 'rgba(255,209,102,0.3)' }
    default:           return { border: 'rgba(100,130,180,0.25)', bg: 'rgba(100,130,180,0.04)', glow: 'transparent' }
  }
}

function label(topic) {
  if (!topic) return ''
  return topic.length > 5 ? topic.slice(0, 4) + '..' : topic
}

function onTileClick(tile) {
  if (!tile.topic) return
  emit('tile-click', tile.topic)
  // 默认跳转练习题并带上知识点筛选
  router.push({ path: '/practice', query: { topic: tile.topic } })
}

// ===== 拖拽 + 惯性 =====
function onPointerDown(e) {
  dragging.value = true
  startX = e.clientX; startY = e.clientY
  startRotX = rotX.value; startRotY = rotY.value
  velX = 0; velY = 0
  e.currentTarget.setPointerCapture(e.pointerId)
}
function onPointerMove(e) {
  if (!dragging.value) return
  const dx = e.clientX - startX, dy = e.clientY - startY
  rotY.value = startRotY + dx * 0.3
  rotX.value = Math.max(-40, Math.min(15, startRotX - dy * 0.2))
  velX = dy * 0.015; velY = dx * 0.015
}
function onPointerUp() {
  dragging.value = false
  inertia()
}
function inertia() {
  if (Math.abs(velX) < 0.005 && Math.abs(velY) < 0.005) return
  velX *= 0.94; velY *= 0.94
  rotX.value = Math.max(-40, Math.min(15, rotX.value - velX))
  rotY.value += velY
  rafId = requestAnimationFrame(inertia)
}
function autoRotate() {
  if (!dragging.value && Math.abs(velX) < 0.01 && Math.abs(velY) < 0.01) {
    rotY.value += AUTO_SPEED * 0.12
  }
  autoRaf = requestAnimationFrame(autoRotate)
}

onMounted(autoRotate)
onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  if (autoRaf) cancelAnimationFrame(autoRaf)
})
</script>

<template>
  <div class="wafer-card">
    <!-- 标题栏 -->
    <div class="wafer-header">
      <div class="wafer-title-group">
        <span class="wafer-title">知识晶圆</span>
        <span class="wafer-en">KNOWLEDGE WAFER</span>
      </div>
      <div class="wafer-legend">
        <span class="legend-item"><i class="dot dot-green"></i>掌握 {{ stats.strong }}</span>
        <span class="legend-item"><i class="dot dot-yellow"></i>学习中 {{ stats.developing }}</span>
        <span class="legend-item"><i class="dot dot-red"></i>薄弱 {{ stats.weak }}</span>
      </div>
    </div>

    <!-- 穹顶视口 -->
    <div
      class="wafer-viewport"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div class="wafer-glow"></div>
      <div class="wafer-stage">
        <div class="wafer-sphere" :style="{ transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)` }">
          <div
            v-for="tile in tiles"
            :key="tile.key"
            class="wafer-tile"
            :class="{ 'is-empty': !tile.topic }"
            :style="{
              transform: `translate3d(${tile.x}px, ${tile.y}px, ${tile.z}px)`,
              width: tile.w + 'px', height: tile.h + 'px',
              borderColor: getColor(tile.type).border,
              background: getColor(tile.type).bg,
              boxShadow: `0 0 8px ${getColor(tile.type).glow}`,
              marginLeft: -tile.w / 2 + 'px', marginTop: -tile.h / 2 + 'px',
            }"
            @click.stop="onTileClick(tile)"
            @mouseenter="hoveredTile = tile"
            @mouseleave="hoveredTile = null"
          >
            <span class="tile-label">{{ label(tile.topic) }}</span>
          </div>
        </div>
      </div>
      <div class="wafer-base"></div>

      <!-- hover tooltip -->
      <div v-if="hoveredTile && hoveredTile.topic" class="wafer-tooltip">
        <strong>{{ hoveredTile.topic }}</strong>
        <span>{{ hoveredTile.score }}分 · {{ hoveredTile.type === 'strength' ? '已掌握' : hoveredTile.type === 'weak' ? '薄弱' : '学习中' }}</span>
      </div>

      <!-- 空状态 -->
      <div v-if="stats.total === 0" class="wafer-empty">
        完成学情自评或诊断后，知识点将映射到晶圆上
      </div>

      <div class="wafer-hint">拖拽旋转 · 点击晶粒跳转练习</div>
    </div>
  </div>
</template>

<style scoped>
.wafer-card {
  background: var(--bg-surface, var(--color-bg-elevated, #fff));
  border-radius: var(--radius-lg, 16px);
  box-shadow: var(--shadow-card, 0 0 0 1px rgba(0,0,0,0.06), 0 8px 32px rgba(0,0,0,0.06));
  overflow: hidden;
  margin-bottom: var(--space-6, 24px);
}

.wafer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px 12px;
}

.wafer-title-group { display: flex; align-items: baseline; gap: 10px; }

.wafer-title {
  font-size: var(--text-lg, 18px);
  font-weight: 600;
  color: var(--text-primary, var(--color-ink-900, #1a1a2e));
}

.wafer-en {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  color: var(--text-muted, #94a3b8);
  letter-spacing: 1.5px;
}

.wafer-legend { display: flex; gap: 14px; }

.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--text-secondary, #64748b);
}

.legend-item .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.dot-green { background: #00d4aa; box-shadow: 0 0 4px rgba(0,212,170,0.6); }
.dot-yellow { background: #ffd166; box-shadow: 0 0 4px rgba(255,209,102,0.6); }
.dot-red { background: #ff6b6b; box-shadow: 0 0 4px rgba(255,107,107,0.6); }

.wafer-viewport {
  position: relative;
  height: 340px;
  margin: 0 16px 16px;
  border-radius: 12px;
  background: radial-gradient(ellipse at 50% 30%, #0d1520 0%, #070b12 100%);
  overflow: hidden;
  cursor: grab;
  user-select: none;
  touch-action: none;
  border: 1px solid rgba(64,158,255,0.08);
}
.wafer-viewport:active { cursor: grabbing; }

.wafer-glow {
  position: absolute;
  top: 5%;
  left: 50%;
  transform: translateX(-50%);
  width: 400px;
  height: 400px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0,212,170,0.06) 0%, rgba(64,158,255,0.02) 50%, transparent 70%);
  pointer-events: none;
}

.wafer-stage {
  position: absolute;
  top: 38%;
  left: 50%;
  width: 0;
  height: 0;
  perspective: 900px;
  perspective-origin: 50% 35%;
}

.wafer-sphere {
  position: absolute;
  transform-style: preserve-3d;
  will-change: transform;
}

.wafer-tile {
  position: absolute;
  border: 1px solid;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  backface-visibility: hidden;
  opacity: 0.6;
  transition: opacity 0.2s, box-shadow 0.2s;
  cursor: pointer;
}
.wafer-tile:not(.is-empty):hover {
  opacity: 1;
  z-index: 10;
  box-shadow: 0 0 18px rgba(0,212,170,0.6) !important;
  border-color: rgba(0,212,170,0.9) !important;
}

.tile-label {
  font-family: var(--font-mono, monospace);
  font-size: 7px;
  color: rgba(200,220,255,0.5);
  letter-spacing: 0.3px;
  white-space: nowrap;
  pointer-events: none;
}

.wafer-base {
  position: absolute;
  bottom: 8%;
  left: 50%;
  transform: translateX(-50%);
  width: 380px;
  height: 70px;
  border-radius: 50%;
  border: 1px solid rgba(64,158,255,0.06);
  background: radial-gradient(ellipse at center, rgba(64,158,255,0.03) 0%, transparent 70%);
  pointer-events: none;
}

.wafer-tooltip {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(10,15,25,0.9);
  border: 1px solid rgba(0,212,170,0.3);
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  pointer-events: none;
  z-index: 20;
}
.wafer-tooltip strong { font-size: 12px; color: #e2e8f0; }
.wafer-tooltip span { font-family: var(--font-mono, monospace); font-size: 10px; color: #94a3b8; }

.wafer-empty {
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  color: rgba(148,163,184,0.6);
  white-space: nowrap;
}

.wafer-hint {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  color: rgba(140,160,200,0.3);
  letter-spacing: 1.5px;
  pointer-events: none;
}

@media (max-width: 768px) {
  .wafer-viewport { height: 260px; }
  .wafer-legend { display: none; }
  .wafer-base { width: 260px; }
}
</style>
```

---

### 3.2 `src/components/AbilityWaveform.vue`（覆盖重写）

```vue
<script setup>
import { computed, ref, onMounted } from 'vue'
import { useMasteryData } from '@/composables/useMasteryData'

const mastery = useMasteryData()

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
          <span class="aw-stat-val" style="color:#ff6b6b">{{ mastery.weakStarCount ?? 0 }}</span>
          <span class="aw-stat-label">WEAK</span>
        </div>
        <div class="aw-stat">
          <span class="aw-stat-val" style="color:#00d4aa">{{ mastery.strongCount ?? 0 }}</span>
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
```

---

## 四、ProfileView.vue 改动（3 处）

### 改动 1：替换 import（第 11 行）

**找到：**
```js
import KnowledgeGraph from '@/components/KnowledgeGraph.vue'
import { getKnowledgeStructure } from '@/utils/diagnosisInput'
```

**替换为：**
```js
import WaferDome from '@/components/WaferDome.vue'
import AbilityWaveform from '@/components/AbilityWaveform.vue'
```

> 注意：`getKnowledgeStructure` 和 `knowledgeLabels` 不再需要，删除第 18-22 行的 `knowledgeLabels` computed。

### 改动 2：模板 — 移除背景，左列加波形，右列加穹顶

**找到（第 79-81 行）：**
```html
  <div class="profile-view">
    <KnowledgeGraph :node-count="14" :flow-dots="true" :labels="knowledgeLabels" />

    <div class="profile-content">
```

**替换为：**
```html
  <div class="profile-view">
    <div class="profile-content">
```

**找到（第 133 行 `</div>` 结束 info-card 之后、第 135 行 AI 评价卡之前）：**
```html
          </div>

          <!-- AI 评价卡 -->
```

**在两者之间插入：**
```html
          </div>

          <!-- 能力波形 -->
          <AbilityWaveform />

          <!-- AI 评价卡 -->
```

**找到（第 162-163 行右列开头）：**
```html
        <div class="profile-right">
          <!-- 知识路径 -->
```

**替换为：**
```html
        <div class="profile-right">
          <!-- 知识晶圆穹顶 -->
          <WaferDome />

          <!-- 知识路径 -->
```

### 改动 3：清理无用代码

- 删除第 18-22 行的 `knowledgeLabels` computed
- `KnowledgeGraph` 组件文件本身保留不删（其他页面可能引用）

---

## 五、数据流说明

```
useMasteryData()  ← 唯一学情数据源
  ├── abilityStars: [{ topic, star, score, type }]
  │     type: 'strength'(4-5星) | 'weak'(1-2星) | 'developing'(3星)
  ├── strongCount / weakStarCount / developingCount
  └── latestScore
        │
        ├──→ WaferDome
        │     ├── 每个晶粒 = 一个知识点
        │     ├── 颜色 = type（绿/黄/红）
        │     ├── 标签 = topic 截断
        │     └── 点击 → router.push('/practice?topic=xxx')
        │
        └──→ AbilityWaveform
              ├── 5 通道 = 5 个能力维度
              ├── 维度分数 = 该维度下知识点 score 均值
              └── AVG/WEAK/STRONG = mastery 统计字段
```

诊断或练习后 `ability_stars` 更新 → 两个组件的 computed 自动响应 → 晶粒颜色和波形振幅实时变化。

---

## 六、验收标准

1. 进入学生画像页，右列顶部显示「知识晶圆」卡片，深色视口内有 3D 穹顶晶粒
2. 晶粒颜色：绿色=已掌握、黄色=学习中、红色=薄弱，右上角图例显示数量
3. 鼠标拖拽穹顶可旋转，松手有惯性衰减，静止时自动缓慢旋转
4. hover 晶粒显示知识点名称和分数 tooltip；点击晶粒跳转 `/practice?topic=xxx`
5. 左列信息卡下方显示「能力波形」卡，5 通道示波器风格波形，振幅对应分数
6. 无诊断数据时穹顶显示空状态提示，波形通道为 flat line + "––"
7. 页面不再有全屏 KnowledgeGraph 背景
8. 信息卡、AI 评价卡、知识路径卡、时间线卡保持原样
9. 移动端（<768px）穹顶高度压缩到 260px，左列波形全宽
10. `npm run build` 无报错
