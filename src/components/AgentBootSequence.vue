<script setup>
// ============================================================
// AgentBootSequence — Agent 启动序列（spec 对齐版）
// ============================================================
// 垂直步骤列表（左侧进度线 + 三态圆点：空心→spinner→checkmark）
// 每步 400ms + 步骤间 100ms，4 步总时长约 2s
// 完成后淡出 300ms 过渡到聊天界面
// ============================================================

import { ref, computed, onMounted, onUnmounted } from 'vue'
import AgentIcon from './AgentIcon.vue'

const props = defineProps({
  agentKey: { type: String, default: 'tutor' }
})

const emit = defineEmits(['done'])

// 8 个 Agent 的启动步骤文案（spec 版）
const AGENT_BOOT_CONFIG = {
  tutor: {
    label: 'Tutor Agent',
    color: '#00d4aa',
    steps: ['加载学生画像', '检索半导体知识库', '分析知识缺口', '生成教学反馈']
  },
  diagnose: {
    label: 'Diagnosis Agent',
    color: '#4d9de0',
    steps: ['加载答题记录', '构建能力星图', '定位薄弱知识点', '生成诊断报告']
  },
  planner: {
    label: 'Planner Agent',
    color: '#ffd166',
    steps: ['读取诊断结果', '评估时间预算', '匹配学习资源', '生成周计划']
  },
  career: {
    label: 'Career Agent',
    color: '#9b59b6',
    steps: ['分析专业背景', '检索岗位数据库', '匹配能力缺口', '生成职业路径']
  },
  practice: {
    label: 'Practice Agent',
    color: '#e74c3c',
    steps: ['定位薄弱知识点', '检索题库', '生成个性化题目', '评估难度适配']
  },
  peer: {
    label: 'Peer Agent',
    color: '#3498db',
    steps: ['分析学习特征', '检索同伴库', '匹配互补画像', '推荐学习伙伴']
  },
  admission: {
    label: 'Admission Agent',
    color: '#ff6b6b',
    steps: ['读取学生画像', '检索院校数据库', '匹配录取概率', '生成择校方案']
  },
  research: {
    label: 'Research Agent',
    color: '#e67e22',
    steps: ['分析学术兴趣', '检索研究方向', '规划科研路线', '生成成长路径']
  }
}

const config = computed(() => AGENT_BOOT_CONFIG[props.agentKey] || AGENT_BOOT_CONFIG.tutor)

const completedSteps = ref(0)
const isRunning = ref(true)
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
      isRunning.value = false
      // 完成后淡出 300ms
      fadeTimer = setTimeout(() => {
        isFading.value = true
        setTimeout(() => emit('done'), 300)
      }, 300)
      return
    }
    current++
    completedSteps.value = current
    // 每步 400ms + 步骤间 100ms = 500ms 间隔
    stepTimer = setTimeout(nextStep, 500)
  }

  stepTimer = setTimeout(nextStep, 200)
}

// 跳过：立即结束动画进入目标页（即使首次进入也尊重用户选择权）
function skip() {
  clearTimeout(stepTimer)
  clearTimeout(fadeTimer)
  isRunning.value = false
  isFading.value = true
  setTimeout(() => emit('done'), 150)
}
</script>

<template>
  <div class="boot-overlay" :class="{ fading: isFading }">
    <div class="boot-sequence">
      <!-- Agent 标识 -->
      <div class="boot-header">
        <div class="boot-icon" :style="{ '--agent-color': config.color }">
          <AgentIcon :type="agentKey" :agent-color="config.color" :icon-size="22" />
        </div>
        <div>
          <h3 class="boot-title">{{ config.label }}</h3>
          <p class="boot-subtitle">
            {{ isRunning ? '已启动，正在执行…' : '启动完成' }}
          </p>
        </div>
      </div>

      <!-- 步骤列表（左侧进度线 + 三态圆点） -->
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
          <span class="boot-step__dot"></span>
          <span class="boot-step__label">{{ step }}</span>
        </div>
      </div>

      <!-- 进度条 -->
      <div class="boot-progress">
        <div
          class="boot-progress__bar"
          :style="{ width: (completedSteps / config.steps.length * 100) + '%' }"
        ></div>
      </div>
    </div>

    <!-- 跳过按钮（遮罩右下角，克制的文字按钮） -->
    <button v-if="!isFading" class="boot-skip" @click="skip">
      跳过 →
    </button>
  </div>
</template>

<style scoped>
.boot-overlay {
  position: absolute;
  inset: 0;
  z-index: var(--z-modal, 1000);
  background: var(--color-bg-base, #f4f6fa);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  animation: boot-fade-in 0.3s ease both;
  transition: opacity 0.3s ease;
}

.boot-overlay.fading {
  opacity: 0;
  pointer-events: none;
}

@keyframes boot-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.boot-sequence {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 40px 24px;
  width: 100%;
  max-width: 480px;
}

/* === Agent 标识 === */
.boot-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
}

.boot-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--agent-color) 12%, transparent);
}

.boot-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-ink-900, #0f1e33);
  margin: 0;
}

.boot-subtitle {
  font-size: 13px;
  color: var(--color-fg-tertiary, #7a8ba3);
  margin: 2px 0 0;
}

/* === 步骤列表 === */
.boot-steps {
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
  width: 100%;
  max-width: 360px;
}

/* 左侧竖线 */
.boot-steps::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 16px;
  bottom: 16px;
  width: 2px;
  background: var(--color-border-subtle, #e3e8f0);
}

.boot-step {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
  position: relative;
}

/* 三态圆点 */
.boot-step__dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--color-border-subtle, #e3e8f0);
  background: var(--color-bg-elevated, #fff);
  flex-shrink: 0;
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s ease, background 0.2s ease;
}

/* 执行中：spinner */
.boot-step.active .boot-step__dot {
  border-color: var(--color-ink-700, #1e3a5f);
}

.boot-step.active .boot-step__dot::after {
  content: '';
  width: 8px;
  height: 8px;
  border: 2px solid transparent;
  border-top-color: var(--color-ink-700, #1e3a5f);
  border-radius: 50%;
  animation: boot-spin 0.6s linear infinite;
}

@keyframes boot-spin {
  to { transform: rotate(360deg); }
}

/* 完成：checkmark */
.boot-step.done .boot-step__dot {
  border-color: var(--color-success, #00d4aa);
  background: var(--color-success, #00d4aa);
}

.boot-step.done .boot-step__dot::after {
  content: '✓';
  color: white;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

/* 步骤文案 */
.boot-step__label {
  font-size: 14px;
  color: var(--color-fg-tertiary, #7a8ba3);
  transition: color 0.2s ease;
}

.boot-step.active .boot-step__label {
  color: var(--color-ink-900, #0f1e33);
  font-weight: 500;
}

.boot-step.done .boot-step__label {
  color: var(--color-fg-secondary, #3d5a80);
}

/* === 底部进度条 === */
.boot-progress {
  width: 100%;
  max-width: 360px;
  height: 3px;
  background: var(--color-border-subtle, #e3e8f0);
  border-radius: 2px;
  margin-top: 24px;
  overflow: hidden;
}

.boot-progress__bar {
  height: 100%;
  background: linear-gradient(
    to right,
    var(--color-ink-700, #1e3a5f),
    var(--color-success, #00d4aa)
  );
  border-radius: 2px;
  transition: width 0.4s ease;
}

/* === 跳过按钮（遮罩右下角 · 克制文字按钮） === */
.boot-skip {
  position: absolute;
  right: 32px;
  bottom: 28px;
  padding: 8px 14px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm, 8px);
  font-family: var(--font-serif, serif);
  font-size: 13px;
  color: var(--color-fg-tertiary, #7a8ba3);
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease;
}

.boot-skip:hover {
  color: var(--color-ink-900, #0f1e33);
  background: var(--color-bg-sunken, #e9edf3);
}

.boot-skip:focus-visible {
  outline: 2px solid var(--color-ink-700, #1e3a5f);
  outline-offset: 2px;
}

/* === 移动端 === */
@media (max-width: 480px) {
  .boot-sequence {
    min-height: 320px;
    padding: 24px 16px;
  }
  .boot-icon {
    width: 36px;
    height: 36px;
  }
  .boot-title {
    font-size: 14px;
  }
  .boot-step__label {
    font-size: 13px;
  }
}
</style>
