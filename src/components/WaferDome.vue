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
