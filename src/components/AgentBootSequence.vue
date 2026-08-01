<script setup>
// ============================================================
// AgentBootSequence — Agent 启动序列动画
// ============================================================
// 点击 TopBar 任一 Agent 进入聊天时，先展示启动序列：
// "Tutor Agent 已启动，正在执行：✓ 加载学生画像 ✓ 检索半导体知识库 ..."
// 逐项打勾动画（每步 300-500ms）完成后进入对话
// 8 个 Agent 各自配一套符合其职能的步骤文案
// ============================================================

import { ref, computed, onMounted, onUnmounted } from 'vue'
import AgentIcon from './AgentIcon.vue'

const props = defineProps({
  agentKey: { type: String, default: 'tutor' }
})

const emit = defineEmits(['done'])

// 8 个 Agent 的元数据 + 启动步骤文案
const AGENT_BOOT_CONFIG = {
  tutor: {
    label: 'Tutor Agent',
    cn: '导师',
    color: '#00d4aa',
    steps: [
      '加载学生画像',
      '检索半导体知识库',
      '分析知识缺口',
      '生成教学反馈'
    ]
  },
  diagnose: {
    label: 'Diagnosis Agent',
    cn: '诊断',
    color: '#4d9de0',
    steps: [
      '加载学生画像',
      '检索错题记录与诊断历史',
      '执行 4 层根因分析',
      '生成结构化诊断报告'
    ]
  },
  planner: {
    label: 'Planner Agent',
    cn: '规划',
    color: '#ffd166',
    steps: [
      '加载学生画像',
      '读取最新诊断结果',
      '计算复习优先级矩阵',
      '生成动态周计划'
    ]
  },
  career: {
    label: 'Career Agent',
    cn: '就业',
    color: '#9b59b6',
    steps: [
      '加载学生画像',
      '检索行业就业数据库',
      '分析岗位匹配度',
      '生成就业路径推荐'
    ]
  },
  practice: {
    label: 'Practice Agent',
    cn: '练习',
    color: '#e74c3c',
    steps: [
      '加载学生画像',
      '识别薄弱知识点',
      '检索题库资源',
      '生成针对性练习题'
    ]
  },
  peer: {
    label: 'Peer Agent',
    cn: '同伴',
    color: '#3498db',
    steps: [
      '加载学生画像',
      '检索同伴数据库',
      '计算学习风格匹配度',
      '生成互助学习推荐'
    ]
  },
  admission: {
    label: 'Admission Agent',
    cn: '择校',
    color: '#ff6b6b',
    steps: [
      '加载学生画像',
      '检索院校录取数据库',
      '计算录取概率模型',
      '生成院校推荐方案'
    ]
  },
  research: {
    label: 'Research Agent',
    cn: '科研',
    color: '#e67e22',
    steps: [
      '加载学生画像',
      '检索科研论文库',
      '分析研究方向趋势',
      '生成科研成长路线图'
    ]
  }
}

const config = computed(() => AGENT_BOOT_CONFIG[props.agentKey] || AGENT_BOOT_CONFIG.tutor)

// 当前已完成的步骤数
const completedSteps = ref(0)
// 是否正在执行
const isRunning = ref(true)
// 是否已淡出
const isFading = ref(false)

let stepTimer = null
let fadeTimer = null

onMounted(() => {
  runSequence()
})

onUnmounted(() => {
  clearTimeout(stepTimer)
  clearTimeout(fadeTimer)
})

function runSequence() {
  const totalSteps = config.value.steps.length
  let current = 0

  function nextStep() {
    if (current >= totalSteps) {
      // 全部完成，短暂停留后淡出
      isRunning.value = false
      fadeTimer = setTimeout(() => {
        isFading.value = true
        setTimeout(() => {
          emit('done')
        }, 400)
      }, 500)
      return
    }
    current++
    completedSteps.value = current
    // 每步 300-500ms 随机
    const delay = 300 + Math.random() * 200
    stepTimer = setTimeout(nextStep, delay)
  }

  // 首步稍快
  stepTimer = setTimeout(nextStep, 200)
}
</script>

<template>
  <div class="boot-overlay" :class="{ fading: isFading }">
    <div class="boot-container">
      <!-- Agent 标识 -->
      <div class="boot-header">
        <div class="boot-icon-wrap" :style="{ '--agent-color': config.color }">
          <AgentIcon :type="agentKey" :agent-color="config.color" :icon-size="28" />
        </div>
        <div class="boot-title-block">
          <div class="boot-label">{{ config.label }}</div>
          <div class="boot-status">
            <span class="boot-dot" :class="{ pulsing: isRunning }"></span>
            <span v-if="isRunning">已启动，正在执行…</span>
            <span v-else>启动完成</span>
          </div>
        </div>
      </div>

      <!-- 步骤列表 -->
      <div class="boot-steps">
        <div
          v-for="(step, i) in config.steps"
          :key="i"
          class="boot-step"
          :class="{
            done: i < completedSteps,
            active: i === completedSteps && isRunning,
            pending: i > completedSteps
          }"
        >
          <span class="step-check">
            <svg v-if="i < completedSteps" viewBox="0 0 20 20" class="check-svg">
              <path d="M5 10.5l3 3 7-7.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span v-else-if="i === completedSteps && isRunning" class="step-spinner"></span>
            <span v-else class="step-dot"></span>
          </span>
          <span class="step-text">{{ step }}</span>
        </div>
      </div>

      <!-- 进度条 -->
      <div class="boot-progress">
        <div class="progress-track">
          <div
            class="progress-fill"
            :style="{
              width: (completedSteps / config.steps.length * 100) + '%',
              '--agent-color': config.color
            }"
          ></div>
        </div>
        <span class="progress-count">{{ completedSteps }}/{{ config.steps.length }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.boot-overlay {
  position: absolute;
  inset: 0;
  z-index: var(--z-modal, 100);
  background: var(--color-bg-base, #f4f6fa);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  animation: boot-fade-in 0.3s var(--ease-out, ease) both;
  transition: opacity 0.4s ease;
}

.boot-overlay.fading {
  opacity: 0;
  pointer-events: none;
}

@keyframes boot-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.boot-container {
  max-width: 480px;
  width: 100%;
  background: var(--color-bg-elevated, #fff);
  border: 1px solid var(--color-border-subtle, #e2e6ee);
  border-radius: var(--radius-lg, 16px);
  padding: 32px 28px;
  box-shadow: var(--shadow-lg, 0 8px 32px rgba(15, 30, 51, 0.08));
  animation: boot-slide-up 0.4s var(--ease-out, ease) both;
}

@keyframes boot-slide-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* === Agent 标识 === */
.boot-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 28px;
}

.boot-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md, 12px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--agent-color) 12%, transparent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--agent-color) 8%, transparent);
  flex-shrink: 0;
}

.boot-title-block {
  flex: 1;
}

.boot-label {
  font-family: var(--font-mono, monospace);
  font-size: 16px;
  font-weight: 700;
  color: var(--color-ink-900, #0f1e33);
  letter-spacing: 0.5px;
}

.boot-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-fg-secondary, #5a6c80);
  margin-top: 4px;
}

.boot-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--agent-color, #00d4aa);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--agent-color) 20%, transparent);
}

.boot-dot.pulsing {
  animation: boot-pulse 1.2s ease-in-out infinite;
}

@keyframes boot-pulse {
  0%, 100% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--agent-color) 20%, transparent); }
  50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--agent-color) 8%, transparent); }
}

/* === 步骤列表 === */
.boot-steps {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 24px;
}

.boot-step {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm, 8px);
  transition: all 0.3s ease;
}

.boot-step.done {
  background: color-mix(in srgb, var(--agent-color) 4%, transparent);
}

.boot-step.active {
  background: var(--color-bg-sunken, #eef1f6);
}

.boot-step.pending {
  opacity: 0.4;
}

.step-check {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.check-svg {
  width: 18px;
  height: 18px;
  color: var(--agent-color, #00d4aa);
  animation: check-pop 0.3s ease both;
}

@keyframes check-pop {
  from { opacity: 0; transform: scale(0.5); }
  to { opacity: 1; transform: scale(1); }
}

.step-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid color-mix(in srgb, var(--agent-color) 25%, transparent);
  border-top-color: var(--agent-color, #00d4aa);
  border-radius: 50%;
  animation: boot-spin 0.6s linear infinite;
}

@keyframes boot-spin {
  to { transform: rotate(360deg); }
}

.step-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-fg-muted, #9aa8b8);
}

.step-text {
  font-size: 13px;
  color: var(--color-ink-900, #0f1e33);
  font-family: var(--font-mono, monospace);
  letter-spacing: 0.2px;
}

.boot-step.done .step-text {
  color: var(--color-fg-secondary, #5a6c80);
}

/* === 进度条 === */
.boot-progress {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-track {
  flex: 1;
  height: 4px;
  background: var(--color-bg-sunken, #eef1f6);
  border-radius: var(--radius-full, 999px);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--agent-color, #00d4aa);
  border-radius: var(--radius-full, 999px);
  transition: width 0.4s var(--ease-out, ease);
}

.progress-count {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--color-fg-muted, #9aa8b8);
  font-weight: 600;
}

/* === 移动端 === */
@media (max-width: 480px) {
  .boot-container {
    padding: 24px 20px;
  }
  .boot-icon-wrap {
    width: 44px;
    height: 44px;
  }
  .boot-label {
    font-size: 14px;
  }
  .step-text {
    font-size: 12px;
  }
}
</style>
