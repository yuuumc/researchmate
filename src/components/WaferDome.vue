<script setup lang="ts">
/**
 * 知识晶圆 WaferDome —— 第二轮重做
 * 蓝本：vue-bits（reactbits 的 Vue 移植版）DomeGallery.vue 1:1 实现
 *   - 球面定位 / 半径计算 / 拖拽惯性 / 垂直角钳制 / 径向渐隐遮罩 全按 Vue 源码
 *   - 零新增运行时依赖（源码本身即用原生 mouse/touch events，无 @use-gesture）
 *   - 去掉 DomeGallery 的「点击放大」交互（与跳转 /practice 冲突，不采用）
 * 业务映射保留：晶粒=知识点文本标签、绿/黄/红三色、图例计数、hover tooltip、
 *   点击跳 /practice?topic=xxx、空状态、标题栏。
 * UI 贴合研芯通设计体系：面板底色 / 遮罩 / 晶粒描边与文字色全部走 theme-tokens
 *   CSS 变量（--bg-base / --text-* / --color-node-*），深浅双主题自适应，
 *   不再硬编码深色，消除「深色穹顶嵌在浅色卡片」的风格割裂。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMasteryData } from '@/composables/useMasteryData'

const emit = defineEmits(['tile-click'])
const router = useRouter()
const mastery = useMasteryData()

// ===== DomeGallery 参数（对齐 vue-bits demo 口径）=====
const SEGMENTS = 30            // segments 网格列数（demo 量级，晶粒大而密）
const MAX_VERT_DEG = 9         // 垂直旋转钳制（对齐演示版 9°）
const DRAG_SENS = 20           // dragSensitivity
const DRAG_DAMP = 3.2          // dragDampening（对齐演示版 3.2，0-5 量纲）
const CLICK_SLOP_PX = 5        // 点击/拖拽判定阈值：位移 < 5px 视为静止点击
const FIT = 0.8                // 充盈度（demo 口径）
const FIT_BASIS = 'width'      // fitBasis：按容器宽度算半径，让球左右近满幅
const MIN_RADIUS = 400         // minRadius 调大，小球也饱满（demo 口径）
const MAX_RADIUS = Infinity
const PAD_FACTOR = 0.25
const AUTO_SPEED = 0.02        // 自转 deg/frame

const rootRef = ref<HTMLDivElement | null>(null)
const mainRef = ref<HTMLElement | null>(null)
const sphereRef = ref<HTMLDivElement | null>(null)

const rotationRef = { x: 0, y: 0 }
const startRotRef = { x: 0, y: 0 }
let startPosRef: { x: number; y: number } | null = null
let draggingRef = false
let movedRef = false
let inertiaRAF: number | null = null
let autoRAF: number | null = null
let lastDragEndAt = 0
let moveBuf: { t: number; x: number; y: number }[] = []
let resizeObserver: ResizeObserver | null = null
let radius = 400

const hovered = ref(false)
const hoveredTile = ref<{ topic: string; score: number; type: string } | null>(null)

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max)
const normalizeAngle = (d: number): number => ((d % 360) + 360) % 360
const wrapAngleSigned = (deg: number): number => {
  const a = (((deg + 180) % 360) + 360) % 360
  return a - 180
}

// ===== 球面晶粒坐标（1:1 移植 buildItems 交错网格）=====
interface TileCoord { x: number; y: number; sizeX: number; sizeY: number }
const evenYs = [-4, -2, 0, 2, 4]
const oddYs = [-3, -1, 1, 3, 5]
const coords = computed<TileCoord[]>(() => {
  const xCols = Array.from({ length: SEGMENTS }, (_, i) => -37 + i * 2)
  return xCols.flatMap((x, c) => {
    const ys = c % 2 === 0 ? evenYs : oddYs
    return ys.map(y => ({ x, y, sizeX: 2, sizeY: 2 }))
  })
})

const tiles = computed(() => {
  const stars = mastery.abilityStars.value || []
  const pool = stars
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

function tileColors(type: string) {
  // 全部走主题 token，深浅双主题自适应
  switch (type) {
    case 'strength':
      return { bd: 'var(--color-node-active)', bg: 'var(--color-success-bg)', glow: 'rgba(34,211,238,0.45)', text: 'var(--text-primary)' }
    case 'weak':
      return { bd: 'var(--color-node-weak)', bg: 'var(--color-error-bg)', glow: 'rgba(248,113,113,0.45)', text: 'var(--text-primary)' }
    case 'developing':
      return { bd: 'var(--color-node-warn)', bg: 'var(--color-warning-bg)', glow: 'rgba(251,191,36,0.4)', text: 'var(--text-primary)' }
    default:
      return { bd: 'var(--border-subtle)', bg: 'transparent', glow: 'transparent', text: 'var(--text-muted)' }
  }
}

function label(topic: string) {
  if (!topic) return ''
  let s = topic.trim()
  // 纯英文术语整段保留（允许空格/连字符/斜杠等）：MOSFET I-V / BJT / CMOS / Bandgap
  if (/^[A-Za-z][A-Za-z0-9\s\-/\\.+#]*$/.test(s)) {
    if (s.length <= 14) return s
    // 过长英文：空格/连字符分段后取最长 token
    const toks = s.split(/[\s\-/]+/).filter(Boolean)
    return toks.reduce((a, b) => (b.length > a.length ? b : a), toks[0] || s.slice(0, 10))
  }
  // 去副标题（冒号后部分）：载流子输运：漂移与扩散 → 载流子输运
  s = s.split(/[：:]/)[0].trim()
  // 去填充词「的」
  s = s.replace(/的/g, '')
  // 5 字以内整体保留（载流子输运）
  if (s.length <= 5) return s
  // 并列结构取首段：PN结能带图与内建电场 → PN结能带图；BJT 电流增益与频率特性 → BJT 电流增益
  s = s.split(/[与和及、]/)[0].trim()
  if (s.length <= 8) return s
  // 去尾部通用词以压缩（补「输运」「特性」「图」「结」等）
  const stripped = s.replace(/(基础|原理|理论|性质|电路|效应|物理|技术|方法|分析|设计|系统|结构|模型|定律|定理|方程|函数|信号|器件|工艺|材料|特性|输运|图|结)$/, '')
  if (stripped.length >= 2) s = stripped
  if (s.length <= 8) return s
  // 中英混合：保留英文 token + 中文核心（最多 4 字）
  const m = s.match(/^([A-Za-z][A-Za-z0-9]*)\s*(.+)$/)
  if (m) return m[1] + ' ' + m[2].replace(/\s+/g, '').slice(0, 4)
  return s.slice(0, 8)
}

function masteryText(type: string) {
  return type === 'strength' ? '已掌握' : type === 'weak' ? '薄弱' : '学习中'
}

function onTileClick(tile: { topic: string }) {
  // 仅键盘路径（Enter/Space）走这里；鼠标点击经 pointer capture 重定向到 main，
  // 由 onPointerUp 的位移阈值 + elementFromPoint 命中处理，不会重复触发。
  if (draggingRef) return
  if (performance.now() - lastDragEndAt < 120) return
  if (!tile.topic) return
  emit('tile-click', tile.topic)
  router.push({ path: '/practice', query: { topic: tile.topic } })
}

// ===== 变换应用（1:1 移植 applyTransform）=====
function applyTransform(xDeg: number, yDeg: number) {
  const el = sphereRef.value
  if (el) el.style.transform = `translateZ(calc(var(--radius) * -1)) rotateX(${xDeg}deg) rotateY(${yDeg}deg)`
}

// ===== 半径计算（1:1 移植 computeRadius：basis/fit/cap/minRadius）=====
function computeRadius() {
  const root = rootRef.value
  if (!root) return
  const cr = root.getBoundingClientRect()
  const w = Math.max(1, cr.width)
  const h = Math.max(1, cr.height)
  const minDim = Math.min(w, h)
  const maxDim = Math.max(w, h)
  const aspect = w / h
  let basis: number
  switch (FIT_BASIS) {
    case 'min': basis = minDim; break
    case 'max': basis = maxDim; break
    case 'width': basis = w; break
    case 'height': basis = h; break
    default: basis = aspect >= 1.3 ? w : minDim
  }
  let r = basis * FIT
  r = Math.min(r, h * 1.35)
  r = clamp(r, MIN_RADIUS, MAX_RADIUS)
  radius = Math.round(r)
  const viewerPad = Math.max(8, Math.round(minDim * PAD_FACTOR))
  root.style.setProperty('--radius', `${radius}px`)
  root.style.setProperty('--viewer-pad', `${viewerPad}px`)
  // FIX: Set perspective directly on .sphere-stage (Chrome/Edge bug: CSS calc perspective does not re-evaluate when --radius changes via inline style)
  const _stage = root.querySelector('.sphere-stage') as HTMLElement | null
  if (_stage) _stage.style.perspective = (radius * 2) + 'px'
  applyTransform(rotationRef.x, rotationRef.y)
}

function applyRootVars() {
  const root = rootRef.value
  if (!root) return
  root.style.setProperty('--overlay-blur-color', 'var(--bg-base)')
  root.style.setProperty('--tile-radius', '10px')
}

// ===== 拖拽 + 惯性（原生 pointer events，1:1 移植 onDragStart/Move/End + startInertia）=====
function onPointerDown(e: PointerEvent) {
  if (draggingRef) return
  stopInertia()
  draggingRef = true
  movedRef = false
  startRotRef.x = rotationRef.x
  startRotRef.y = rotationRef.y
  startPosRef = { x: e.clientX, y: e.clientY }
  moveBuf = [{ t: performance.now(), x: e.clientX, y: e.clientY }]
  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch (_) { /* noop */ }
}
function onPointerMove(e: PointerEvent) {
  if (!draggingRef || !startPosRef) return
  const dx = e.clientX - startPosRef.x
  const dy = e.clientY - startPosRef.y
  if (!movedRef && dx * dx + dy * dy > 16) movedRef = true
  const nextX = clamp(startRotRef.x - dy / DRAG_SENS, -MAX_VERT_DEG, MAX_VERT_DEG)
  const nextY = wrapAngleSigned(startRotRef.y + dx / DRAG_SENS)
  if (rotationRef.x !== nextX || rotationRef.y !== nextY) {
    rotationRef.x = nextX
    rotationRef.y = nextY
    applyTransform(nextX, nextY)
  }
  moveBuf.push({ t: performance.now(), x: e.clientX, y: e.clientY })
  if (moveBuf.length > 6) moveBuf.shift()
}
function onPointerUp(e: PointerEvent) {
  if (!draggingRef) return
  draggingRef = false
  const dx = startPosRef ? e.clientX - startPosRef.x : 0
  const dy = startPosRef ? e.clientY - startPosRef.y : 0
  const dist2 = dx * dx + dy * dy
  const isClick = startPosRef !== null && dist2 < CLICK_SLOP_PX * CLICK_SLOP_PX
  if (!isClick && startPosRef) {
    // 拖拽：启动惯性
    const vx = clamp((dx / DRAG_SENS) * 0.02, -1.2, 1.2)
    const vy = clamp((dy / DRAG_SENS) * 0.02, -1.2, 1.2)
    if (Math.abs(vx) > 0.005 || Math.abs(vy) > 0.005) startInertia(vx, vy)
    lastDragEndAt = performance.now()
  }
  movedRef = false
  // 静止点击：位移 < 阈值视为点击，命中晶粒则跳转 /practice?topic=xxx
  // pointer capture 把 pointerup 重定向到 main，故用 elementFromPoint 取实际命中元素
  if (isClick) {
    const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const itemEl = hit?.closest?.('.item') as HTMLElement | null
    const topic = itemEl?.getAttribute('data-src') || ''
    if (topic && itemEl && !itemEl.classList.contains('is-empty')) {
      emit('tile-click', topic)
      router.push({ path: '/practice', query: { topic } })
    }
  }
  startPosRef = null
}
function startInertia(vx: number, vy: number) {
  const MAX_V = 1.4
  let vX = clamp(vx, -MAX_V, MAX_V) * 80
  let vY = clamp(vy, -MAX_V, MAX_V) * 80
  const d = clamp(DRAG_DAMP / 5, 0, 1)
  const friction = 0.94 + 0.055 * d
  const stopThreshold = 0.015 - 0.01 * d
  const maxFrames = Math.round(90 + 270 * d)
  let frames = 0
  const step = () => {
    vX *= friction
    vY *= friction
    if (Math.abs(vX) < stopThreshold && Math.abs(vY) < stopThreshold) { inertiaRAF = null; return }
    if (++frames > maxFrames) { inertiaRAF = null; return }
    const nextX = clamp(rotationRef.x - vY / 200, -MAX_VERT_DEG, MAX_VERT_DEG)
    const nextY = wrapAngleSigned(rotationRef.y + vX / 200)
    rotationRef.x = nextX
    rotationRef.y = nextY
    applyTransform(nextX, nextY)
    inertiaRAF = requestAnimationFrame(step)
  }
  stopInertia()
  inertiaRAF = requestAnimationFrame(step)
}
function stopInertia() {
  if (inertiaRAF !== null) { cancelAnimationFrame(inertiaRAF); inertiaRAF = null }
}

// ===== 自转（rAF，hover 暂停）=====
function autoRotate() {
  if (!draggingRef && !hovered.value && inertiaRAF === null) {
    rotationRef.y = wrapAngleSigned(rotationRef.y + AUTO_SPEED)
    applyTransform(rotationRef.x, rotationRef.y)
  }
  autoRAF = requestAnimationFrame(autoRotate)
}

onMounted(() => {
  const root = rootRef.value
  const main = mainRef.value
  if (!root || !main) return
  applyRootVars()
  computeRadius()
  applyTransform(rotationRef.x, rotationRef.y)
  resizeObserver = new ResizeObserver(computeRadius)
  resizeObserver.observe(root)
  autoRAF = requestAnimationFrame(autoRotate)
  requestAnimationFrame(() => {
    // Force reflow to ensure 3D rendering context is initialized
    if (rootRef.value) void rootRef.value.offsetWidth
    applyTransform(rotationRef.x, rotationRef.y)
  })
})
onUnmounted(() => {
  stopInertia()
  if (autoRAF !== null) cancelAnimationFrame(autoRAF)
  resizeObserver?.disconnect()
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
      ref="rootRef"
      class="wafer-viewport sphere-root"
      :style="{
        '--segments-x': SEGMENTS,
        '--segments-y': SEGMENTS,
      }"
    >
      <div class="wafer-glow"></div>

      <main
        ref="mainRef"
        class="sphere-main"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @mouseenter="hovered = true"
        @mouseleave="hovered = false"
      >
        <div class="sphere-stage">
          <div ref="sphereRef" class="sphere">
            <div
              v-for="tile in tiles"
              :key="tile.key"
              class="item"
              :class="{ 'is-empty': !tile.topic }"
              :data-src="tile.topic"
              :data-offset-x="tile.x"
              :data-offset-y="tile.y"
              :data-size-x="tile.sizeX"
              :data-size-y="tile.sizeY"
              :style="{
                '--offset-x': tile.x,
                '--offset-y': tile.y,
                '--item-size-x': tile.sizeX,
                '--item-size-y': tile.sizeY,
              }"
            >
              <div
                class="item__tile"
                role="button"
                tabindex="0"
                :aria-label="tile.topic || '空晶粒'"
                :style="{
                  borderColor: tileColors(tile.type).bd,
                  background: tileColors(tile.type).bg,
                  color: tileColors(tile.type).text,
                  boxShadow: `0 0 10px ${tileColors(tile.type).glow}`,
                }"
                @click.stop="onTileClick(tile)"
                @keydown.enter.stop="onTileClick(tile)"
                @keydown.space.prevent.stop="onTileClick(tile)"
                @mouseenter="hoveredTile = tile"
                @mouseleave="hoveredTile = null"
              >
                <span class="tile-label">{{ label(tile.topic) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 径向渐隐遮罩（overlayBlurColor 效果，颜色走 --bg-base） -->
        <div class="overlay"></div>
        <div class="overlay overlay--blur"></div>
        <div class="edge-fade edge-fade--top"></div>
        <div class="edge-fade edge-fade--bottom"></div>
      </main>

      <div class="wafer-base"></div>

      <!-- hover tooltip -->
      <div v-if="hoveredTile && hoveredTile.topic" class="wafer-tooltip">
        <strong>{{ hoveredTile.topic }}</strong>
        <span>{{ hoveredTile.score }}分 · {{ masteryText(hoveredTile.type) }}</span>
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
  color: var(--text-primary, #1a1a2e);
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
.dot-green { background: var(--color-node-active, #22d3ee); box-shadow: 0 0 4px rgba(34,211,238,0.6); }
.dot-yellow { background: var(--color-node-warn, #fbbf24); box-shadow: 0 0 4px rgba(251,191,36,0.6); }
.dot-red { background: var(--color-node-weak, #f87171); box-shadow: 0 0 4px rgba(248,113,113,0.6); }

/* ===== DomeGallery 球面容器（面板底色走 --bg-base，双主题自适应）===== */
.wafer-viewport.sphere-root {
  --radius: 400px;
  --circ: calc(var(--radius) * 3.14);
  --rot-y: calc((360deg / var(--segments-x)) / 2);
  --rot-x: calc((360deg / var(--segments-y)) / 2);
  --item-width: calc(var(--circ) / var(--segments-x));
  --item-height: calc(var(--circ) / var(--segments-y));
  --overlay-blur-color: var(--bg-base, #f6f8fc);
  --tile-radius: 10px;
  position: relative;
  height: 460px;
  margin: 0 16px 16px;
  border-radius: 12px;
  /* 面板底色 = 页面底色，轻微凹陷感，消除深色面板割裂 */
  background:
    radial-gradient(ellipse at 50% 35%, var(--bg-elevated, var(--bg-surface, #fff)) 0%, var(--bg-base, #f6f8fc) 100%);
  overflow: hidden;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  border: 1px solid var(--border-subtle, rgba(15,23,42,0.08));
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
.sphere-stage {
  width: 100%; height: 100%;
  display: grid; place-items: center;
  perspective: calc(var(--radius) * 2);
  perspective-origin: 50% 45%;
}
.sphere,
.item,
.item__tile { transform-style: preserve-3d; }
.sphere {
  position: relative;
  transform: translateZ(calc(var(--radius) * -1));
  will-change: transform;
}

/* 晶粒：球面定位（1:1 移植 .item transform） */
.item {
  width: calc(var(--item-width) * var(--item-size-x));
  height: calc(var(--item-height) * var(--item-size-y));
  position: absolute;
  top: -999px; bottom: -999px; left: -999px; right: -999px;
  margin: auto;
  transform-origin: 50% 50%;
  backface-visibility: hidden;
  transform:
    rotateY(calc(var(--rot-y) * (var(--offset-x) + ((var(--item-size-x) - 1) / 2)) + var(--rot-y-delta, 0deg)))
    rotateX(calc(var(--rot-x) * (var(--offset-y) - ((var(--item-size-y) - 1) / 2)) + var(--rot-x-delta, 0deg)))
    translateZ(var(--radius));
}
.item__tile {
  position: absolute;
  inset: 2px;
  border: 1px solid;
  border-radius: var(--tile-radius, 10px);
  background: transparent;
  overflow: visible;
  backface-visibility: hidden;
  transition: transform 300ms, box-shadow 0.2s, opacity 0.2s;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
}
.item__tile:focus { outline: none; }
.item:not(.is-empty) .item__tile { opacity: 0.92; }
.item:not(.is-empty) .item__tile:hover {
  opacity: 1;
  z-index: 10;
  transform: scale(1.1);
}
.tile-label {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.2px;
  white-space: nowrap;
  pointer-events: none;
  text-align: center;
  line-height: 1.1;
}

/* 径向渐隐遮罩（颜色 = 面板底色 --bg-base，双主题融合） */
.overlay,
.overlay--blur {
  position: absolute;
  inset: 0;
  margin: auto;
  z-index: 3;
  pointer-events: none;
}
.overlay {
  background-image: radial-gradient(rgba(235,235,235,0) 62%, var(--overlay-blur-color) 100%);
}
.overlay--blur {
  -webkit-mask-image: radial-gradient(rgba(235,235,235,0) 68%, var(--overlay-blur-color) 90%);
  mask-image: radial-gradient(rgba(235,235,235,0) 68%, var(--overlay-blur-color) 90%);
  backdrop-filter: blur(3px);
}
.edge-fade {
  position: absolute; left: 0; right: 0; height: 90px; z-index: 5;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent, var(--overlay-blur-color));
}
.edge-fade--top { top: 0; transform: rotate(180deg); }
.edge-fade--bottom { bottom: 0; }

/* 装饰（颜色走主题变量，弱化） */
.wafer-glow {
  position: absolute; top: 5%; left: 50%;
  transform: translateX(-50%);
  width: 70%; height: 70%; border-radius: 50%;
  background: radial-gradient(circle, var(--primary-dim, rgba(34,211,238,0.06)) 0%, transparent 70%);
  pointer-events: none;
}
.wafer-base {
  position: absolute; bottom: 6%; left: 50%;
  transform: translateX(-50%);
  width: 60%; height: 60px; border-radius: 50%;
  border: 1px solid var(--border-subtle, rgba(15,23,42,0.06));
  background: radial-gradient(ellipse at center, var(--primary-dim, rgba(34,211,238,0.03)) 0%, transparent 70%);
  pointer-events: none;
}

.wafer-tooltip {
  position: absolute; top: 12px; right: 12px;
  background: var(--bg-elevated, rgba(10,15,25,0.9));
  border: 1px solid var(--border-default, rgba(0,212,170,0.3));
  border-radius: 8px; padding: 8px 12px;
  display: flex; flex-direction: column; gap: 2px;
  pointer-events: none; z-index: 20;
}
.wafer-tooltip strong { font-size: 12px; color: var(--text-primary, #e2e8f0); }
.wafer-tooltip span { font-family: var(--font-mono, monospace); font-size: 10px; color: var(--text-secondary, #94a3b8); }

.wafer-empty {
  position: absolute; bottom: 40px; left: 50%;
  transform: translateX(-50%);
  font-size: 12px; color: var(--text-muted, rgba(148,163,184,0.6)); white-space: nowrap;
}
.wafer-hint {
  position: absolute; bottom: 8px; left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-mono, monospace);
  font-size: 9px; color: var(--text-secondary, #64748b);
  letter-spacing: 1.5px; pointer-events: none;
}

@media (max-width: 768px) {
  .wafer-viewport.sphere-root { height: 320px; margin: 0 10px 12px; }
  .wafer-legend { display: none; }
  .edge-fade { height: 60px; }
  .tile-label { font-size: 10px; }
}
</style>
