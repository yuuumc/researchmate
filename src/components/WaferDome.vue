<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useMasteryData } from '@/composables/useMasteryData'

const emit = defineEmits(['tile-click'])
const router = useRouter()
const mastery = useMasteryData()

// ===== DomeGallery 参数（1:1 移植自 reactbits，按卡片形态微调）=====
const SEGMENTS = 18          // segments 网格列数（默认 35 在卡片内文本不可读，按知识点规模收到 18）
const MAX_VERT_DEG = 12      // 垂直旋转钳制（调大到 12° 方便看全）
const DRAG_SENS = 20         // dragSensitivity
const DRAG_DAMP = 2          // dragDampening
const FIT = 0.62             // 充盈度（≈0.8 在小卡里溢出，0.62 视觉饱满且不裁切）
const MIN_RADIUS = 120
const AUTO_SPEED = 0.02      // 自转 deg/frame

const viewportRef = ref(null)
const sphereRef = ref(null)
const rotX = ref(0)
const rotY = ref(0)
const dragging = ref(false)
const hovered = ref(false)
const hoveredTile = ref(null)

let radius = 220
let rafInertia = null
let rafAuto = null
let startRotX = 0, startRotY = 0
let startX = 0, startY = 0
let moved = false
let lastDragEndAt = 0
let moveBuf = []

const clamp = (v, a, b) => Math.min(Math.max(v, a), b)
const wrapAngle = d => { const a = (((d + 180) % 360) + 360) % 360; return a - 180 }

// ===== 球面晶粒坐标（移植 buildItems：xCols × even/odd Ys 交错网格）=====
const evenYs = [-4, -2, 0, 2, 4]
const oddYs = [-3, -1, 1, 3, 5]
const coords = computed(() => {
  const xCols = Array.from({ length: SEGMENTS }, (_, i) => -37 + i * 2)
  return xCols.flatMap((x, c) => {
    const ys = c % 2 === 0 ? evenYs : oddYs
    return ys.map(y => ({ x, y, sizeX: 2, sizeY: 2 }))
  })
})

const tiles = computed(() => {
  const stars = mastery.abilityStars.value || []
  const pool = stars.length ? stars : []
  return coords.value.map((c, i) => {
    const star = pool.length ? pool[i % pool.length] : null
    return {
      ...c,
      key: `${c.x},${c.y},${i}`,
      topic: star?.topic || '',
      score: star?.score || 0,
      type: star?.type || 'empty',
    }
  })
})

const stats = computed(() => ({
  total: mastery.abilityStars.value?.length || 0,
  strong: mastery.strongCount.value,
  weak: mastery.weakStarCount.value,
  developing: mastery.developingCount.value,
}))

function getColor(type) {
  switch (type) {
    case 'strength':   return { bd: 'rgba(0,212,170,0.8)',  bg: 'rgba(0,212,170,0.16)', glow: 'rgba(0,212,170,0.5)' }
    case 'weak':       return { bd: 'rgba(255,107,107,0.8)', bg: 'rgba(255,107,107,0.16)', glow: 'rgba(255,107,107,0.5)' }
    case 'developing': return { bd: 'rgba(255,209,102,0.65)', bg: 'rgba(255,209,102,0.1)',  glow: 'rgba(255,209,102,0.35)' }
    default:           return { bd: 'rgba(120,150,200,0.18)', bg: 'rgba(120,150,200,0.03)', glow: 'transparent' }
  }
}

function label(topic) {
  if (!topic) return ''
  return topic.length > 5 ? topic.slice(0, 4) + '…' : topic
}

function onTileClick(tile) {
  if (!tile.topic) return
  if (moved) return
  if (performance.now() - lastDragEndAt < 80) return
  emit('tile-click', tile.topic)
  router.push({ path: '/practice', query: { topic: tile.topic } })
}

// ===== 变换应用 =====
function applyTransform() {
  if (sphereRef.value) {
    sphereRef.value.style.transform =
      `translateZ(${-radius}px) rotateX(${rotX.value}deg) rotateY(${rotY.value}deg)`
  }
}

// ===== ResizeObserver 计算半径（移植 fit/minRadius 逻辑）=====
let ro = null
function setupResize() {
  ro = new ResizeObserver(entries => {
    const cr = entries[0].contentRect
    const w = Math.max(1, cr.width), h = Math.max(1, cr.height)
    const minDim = Math.min(w, h)
    let r = minDim * FIT
    r = Math.min(r, h * 1.0)
    r = clamp(r, MIN_RADIUS, 9999)
    radius = Math.round(r)
    if (viewportRef.value) viewportRef.value.style.setProperty('--radius', radius + 'px')
    applyTransform()
  })
  if (viewportRef.value) ro.observe(viewportRef.value)
}

// ===== 拖拽 + 惯性（原生 pointer events 替代 @use-gesture/react）=====
function onPointerDown(e) {
  if (dragging.value) return
  dragging.value = true
  moved = false
  startRotX = rotX.value; startRotY = rotY.value
  startX = e.clientX; startY = e.clientY
  moveBuf = [{ t: performance.now(), x: e.clientX, y: e.clientY }]
  stopInertia()
  try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {}
}
function onPointerMove(e) {
  if (!dragging.value) return
  const dx = e.clientX - startX, dy = e.clientY - startY
  if (!moved && dx * dx + dy * dy > 16) moved = true
  const nx = clamp(startRotX - dy / DRAG_SENS, -MAX_VERT_DEG, MAX_VERT_DEG)
  const ny = wrapAngle(startRotY + dx / DRAG_SENS)
  if (nx !== rotX.value || ny !== rotY.value) {
    rotX.value = nx; rotY.value = ny; applyTransform()
  }
  moveBuf.push({ t: performance.now(), x: e.clientX, y: e.clientY })
  if (moveBuf.length > 6) moveBuf.shift()
}
function onPointerUp() {
  if (!dragging.value) return
  dragging.value = false
  let vx = 0, vy = 0
  if (moveBuf.length >= 2) {
    const a = moveBuf[0], b = moveBuf[moveBuf.length - 1]
    const dt = Math.max(1, b.t - a.t)
    vx = (b.x - a.x) / dt
    vy = (b.y - a.y) / dt
  }
  startInertia(vx, vy)
  if (moved) lastDragEndAt = performance.now()
  moved = false
}
function startInertia(vx, vy) {
  const MAXV = 1.4
  let vX = clamp(vx, -MAXV, MAXV) * 80
  let vY = clamp(vy, -MAXV, MAXV) * 80
  const d = clamp(DRAG_DAMP, 0, 1)
  const friction = 0.94 + 0.055 * d
  const stop = 0.015 - 0.01 * d
  const maxFrames = Math.round(90 + 270 * d)
  let frames = 0
  const step = () => {
    vX *= friction; vY *= friction
    if (Math.abs(vX) < stop && Math.abs(vY) < stop) { rafInertia = null; return }
    if (++frames > maxFrames) { rafInertia = null; return }
    const nx = clamp(rotX.value - vY / 200, -MAX_VERT_DEG, MAX_VERT_DEG)
    const ny = wrapAngle(rotY.value + vX / 200)
    rotX.value = nx; rotY.value = ny; applyTransform()
    rafInertia = requestAnimationFrame(step)
  }
  stopInertia()
  rafInertia = requestAnimationFrame(step)
}
function stopInertia() {
  if (rafInertia) { cancelAnimationFrame(rafInertia); rafInertia = null }
}

// ===== 自转（hover 暂停）=====
function autoRotate() {
  if (!dragging.value && !hovered.value && !rafInertia) {
    rotY.value = wrapAngle(rotY.value + AUTO_SPEED)
    applyTransform()
  }
  rafAuto = requestAnimationFrame(autoRotate)
}

onMounted(() => {
  nextTick(() => { setupResize(); applyTransform(); autoRotate() })
})
onUnmounted(() => {
  stopInertia()
  if (rafAuto) cancelAnimationFrame(rafAuto)
  if (ro) ro.disconnect()
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

    <!-- 穹顶视口（sphere-root） -->
    <div
      ref="viewportRef"
      class="wafer-viewport sphere-root"
      :style="{
        '--segments-x': SEGMENTS,
        '--segments-y': SEGMENTS,
        '--overlay-blur-color': '#070b12',
        '--tile-radius': '8px',
      }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
    >
      <div class="wafer-glow"></div>

      <div class="sphere-main">
        <div class="stage">
          <div ref="sphereRef" class="sphere">
            <div
              v-for="tile in tiles"
              :key="tile.key"
              class="item"
              :class="{ 'is-empty': !tile.topic }"
              :style="{
                '--offset-x': tile.x,
                '--offset-y': tile.y,
                '--item-size-x': tile.sizeX,
                '--item-size-y': tile.sizeY,
              }"
            >
              <div
                class="item__image"
                role="button"
                tabindex="0"
                :aria-label="tile.topic || '空晶粒'"
                :style="{
                  borderColor: getColor(tile.type).bd,
                  background: getColor(tile.type).bg,
                  boxShadow: `0 0 10px ${getColor(tile.type).glow}`,
                }"
                @click.stop="onTileClick(tile)"
                @pointerup.stop="onTileClick(tile)"
                @mouseenter="hoveredTile = tile"
                @mouseleave="hoveredTile = null"
              >
                <span class="tile-label">{{ label(tile.topic) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 径向渐隐遮罩（overlayBlurColor 效果） -->
        <div class="overlay"></div>
        <div class="overlay overlay--blur"></div>
        <div class="edge-fade edge-fade--top"></div>
        <div class="edge-fade edge-fade--bottom"></div>
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
  display: flex; align-items: center; gap: 5px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--text-secondary, #64748b);
}
.legend-item .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.dot-green { background: #00d4aa; box-shadow: 0 0 4px rgba(0,212,170,0.6); }
.dot-yellow { background: #ffd166; box-shadow: 0 0 4px rgba(255,209,102,0.6); }
.dot-red { background: #ff6b6b; box-shadow: 0 0 4px rgba(255,107,107,0.6); }

/* ===== DomeGallery 球面容器 ===== */
.wafer-viewport.sphere-root {
  --radius: 220px;
  --circ: calc(var(--radius) * 3.14);
  --rot-y: calc((360deg / var(--segments-x)) / 2);
  --rot-x: calc((360deg / var(--segments-y)) / 2);
  --item-width: calc(var(--circ) / var(--segments-x));
  --item-height: calc(var(--circ) / var(--segments-y));
  position: relative;
  height: 340px;
  margin: 0 16px 16px;
  border-radius: 12px;
  background: radial-gradient(ellipse at 50% 30%, #0d1520 0%, #070b12 100%);
  overflow: hidden;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  border: 1px solid rgba(64,158,255,0.08);
}
.wafer-viewport:active { cursor: grabbing; }
.sphere-root * { box-sizing: border-box; }

.sphere-main {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  touch-action: none;
}
.stage {
  width: 100%; height: 100%;
  display: grid; place-items: center;
  perspective: calc(var(--radius) * 2);
  perspective-origin: 50% 45%;
  contain: layout paint size;
}
.sphere,
.item,
.item__image { transform-style: preserve-3d; }
.sphere {
  transform: translateZ(calc(var(--radius) * -1));
  will-change: transform;
}

/* 晶粒：球面定位（移植 .item transform） */
.item {
  width: calc(var(--item-width) * var(--item-size-x));
  height: calc(var(--item-height) * var(--item-size-y));
  position: absolute;
  top: -999px; bottom: -999px; left: -999px; right: -999px;
  margin: auto;
  transform-origin: 50% 50%;
  backface-visibility: hidden;
  transition: transform 300ms;
  transform:
    rotateY(calc(var(--rot-y) * (var(--offset-x) + ((var(--item-size-x) - 1) / 2))))
    rotateX(calc(var(--rot-x) * (var(--offset-y) - ((var(--item-size-y) - 1) / 2))))
    translateZ(var(--radius));
}
.item__image {
  position: absolute;
  inset: 6px;
  border: 1px solid;
  border-radius: var(--tile-radius, 8px);
  background: transparent;
  overflow: hidden;
  backface-visibility: hidden;
  transition: transform 300ms, box-shadow 0.2s, opacity 0.2s;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.55;
}
.item__image:focus { outline: none; }
.item:not(.is-empty) .item__image { opacity: 0.92; }
.item:not(.is-empty) .item__image:hover {
  opacity: 1;
  z-index: 10;
  box-shadow: 0 0 18px rgba(0,212,170,0.7) !important;
  border-color: rgba(0,212,170,0.95) !important;
  transform: scale(1.08);
}
.tile-label {
  font-family: var(--font-mono, monospace);
  font-size: 8px;
  color: rgba(210,225,255,0.7);
  letter-spacing: 0.3px;
  white-space: nowrap;
  pointer-events: none;
  text-align: center;
}

/* 径向渐隐遮罩 */
.overlay,
.overlay--blur {
  position: absolute;
  inset: 0;
  margin: auto;
  z-index: 3;
  pointer-events: none;
}
.overlay {
  background-image: radial-gradient(rgba(235,235,235,0) 60%, var(--overlay-blur-color, #070b12) 100%);
}
.overlay--blur {
  -webkit-mask-image: radial-gradient(rgba(235,235,235,0) 66%, var(--overlay-blur-color, #070b12) 90%);
  mask-image: radial-gradient(rgba(235,235,235,0) 66%, var(--overlay-blur-color, #070b12) 90%);
  backdrop-filter: blur(3px);
}
.edge-fade {
  position: absolute; left: 0; right: 0; height: 90px; z-index: 5;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent, var(--overlay-blur-color, #070b12));
}
.edge-fade--top { top: 0; transform: rotate(180deg); }
.edge-fade--bottom { bottom: 0; }

/* 装饰 */
.wafer-glow {
  position: absolute; top: 5%; left: 50%;
  transform: translateX(-50%);
  width: 420px; height: 420px; border-radius: 50%;
  background: radial-gradient(circle, rgba(0,212,170,0.06) 0%, rgba(64,158,255,0.02) 50%, transparent 70%);
  pointer-events: none;
}
.wafer-base {
  position: absolute; bottom: 8%; left: 50%;
  transform: translateX(-50%);
  width: 380px; height: 70px; border-radius: 50%;
  border: 1px solid rgba(64,158,255,0.06);
  background: radial-gradient(ellipse at center, rgba(64,158,255,0.03) 0%, transparent 70%);
  pointer-events: none;
}

.wafer-tooltip {
  position: absolute; top: 12px; right: 12px;
  background: rgba(10,15,25,0.9);
  border: 1px solid rgba(0,212,170,0.3);
  border-radius: 8px; padding: 8px 12px;
  display: flex; flex-direction: column; gap: 2px;
  pointer-events: none; z-index: 20;
}
.wafer-tooltip strong { font-size: 12px; color: #e2e8f0; }
.wafer-tooltip span { font-family: var(--font-mono, monospace); font-size: 10px; color: #94a3b8; }

.wafer-empty {
  position: absolute; bottom: 40px; left: 50%;
  transform: translateX(-50%);
  font-size: 12px; color: rgba(148,163,184,0.6); white-space: nowrap;
}
.wafer-hint {
  position: absolute; bottom: 8px; left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-mono, monospace);
  font-size: 9px; color: rgba(140,160,200,0.3);
  letter-spacing: 1.5px; pointer-events: none;
}

@media (max-width: 768px) {
  .wafer-viewport.sphere-root { height: 280px; }
  .wafer-legend { display: none; }
  .wafer-base { width: 260px; }
  .edge-fade { height: 60px; }
}
</style>
