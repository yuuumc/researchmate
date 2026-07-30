<script setup>
import { ref, nextTick, watch, computed, onMounted } from 'vue'
import { route } from '@/core/router'
import { callChatWithMode } from '@/api/agent'
import { useTraceStore } from '@/stores/trace'
import { useProfileStore } from '@/stores/profile'
import {
  saveRecent,
  loadRecent,
  clearExpiredRecent,
  archiveAll,
  loadAll,
  listMonths
} from '@/utils/persist'
import KnowledgeGraph from './KnowledgeGraph.vue'
import MarkdownRenderer from './MarkdownRenderer.vue'
import DiagnosisReport from './DiagnosisReport.vue'
import PlanCard from './PlanCard.vue'
import AdmissionCard from './AdmissionCard.vue'
import ResearchCard from './ResearchCard.vue'
import KnowledgePathCard from './KnowledgePathCard.vue'
import AgentTrace from './AgentTrace.vue'

const messages = ref([])
const inputText = ref('')
const loading = ref(false)
const chatBodyRef = ref(null)

// v2.0: 当前流式响应的 AbortController
let currentAbort = null
let currentAssistantIndex = -1

// v1.5: 对话历史持久化
const profileStore = useProfileStore()
const userId = computed(() => profileStore.profile?.user_id || 'default')
const restoredBanner = ref(null)
const availableMonths = ref([])
const loadingEarlier = ref(false)
let saveTimer = null

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (messages.value.length === 0) return
    saveRecent(userId.value, messages.value)
    archiveAll(userId.value, messages.value)
  }, 600)
}

async function refreshMonths() {
  const months = await listMonths(userId.value)
  availableMonths.value = months
}

async function loadEarlier() {
  if (loadingEarlier.value) return
  loadingEarlier.value = true
  try {
    const all = await loadAll(userId.value)
    if (Array.isArray(all) && all.length > 0) {
      const existing = new Set(messages.value.map((m) => `${m.role}:${m.timestamp}:${m.content?.slice(0, 50)}`))
      const earlier = all.filter((m) => !existing.has(`${m.role}:${m.timestamp}:${m.content?.slice(0, 50)}`))
      if (earlier.length > 0) {
        messages.value = [...earlier, ...messages.value]
        scheduleSave()
        restoredBanner.value = { count: earlier.length, fromCache: true }
      } else {
        restoredBanner.value = { count: 0, fromCache: true, noop: true }
      }
      setTimeout(() => { restoredBanner.value = null }, 3000)
    }
  } catch (e) {
    console.error('[ChatWindow] loadEarlier failed:', e)
  } finally {
    loadingEarlier.value = false
  }
}

onMounted(() => {
  clearExpiredRecent()
  const restored = loadRecent(userId.value)
  if (Array.isArray(restored) && restored.length > 0) {
    messages.value = restored
    restoredBanner.value = { count: restored.length, fromCache: false }
    setTimeout(() => { restoredBanner.value = null }, 4000)
  }
  refreshMonths()
})

// Agent Trace
const traceStore = useTraceStore()
const traceExpanded = ref(true)

// v3.1: 聊天模式切换（就业咨询 / 教研答疑 / 智能路由）
const chatMode = ref('')  // '' | 'employment' | 'taoyan'
const modeOptions = [
  { value: '', label: '智能路由', en: 'Auto', icon: '◎' },
  { value: 'employment', label: '就业咨询', en: 'Career', icon: '◈' },
  { value: 'taoyan', label: '教研答疑', en: 'Tutor', icon: '✦' }
]
function selectMode(m) {
  chatMode.value = m
}
// 就业模式需要 profile 字段
const modeProfile = computed(() => {
  if (chatMode.value !== 'employment') return {}
  return {
    target_school: profileStore.profile?.target_school || '',
    target_major: profileStore.profile?.target_major || profileStore.profile?.major || ''
  }
})

const agentMeta = {
  tutor: { label: '导师', en: 'Tutor', color: '#00d4aa' },
  diagnose: { label: '诊断', en: 'Diagnose', color: '#4d9de0' },
  planner: { label: '规划', en: 'Planner', color: '#ffd166' },
  career: { label: '择校', en: 'Admission', color: '#ff6b6b' },
  research: { label: '科研', en: 'Research', color: '#e67e22' },
  cascade: { label: '级联', en: 'Cascade', color: '#1e3a5f' },
  concept: { label: '导师', en: 'Tutor', color: '#00d4aa' },
  plan: { label: '规划', en: 'Planner', color: '#ffd166' }
}

const quickActions = [
  {
    icon: 'M', title: '概念引导', en: 'Concept', desc: '苏格拉底式教学',
    text: 'MOSFET 阈值电压怎么推导？', color: '#00d4aa', agent: 'tutor'
  },
  {
    icon: 'D', title: '学习诊断', en: 'Diagnose', desc: '4 层根因链',
    text: '我半导体物理考了 55 分，第 5-7 章错了 4 题', color: '#4d9de0', agent: 'diagnose'
  },
  {
    icon: 'P', title: '成长规划', en: 'Planner', desc: '动态周计划',
    text: '帮我做下个月复习计划', color: '#ffd166', agent: 'planner'
  },
  {
    icon: 'A', title: '考研导航', en: 'Admission', desc: '数据驱动择校',
    color: '#ff6b6b', agent: 'career',
    text: '我双非前 30%，想去长三角读微电子'
  },
  {
    icon: 'X', title: '科研成长', en: 'Research', desc: '本科→研究生路线',
    color: '#e67e22', agent: 'research',
    text: '我以后想做 AI 芯片，需要准备什么？给我一个科研路线图'
  }
]

async function scrollToBottom() {
  await nextTick()
  if (chatBodyRef.value) {
    chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight
  }
}

function cancelCurrentStream() {
  if (currentAbort) {
    try { currentAbort.abort() } catch (_) { /* noop */ }
    currentAbort = null
  }
  if (currentAssistantIndex >= 0 && messages.value[currentAssistantIndex]) {
    const msg = messages.value[currentAssistantIndex]
    if (msg.streaming && (!msg.content || msg.content.length === 0)) {
      messages.value.splice(currentAssistantIndex, 1)
    } else if (msg.streaming) {
      msg.streaming = false
      msg.cancelled = true
    }
  }
  loading.value = false
  currentAssistantIndex = -1
}

async function send(text) {
  const content = (text ?? inputText.value).trim()
  if (!content || loading.value) return

  messages.value.push({
    role: 'user',
    content,
    timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false })
  })
  inputText.value = ''
  loading.value = true
  await scrollToBottom()

  // v2.0: 推入空 assistant 占位，route() 通过 onToken 实时写入
  const assistantIdx = messages.value.length
  messages.value.push({
    role: 'assistant',
    content: '',
    agent: null,
    streaming: true,
    timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false })
  })
  currentAssistantIndex = assistantIdx
  currentAbort = new AbortController()

  try {
    let result

    if (chatMode.value) {
      // v3.1: 指定模式 → 绕过 intent 路由，直调 /api/chat with mode
      const replyContent = await callChatWithMode(content, {
        mode: chatMode.value,
        profile: modeProfile.value,
        onToken: (chunk) => {
          const msg = messages.value[assistantIdx]
          if (msg) {
            msg.content = (msg.content || '') + (chunk.delta || '')
          }
        },
        signal: currentAbort.signal
      })
      result = {
        content: replyContent,
        agent: chatMode.value === 'employment' ? 'admission' : 'tutor',
        intent: chatMode.value
      }
    } else {
      // 默认：走 intent 路由 + Agent 编排
      result = await route(content, {
        onToken: (chunk) => {
          const msg = messages.value[assistantIdx]
          if (msg) {
            msg.content = (msg.content || '') + (chunk.delta || '')
          }
        },
        signal: currentAbort.signal
      })
    }

    const finalMsg = messages.value[assistantIdx] || {}
    messages.value[assistantIdx] = {
      ...finalMsg,
      role: 'assistant',
      content: result.content || finalMsg.content || '（无回复）',
      agent: result.agent || result.intent,
      intent: result.intent,
      structured: result.structured,
      rag_slices: result.rag_slices,
      knowledge_path: result.knowledge_path,
      timestamp: finalMsg.timestamp || new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      streaming: false,
      error: result.error
    }
  } catch (e) {
    const finalMsg = messages.value[assistantIdx] || {}
    if (e.name === 'AbortError' || /aborted/.test(String(e.message || ''))) {
      if (finalMsg && finalMsg.content) {
        messages.value[assistantIdx] = { ...finalMsg, streaming: false, cancelled: true }
      } else {
        messages.value.splice(assistantIdx, 1)
      }
    } else {
      messages.value[assistantIdx] = {
        ...finalMsg,
        role: 'assistant',
        content: 'AI 服务暂不可用，请稍后再试。错误信息：' + e.message,
        streaming: false,
        error: true,
        agent: 'system',
        timestamp: finalMsg.timestamp || new Date().toLocaleTimeString('zh-CN', { hour12: false })
      }
    }
  } finally {
    loading.value = false
    currentAbort = null
    currentAssistantIndex = -1
    await scrollToBottom()
  }
}

function handleQuickAction(action) {
  send(action.text)
}

function handleEnter(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function getAgentMeta(agent) {
  return agentMeta[agent] || { label: '系统', en: 'System', color: '#7a8ba3' }
}

watch(messages, scrollToBottom, { deep: true })
watch(messages, scheduleSave, { deep: true })
</script>

<template>
  <div class="chat-window">
    <div ref="chatBodyRef" class="chat-body">
      <div v-if="restoredBanner" class="restored-banner" :class="{ noop: restoredBanner.noop }">
        <span v-if="restoredBanner.noop">没有更早的历史可加载</span>
        <span v-else-if="restoredBanner.fromCache">
          ✓ 已加载更早的 {{ restoredBanner.count }} 条对话
        </span>
        <span v-else>
          ✓ 已恢复最近 {{ restoredBanner.count }} 条对话（7 天内）
        </span>
        <button v-if="!restoredBanner.fromCache && availableMonths.length > 0" class="banner-cta" @click="loadEarlier" :disabled="loadingEarlier">
          {{ loadingEarlier ? '加载中…' : '加载更早历史' }}
        </button>
      </div>

      <div v-if="messages.length === 0" class="hero-screen">
        <KnowledgeGraph :node-count="22" :flow-dots="true" />

        <div class="hero-content">
          <div class="hero-eyebrow">
            <span class="dot"></span>
            <span class="text">ResearchKit OS · 5 Agents Online</span>
          </div>

          <h1 class="hero-title">
            <span class="title-line">你今天想攻克</span>
            <span class="title-line title-accent">哪个考点？</span>
          </h1>

          <p class="hero-subtitle">
            4 个 Agent 协同 · 知识图谱驱动 · 苏格拉底式引导
          </p>

          <div class="quick-actions">
            <button
              v-for="action in quickActions"
              :key="action.title"
              class="quick-card"
              :style="{ '--card-color': action.color }"
              @click="handleQuickAction(action)"
            >
              <div class="qc-header">
                <div class="qc-icon">{{ action.icon }}</div>
                <div class="qc-meta">
                  <div class="qc-title">{{ action.title }}</div>
                  <div class="qc-en">{{ action.en }}</div>
                </div>
              </div>
              <div class="qc-desc">{{ action.desc }}</div>
              <div class="qc-path">
                <span class="path-prompt">▸</span>
                <span class="path-text">{{ action.text }}</span>
                <span class="path-action">↵</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div v-else class="message-list">
        <div
          v-for="(msg, i) in messages"
          :key="i"
          class="message"
          :class="[msg.role, { streaming: msg.streaming, cancelled: msg.cancelled, error: msg.error }]"
        >
          <div class="msg-axis">
            <div class="axis-node" :class="msg.role" :style="msg.role === 'assistant' ? { '--node-color': getAgentMeta(msg.agent).color } : {}"></div>
            <div v-if="i < messages.length - 1 || loading" class="axis-line"></div>
          </div>

          <div class="msg-body">
            <div class="msg-meta">
              <span v-if="msg.role === 'assistant'" class="meta-agent" :style="{ '--agent-color': getAgentMeta(msg.agent).color }">
                <span class="agent-dot" :class="{ pulsing: msg.streaming }"></span>
                {{ getAgentMeta(msg.agent).label }}
                <span class="agent-en">{{ getAgentMeta(msg.agent).en }}</span>
                <span v-if="msg.streaming" class="meta-streaming">输入中…</span>
                <span v-else-if="msg.cancelled" class="meta-cancelled">已取消</span>
              </span>
              <span v-else class="meta-user">你</span>
              <span class="meta-time">{{ msg.timestamp }}</span>
              <button
                v-if="msg.streaming && i === messages.length - 1"
                class="cancel-btn"
                @click="cancelCurrentStream"
                title="取消生成"
              >×</button>
            </div>

            <div class="msg-content">
              <div v-if="msg.role === 'user'" class="user-bubble">{{ msg.content }}</div>

              <div v-else class="assistant-bubble" :class="{ error: msg.error, cancelled: msg.cancelled, streaming: msg.streaming }">
                <MarkdownRenderer :content="msg.content" />

                <div v-if="msg.knowledge_path" class="agent-card knowledge-path-wrap">
                  <KnowledgePathCard :path="msg.knowledge_path" />
                </div>

                <div v-if="msg.intent === 'diagnose' && msg.structured" class="agent-card">
                  <div class="card-label">
                    <span class="label-dot"></span>
                    结构化诊断报告
                  </div>
                  <DiagnosisReport :report="msg.structured" />
                </div>
                <div v-else-if="msg.intent === 'plan' && msg.structured" class="agent-card">
                  <div class="card-label">
                    <span class="label-dot"></span>
                    结构化复习计划
                  </div>
                  <PlanCard :plan="msg.structured" />
                </div>
                <div v-else-if="msg.intent === 'admission' && msg.structured" class="agent-card">
                  <div class="card-label">
                    <span class="label-dot"></span>
                    院校推荐（数据来自本地）
                  </div>
                  <AdmissionCard :recommendations="msg.structured.recommendations || []" />
                </div>
                <div v-else-if="msg.intent === 'research' && msg.structured" class="agent-card">
                  <div class="card-label">
                    <span class="label-dot" style="background: #e67e22; box-shadow: 0 0 0 3px rgba(230, 126, 34, 0.18);"></span>
                    科研成长路线图
                  </div>
                  <ResearchCard :data="msg.structured" />
                </div>

                <template v-else-if="msg.intent === 'cascade' && msg.structured">
                  <div v-if="msg.structured.diagnose" class="agent-card cascade-card">
                    <div class="card-label">
                      <span class="label-dot" style="background: var(--color-node-warn); box-shadow: 0 0 0 3px rgba(255, 209, 102, 0.15);"></span>
                      第一步 · 结构化诊断报告
                    </div>
                    <DiagnosisReport :report="msg.structured.diagnose" />
                  </div>
                  <div v-if="msg.structured.plan" class="agent-card cascade-card">
                    <div class="card-label">
                      <span class="label-dot"></span>
                      第二步 · 结构化复习计划
                    </div>
                    <PlanCard :plan="msg.structured.plan" />
                  </div>
                </template>

                <details v-if="msg.rag_slices?.length" class="rag-panel">
                  <summary>
                    <span class="rag-icon">◈</span>
                    知识库引用
                    <span class="rag-count">{{ msg.rag_slices.length }}</span>
                  </summary>
                  <ol class="rag-list">
                    <li v-for="(slice, idx) in msg.rag_slices" :key="idx">
                      <div class="rag-source">
                        <span class="source-node"></span>
                        {{ slice.source || slice.id }}
                      </div>
                      <div class="rag-content">{{ slice.content?.slice(0, 180) }}…</div>
                    </li>
                  </ol>
                </details>
              </div>
            </div>
          </div>
        </div>

        <div v-if="loading && messages.length === 0" class="message assistant">
          <div class="msg-axis">
            <div class="axis-node assistant loading-node"></div>
          </div>
          <div class="msg-body">
            <div class="msg-meta">
              <span class="meta-agent">
                <span class="agent-dot pulsing"></span>
                thinking
              </span>
            </div>
            <div class="msg-content">
              <div class="assistant-bubble loading-bubble">
                <span class="think-dot"></span>
                <span class="think-dot"></span>
                <span class="think-dot"></span>
                <span class="think-text">推理中…</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="traceStore.hasTraces" class="trace-panel">
      <AgentTrace
        :expanded="traceExpanded"
        :collapsible="true"
        @toggle="traceExpanded = $event"
      />
    </div>

    <div class="chat-input">
      <!-- v3.1: 模式切换器 -->
      <div class="mode-selector">
        <button
          v-for="opt in modeOptions"
          :key="opt.value"
          class="mode-btn"
          :class="{ active: chatMode === opt.value }"
          @click="selectMode(opt.value)"
        >
          <span class="mode-icon">{{ opt.icon }}</span>
          <span class="mode-label">{{ opt.label }}</span>
        </button>
      </div>
      <div class="input-wrapper">
        <span class="input-prompt">▸</span>
        <textarea
          v-model="inputText"
          class="input-textarea"
          placeholder="输入你的问题（Enter 发送 / Shift+Enter 换行）…"
          rows="1"
          :disabled="loading"
          @keydown="handleEnter"
        />
        <button
          class="send-btn"
          :disabled="!inputText.trim() && !loading"
          @click="loading ? cancelCurrentStream() : send()"
        >
          <span class="send-text">{{ loading ? '取消' : '发送' }}</span>
          <span class="send-arrow">{{ loading ? '×' : '↵' }}</span>
        </button>
      </div>
      <div class="input-hint">
        <span class="hint-item"><span class="kbd">Enter</span> 发送</span>
        <span class="hint-item"><span class="kbd">Shift</span>+<span class="kbd">Enter</span> 换行</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-window {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 72px - 0px);
  max-width: 1080px;
  margin: 0 auto;
  background: transparent;
  position: relative;
}

.chat-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 32px;
}

.hero-screen {
  position: relative;
  min-height: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: visible;
  padding: 48px 0 32px;
}

.hero-content {
  position: relative;
  z-index: var(--z-base);
  max-width: 880px;
  width: 100%;
  text-align: center;
  animation: float-up 0.6s var(--ease-out) both;
}

.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-ink-500);
  letter-spacing: 0.5px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-xs);
}

.hero-eyebrow .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-node-active);
  box-shadow: 0 0 0 3px rgba(0, 212, 170, 0.2);
  animation: pulse-node 2s ease-in-out infinite;
}

.hero-title {
  font-family: var(--font-serif);
  font-size: 44px;
  font-weight: 700;
  line-height: 1.15;
  margin: 0 0 16px;
  letter-spacing: 1px;
}

.title-line {
  display: block;
  color: var(--color-ink-900);
}

.title-accent {
  color: transparent;
  background: linear-gradient(135deg, var(--color-ink-700) 0%, var(--color-node-active) 100%);
  -webkit-background-clip: text;
  background-clip: text;
}

.hero-subtitle {
  font-size: 15px;
  color: var(--color-fg-secondary);
  margin: 0 0 40px;
  letter-spacing: 0.5px;
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  text-align: left;
}

.quick-card {
  padding: 18px 20px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  cursor: pointer;
  text-align: left;
  transition: all var(--duration-base) var(--ease-out);
  position: relative;
  overflow: hidden;
}

.quick-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--card-color) 0%, transparent 60%);
  opacity: 0;
  transition: opacity var(--duration-base) var(--ease-out);
  pointer-events: none;
}

.quick-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-lg);
  border-color: var(--card-color);
}

.quick-card:hover::before {
  opacity: 0.06;
}

.qc-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.qc-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--card-color) 12%, transparent);
  color: var(--card-color);
  border-radius: var(--radius-md);
  font-family: var(--font-serif);
  font-weight: 700;
  font-size: 16px;
}

.qc-meta { flex: 1; }

.qc-title {
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 700;
  color: var(--color-ink-900);
}

.qc-en {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-tertiary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.qc-desc {
  font-size: 12px;
  color: var(--color-fg-secondary);
  margin-bottom: 10px;
}

.qc-path {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: color-mix(in srgb, var(--card-color) 8%, var(--color-bg-sunken));
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-ink-700);
  border-left: 2px solid var(--card-color);
  transition: all var(--duration-base) var(--ease-out);
  position: relative;
  overflow: hidden;
}

.qc-path::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--card-color) 50%, transparent), transparent);
  opacity: 0.6;
}

.path-prompt {
  color: var(--card-color);
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
  transition: transform var(--duration-base) var(--ease-out);
}

.path-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.2px;
}

.path-action {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-fg-muted);
  opacity: 0;
  transform: translateX(-4px);
  transition: all var(--duration-base) var(--ease-out);
  flex-shrink: 0;
}

.quick-card:hover .qc-path {
  background: color-mix(in srgb, var(--card-color) 14%, var(--color-bg-sunken));
  border-left-width: 3px;
  padding-left: 11px;
}

.quick-card:hover .path-prompt {
  transform: translateX(2px);
}

.quick-card:hover .path-action {
  opacity: 1;
  transform: translateX(0);
  color: var(--card-color);
}

.message-list {
  display: flex;
  flex-direction: column;
  padding: 24px 0;
  max-width: 880px;
  margin: 0 auto;
}

.message {
  display: flex;
  gap: 14px;
  margin-bottom: 24px;
  animation: node-appear 0.4s var(--ease-out) both;
}

.msg-axis {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 4px;
  width: 14px;
  flex-shrink: 0;
}

.axis-node {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
}

.axis-node.user {
  background: var(--color-ink-700);
  box-shadow: 0 0 0 3px rgba(30, 58, 95, 0.15);
}

.axis-node.assistant {
  background: var(--node-color, var(--color-node-active));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--node-color, var(--color-node-active)) 20%, transparent);
}

.axis-node.loading-node {
  background: var(--color-fg-muted);
  animation: pulse-node 1.2s ease-in-out infinite;
}

.axis-line {
  width: 1px;
  flex: 1;
  background: linear-gradient(180deg, var(--color-border-default) 0%, transparent 100%);
  margin-top: 4px;
  min-height: 16px;
}

.msg-body {
  flex: 1;
  min-width: 0;
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 12px;
}

.meta-agent {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  background: color-mix(in srgb, var(--agent-color, var(--color-ink-500)) 10%, transparent);
  color: var(--agent-color, var(--color-ink-500));
  border-radius: var(--radius-full);
  font-family: var(--font-serif);
  font-weight: 600;
  font-size: 12px;
}

.agent-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--agent-color, var(--color-ink-500));
}

.agent-dot.pulsing {
  animation: pulse-node 1s ease-in-out infinite;
}

.agent-en {
  font-family: var(--font-mono);
  font-size: 10px;
  opacity: 0.7;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.meta-user {
  font-family: var(--font-serif);
  font-weight: 600;
  color: var(--color-ink-700);
  font-size: 12px;
}

.meta-time {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-muted);
}

.user-bubble {
  display: inline-block;
  background: var(--color-ink-900);
  color: var(--color-fg-inverse);
  padding: 12px 16px;
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg);
  font-size: 14px;
  line-height: 1.65;
  max-width: 100%;
  box-shadow: var(--shadow-sm);
}

.assistant-bubble {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  padding: 18px 22px;
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm);
  font-size: 14px;
  line-height: 1.65;
  box-shadow: var(--shadow-sm);
  position: relative;
}

.assistant-bubble.error {
  border-color: var(--color-error);
  background: var(--color-error-bg);
}

.agent-card {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed var(--color-border-default);
}

.cascade-card + .cascade-card {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px dashed var(--color-border-default);
}

.card-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-ink-500);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 12px;
}

.label-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-node-active);
  box-shadow: 0 0 0 3px rgba(0, 212, 170, 0.15);
}

.rag-panel {
  margin-top: 16px;
  padding: 12px 14px;
  background: var(--color-bg-sunken);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  font-size: 12px;
}

.rag-panel summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-ink-700);
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  user-select: none;
}

.rag-panel summary::-webkit-details-marker { display: none; }

.rag-icon {
  color: var(--color-node-active);
  font-size: 13px;
}

.rag-count {
  padding: 1px 6px;
  background: var(--color-ink-900);
  color: var(--color-fg-inverse);
  border-radius: var(--radius-full);
  font-size: 10px;
  font-weight: 600;
}

.rag-list {
  margin: 10px 0 0;
  padding-left: 20px;
  color: var(--color-fg-secondary);
}

.rag-source {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-weight: 500;
  color: var(--color-ink-700);
  font-size: 12px;
  margin-bottom: 4px;
}

.source-node {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-node-active);
  flex-shrink: 0;
}

.rag-content {
  font-size: 11px;
  color: var(--color-fg-tertiary);
  line-height: 1.5;
  padding-left: 13px;
  border-left: 1px dashed var(--color-border-default);
  margin-left: 2px;
}

.loading-bubble {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 14px 18px;
}

.think-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-ink-300);
  animation: think-bounce 1.4s infinite ease-in-out both;
}

.think-dot:nth-child(2) { animation-delay: 0.16s; }
.think-dot:nth-child(3) { animation-delay: 0.32s; }

.think-text {
  margin-left: 8px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-fg-tertiary);
}

/* === v2.0 流式渲染相关样式 === */
.message.streaming .assistant-bubble.streaming {
  position: relative;
}
.message.streaming .assistant-bubble.streaming::after {
  content: '▌';
  display: inline-block;
  color: var(--color-node-active);
  animation: cursor-blink 1s steps(2) infinite;
  margin-left: 2px;
  font-weight: 400;
  opacity: 0.8;
}
@keyframes cursor-blink {
  0%, 50% { opacity: 0.8; }
  51%, 100% { opacity: 0; }
}

.assistant-bubble.cancelled {
  opacity: 0.7;
  border-style: dashed;
}

.meta-streaming {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-node-active);
  margin-left: 4px;
  letter-spacing: 0.5px;
}
.meta-cancelled {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-muted);
  margin-left: 4px;
  font-style: italic;
}
.cancel-btn {
  margin-left: auto;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid var(--color-border-subtle);
  background: var(--color-bg-elevated);
  color: var(--color-fg-secondary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}
.cancel-btn:hover {
  background: var(--color-error-bg);
  color: var(--color-error);
  border-color: var(--color-error);
}

.restored-banner {
  padding: 10px 16px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  margin: 16px auto;
  max-width: 880px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--color-ink-700);
  animation: float-up 0.4s var(--ease-out) both;
}
.restored-banner.noop {
  font-style: italic;
  color: var(--color-fg-muted);
}
.banner-cta {
  padding: 4px 12px;
  background: var(--color-ink-900);
  color: white;
  border: none;
  border-radius: var(--radius-full);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.banner-cta:hover:not(:disabled) {
  background: var(--color-brand-700, #1a3a5c);
}
.banner-cta:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.trace-panel {
  padding: 0 32px 8px;
  max-width: 1080px;
  margin: 0 auto;
  width: 100%;
  animation: trace-slide-in 0.3s var(--ease-out) both;
}

@keyframes trace-slide-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.chat-input {
  padding: 12px 32px 16px;
  max-width: 1080px;
  margin: 0 auto;
  width: 100%;
}

/* v3.1: 模式切换器 */
.mode-selector {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-full);
  font-size: 12px;
  color: var(--color-fg-secondary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.mode-btn:hover {
  border-color: var(--color-ink-500);
  color: var(--color-ink-700);
}

.mode-btn.active {
  background: var(--color-ink-900);
  border-color: var(--color-ink-900);
  color: var(--color-fg-inverse);
}

.mode-icon {
  font-size: 11px;
  line-height: 1;
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 10px 14px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: all 0.2s;
}
.input-wrapper:focus-within {
  border-color: var(--color-node-active);
  box-shadow: 0 0 0 3px rgba(0, 212, 170, 0.1);
}

.input-prompt {
  color: var(--color-node-active);
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 16px;
  padding-bottom: 2px;
}

.input-textarea {
  flex: 1;
  border: none;
  background: transparent;
  resize: none;
  outline: none;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-ink-900);
  max-height: 200px;
  padding: 4px 0;
}
.input-textarea::placeholder {
  color: var(--color-fg-muted);
}
.input-textarea:disabled {
  opacity: 0.5;
}

.send-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  background: var(--color-node-active);
  color: var(--color-ink-900);
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-family: var(--font-mono);
  flex-shrink: 0;
}
.send-btn:hover:not(:disabled) {
  background: var(--color-brand-500, #00b894);
  transform: translateY(-1px);
}
.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: var(--color-fg-muted);
}
.send-text { letter-spacing: 0.5px; }
.send-arrow {
  font-size: 12px;
  font-weight: 700;
}

.input-hint {
  display: flex;
  gap: 16px;
  padding: 6px 4px 0;
  font-size: 11px;
  color: var(--color-fg-muted);
  font-family: var(--font-mono);
}
.hint-item { display: inline-flex; align-items: center; gap: 4px; }
.kbd {
  padding: 1px 6px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 10px;
}

@keyframes float-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes node-appear {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pulse-node {
  0%, 100% { box-shadow: 0 0 0 3px rgba(0, 212, 170, 0.2); }
  50% { box-shadow: 0 0 0 6px rgba(0, 212, 170, 0.08); }
}
@keyframes think-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

@media (max-width: 768px) {
  .chat-body { padding: 0 16px; }
  .chat-input { padding: 8px 16px 12px; }
  .quick-actions { grid-template-columns: 1fr; }
  .hero-title { font-size: 32px; }
  .hero-content { padding: 0 8px; }
}
</style>
