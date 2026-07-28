<script setup>
import { useRouter } from 'vue-router'
import { computed } from 'vue'

const props = defineProps({
  activeAgent: {
    type: String,
    default: 'tutor'
  }
})

const router = useRouter()

// 5 个 Agent 节点 + 主控编排器中心（v1 正式版：第 5 个 Research）
const agents = [
  {
    key: 'tutor',
    label: '导师',
    en: 'Tutor',
    icon: 'M',
    route: '/',
    color: '#00d4aa',
    desc: '苏格拉底式教学'
  },
  {
    key: 'diagnose',
    label: '诊断',
    en: 'Diagnose',
    icon: 'D',
    route: '/history',
    color: '#4d9de0',
    desc: '4 层根因链'
  },
  {
    key: 'planner',
    label: '规划',
    en: 'Planner',
    icon: 'P',
    route: '/plan',
    color: '#ffd166',
    desc: '动态周计划'
  },
  {
    key: 'admission',
    label: '择校',
    en: 'Admission',
    icon: 'A',
    route: '/',
    color: '#ff6b6b',
    desc: '数据驱动'
  },
  {
    key: 'research',
    label: '科研',
    en: 'Research',
    icon: 'X',
    route: '/chat',
    color: '#e67e22',
    desc: '本科→研究生路线'
  }
]

function go(agent) {
  router.push(agent.route)
}

const activeIndex = computed(() => agents.findIndex((a) => a.key === props.activeAgent))
</script>

<template>
  <header class="top-bar">
    <!-- 左侧：品牌 + 主控编排器中心 -->
    <div class="bar-left">
      <div class="brand">
        <div class="brand-mark">
          <svg viewBox="0 0 40 40" class="brand-svg">
            <!-- 主控中心节点 -->
            <circle cx="20" cy="20" r="4" fill="#0f1e33" />
            <circle cx="20" cy="20" r="10" fill="none" stroke="#0f1e33" stroke-width="0.8" stroke-dasharray="2 3" opacity="0.5">
              <animateTransform attributeName="transform" type="rotate" from="0 20 20" to="360 20 20" dur="20s" repeatCount="indefinite" />
            </circle>
            <!-- 5 个 Agent 卫星（五边形分布） -->
            <circle cx="20" cy="6" r="1.5" fill="#00d4aa" />
            <circle cx="33.3" cy="15.5" r="1.5" fill="#4d9de0" />
            <circle cx="28.2" cy="31.3" r="1.5" fill="#ffd166" />
            <circle cx="11.8" cy="31.3" r="1.5" fill="#ff6b6b" />
            <circle cx="6.7" cy="15.5" r="1.5" fill="#e67e22" />
            <!-- 连线 -->
            <line x1="20" y1="20" x2="20" y2="6" stroke="#0f1e33" stroke-width="0.5" opacity="0.3" />
            <line x1="20" y1="20" x2="33.3" y2="15.5" stroke="#0f1e33" stroke-width="0.5" opacity="0.3" />
            <line x1="20" y1="20" x2="28.2" y2="31.3" stroke="#0f1e33" stroke-width="0.5" opacity="0.3" />
            <line x1="20" y1="20" x2="11.8" y2="31.3" stroke="#0f1e33" stroke-width="0.5" opacity="0.3" />
            <line x1="20" y1="20" x2="6.7" y2="15.5" stroke="#0f1e33" stroke-width="0.5" opacity="0.3" />
          </svg>
        </div>
        <div class="brand-text">
          <div class="brand-name">研芯通</div>
          <div class="brand-sub">工科 AI 导师</div>
        </div>
      </div>
    </div>

    <!-- 中央：Agent 星座导航 -->
    <nav class="agent-constellation">
      <div class="constellation-line" :style="{ '--active-index': activeIndex }"></div>
      <button
        v-for="(agent, i) in agents"
        :key="agent.key"
        class="agent-node"
        :class="{ active: activeAgent === agent.key }"
        :style="{ '--agent-color': agent.color, '--node-index': i }"
        @click="go(agent)"
      >
        <span class="node-orbit">
          <span class="node-dot" :style="{ background: agent.color }"></span>
        </span>
        <span class="node-label">{{ agent.label }}</span>
        <span class="node-en">{{ agent.en }}</span>
      </button>
    </nav>

    <!-- 右侧：状态 + 入口 -->
    <div class="bar-right">
      <div class="status-pill">
        <span class="status-dot"></span>
        <span class="status-text">localhost · dev</span>
      </div>
      <button class="user-entry" title="学生入口">
        <span class="user-avatar">YM</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.top-bar {
  height: 72px;
  padding: 0 32px;
  background: rgba(244, 246, 250, 0.85);
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--color-border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
}

/* === 左侧品牌 === */
.bar-left {
  display: flex;
  align-items: center;
  flex: 1;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-svg {
  width: 100%;
  height: 100%;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}

.brand-name {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
  color: var(--color-ink-900);
  letter-spacing: 0.5px;
}

.brand-sub {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-ink-300);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-top: 2px;
}

/* === 中央 Agent 星座 === */
.agent-constellation {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  padding: 6px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-sm);
}

.agent-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: transparent;
  border: none;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-out);
  position: relative;
}

.agent-node:hover {
  background: var(--color-bg-sunken);
}

.agent-node.active {
  background: var(--color-bg-base);
  box-shadow: var(--shadow-xs);
}

.node-orbit {
  position: relative;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.node-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: all var(--duration-base) var(--ease-out);
  box-shadow: 0 0 0 0 transparent;
}

.agent-node.active .node-dot {
  width: 10px;
  height: 10px;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--agent-color) 20%, transparent);
}

.agent-node:hover .node-dot {
  transform: scale(1.2);
}

.node-label {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-fg-secondary);
  transition: color var(--duration-base) var(--ease-out);
}

.agent-node.active .node-label {
  color: var(--color-fg-primary);
}

.node-en {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.agent-node.active .node-en {
  color: var(--color-ink-500);
}

/* === 右侧 === */
.bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  justify-content: flex-end;
}

.status-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--color-success-bg);
  border: 1px solid color-mix(in srgb, var(--color-success) 30%, transparent);
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-ink-700);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 0 3px rgba(0, 212, 170, 0.2);
  animation: pulse-node 2s ease-in-out infinite;
}

.user-entry {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid var(--color-border-default);
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-base) var(--ease-out);
}

.user-entry:hover {
  border-color: var(--color-ink-700);
  background: var(--color-bg-elevated);
}

.user-avatar {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--color-ink-700);
  letter-spacing: 0.5px;
}
</style>
