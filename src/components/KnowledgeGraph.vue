<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'

const props = defineProps({
  // 节点数量
  nodeCount: {
    type: Number,
    default: 18
  },
  // 是否显示流动光点
  flowDots: {
    type: Boolean,
    default: true
  },
  // 主题：light（浅底）/ dark（深底）
  theme: {
    type: String,
    default: 'light'
  },
  // 强调节点（高亮某几个，传入索引数组）
  activeNodes: {
    type: Array,
    default: () => []
  }
})

const svgRef = ref(null)
const viewBoxWidth = 1200
const viewBoxHeight = 800

// 用固定种子生成节点，保证刷新位置一致（避免布局抖动）
const nodes = ref([])
const edges = ref([])

// 简易种子随机
function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function generateGraph() {
  const rand = seededRandom(42)
  const arr = []
  // 节点分布：避开中心区域（留给内容）
  for (let i = 0; i < props.nodeCount; i++) {
    let x, y
    let attempts = 0
    do {
      x = rand() * viewBoxWidth
      y = rand() * viewBoxHeight
      attempts++
    } while (
      attempts < 10 &&
      x > viewBoxWidth * 0.3 &&
      x < viewBoxWidth * 0.7 &&
      y > viewBoxHeight * 0.3 &&
      y < viewBoxHeight * 0.7
    )
    arr.push({
      id: i,
      x,
      y,
      r: 2 + rand() * 3,
      // 漂浮参数
      driftX: (rand() - 0.5) * 8,
      driftY: (rand() - 0.5) * 8,
      driftDuration: 8 + rand() * 6,
      driftDelay: rand() * 4
    })
  }
  nodes.value = arr

  // 连线：每个节点连接最近的 2-3 个
  const edgeSet = new Set()
  arr.forEach((n, i) => {
    const dists = arr
      .map((m, j) => ({ j, d: Math.hypot(m.x - n.x, m.y - n.y) }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2 + Math.floor(rand() * 2))
    dists.forEach(({ j }) => {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`
      edgeSet.add(key)
    })
  })
  edges.value = [...edgeSet].map((k) => {
    const [a, b] = k.split('-').map(Number)
    return { a, b, key: k }
  })
}

// 流动光点（沿连线移动）
const flowParticles = computed(() => {
  if (!props.flowDots) return []
  return edges.value.slice(0, 6).map((e, i) => ({
    ...e,
    duration: 6 + (i % 3) * 2,
    delay: i * 1.2
  }))
})

const isDark = computed(() => props.theme === 'dark')

onMounted(() => {
  generateGraph()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

function handleResize() {
  // SVG 用 viewBox 自适应，无需重算
}
</script>

<template>
  <div class="knowledge-graph" :class="theme">
    <svg
      ref="svgRef"
      :viewBox="`0 0 ${viewBoxWidth} ${viewBoxHeight}`"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      class="graph-svg"
    >
      <defs>
        <!-- 连线渐变 -->
        <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#1e3a5f" stop-opacity="0" />
          <stop offset="50%" stop-color="#1e3a5f" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#1e3a5f" stop-opacity="0" />
        </linearGradient>
        <!-- 节点辉光 -->
        <radialGradient id="node-glow">
          <stop offset="0%" stop-color="#00d4aa" stop-opacity="0.6" />
          <stop offset="100%" stop-color="#00d4aa" stop-opacity="0" />
        </radialGradient>
        <!-- 活跃节点辉光 -->
        <radialGradient id="node-active-glow">
          <stop offset="0%" stop-color="#00d4aa" stop-opacity="0.9" />
          <stop offset="60%" stop-color="#00d4aa" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#00d4aa" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- 连线层 -->
      <g class="edges-layer">
        <line
          v-for="edge in edges"
          :key="`edge-${edge.key}`"
          :x1="nodes[edge.a]?.x"
          :y1="nodes[edge.a]?.y"
          :x2="nodes[edge.b]?.x"
          :y2="nodes[edge.b]?.y"
          :stroke="isDark ? 'rgba(200, 211, 224, 0.15)' : 'rgba(30, 58, 95, 0.12)'"
          stroke-width="1"
        />
      </g>

      <!-- 流动光点层 -->
      <g v-if="flowDots" class="flow-layer">
        <circle
          v-for="(p, i) in flowParticles"
          :key="`flow-${i}`"
          r="2"
          fill="#00d4aa"
          opacity="0.7"
        >
          <animateMotion
            :dur="`${p.duration}s`"
            :begin="`${p.delay}s`"
            repeatCount="indefinite"
            :path="`M ${nodes[p.a]?.x} ${nodes[p.a]?.y} L ${nodes[p.b]?.x} ${nodes[p.b]?.y}`"
          />
          <animate
            attributeName="opacity"
            values="0;0.8;0.8;0"
            :dur="`${p.duration}s`"
            :begin="`${p.delay}s`"
            repeatCount="indefinite"
          />
        </circle>
      </g>

      <!-- 节点层 -->
      <g class="nodes-layer">
        <g
          v-for="node in nodes"
          :key="`node-${node.id}`"
          :transform="`translate(${node.x}, ${node.y})`"
          :class="{ active: activeNodes.includes(node.id) }"
        >
          <!-- 辉光（活跃节点）-->
          <circle
            v-if="activeNodes.includes(node.id)"
            r="16"
            fill="url(#node-active-glow)"
            class="active-glow"
          />
          <!-- 节点本体 -->
          <circle
            :r="node.r"
            :fill="activeNodes.includes(node.id) ? '#00d4aa' : (isDark ? '#c8d3e0' : '#1e3a5f')"
            :opacity="activeNodes.includes(node.id) ? 1 : 0.5"
            class="node-circle"
          />
          <!-- 漂浮动画包裹 -->
          <animateTransform
            attributeName="transform"
            type="translate"
            :values="`${node.x},${node.y}; ${node.x + node.driftX},${node.y + node.driftY}; ${node.x},${node.y}`"
            :dur="`${node.driftDuration}s`"
            :begin="`${node.driftDelay}s`"
            repeatCount="indefinite"
            additive="sum"
          />
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.knowledge-graph {
  position: absolute;
  inset: 0;
  z-index: var(--z-bg);
  pointer-events: none;
  overflow: hidden;
}

.graph-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.node-circle {
  transition: opacity var(--duration-base) var(--ease-out);
}

.active-glow {
  animation: pulse-glow 3s ease-in-out infinite;
  transform-origin: center;
}

@keyframes pulse-glow {
  0%, 100% {
    opacity: 0.5;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.4);
  }
}
</style>
