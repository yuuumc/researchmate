<script setup>
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import TopBar from '@/components/TopBar.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { useVoiceChat } from '@/composables/useVoiceChat'
import { callChatWithMode } from '@/api/agent'
import { useProfileStore } from '@/stores/profile'
import { profileBus, EVT } from '@/core/profileBus'

const router = useRouter()
const profileStore = useProfileStore()

// === 语音能力 ===
const {
  isSupported,
  isMobile,
  isListening,
  transcript,
  interimTranscript,
  isSpeaking,
  error: voiceError,
  startListening,
  stopListening,
  speak,
  stopSpeaking,
} = useVoiceChat({ lang: 'zh-CN', rate: 0.95 })

// === 对话状态 ===
const messages = ref([])
const loading = ref(false)
const chatScrollRef = ref(null)
const textInput = ref('')
let currentAbort = null

// === 画像上下文（复用 ChatWindow 的 modeProfile 逻辑） ===
const modeProfile = computed(() => {
  const p = profileStore.profile || {}
  const stars = p.ability_stars || {}
  const abilitySummary = Object.keys(stars).length
    ? Object.entries(stars).map(([t, s]) => `${t}(${s}星)`).join('、')
    : ''
  return {
    name: p.name || '',
    target_school: p.target_school || '',
    target_major: p.target_major || p.major || '',
    weak_topics: p.weak_topics || [],
    ability_stars: stars,
    ability_summary: abilitySummary,
    last_diagnosis_score: p.last_diagnosis_score ?? null,
    preparation_stage: p.preparation_stage || '',
  }
})

// === 已知知识点候选（用于 topic 提取） ===
const knownTopics = computed(() => {
  const set = new Set()
  const p = profileStore.profile || {}
  for (const t of Object.keys(p.ability_stars || {})) set.add(t)
  for (const t of Object.keys(p.knowledge_state || {})) set.add(t)
  for (const t of p.weak_topics || []) set.add(t)
  // 常见半导体/微电子知识点兜底
  const defaults = [
    'PN结', 'MOSFET', 'CMOS', '跨导', '耗尽层', '阈值电压',
    '漂移与扩散', '放大器', '频率响应', '反馈', '运算放大器',
    '二极管', '三极管', 'BJT', 'JFET', '半导体物理',
    '能带', '费米能级', '载流子', '掺杂', 'PN结内建电势',
    'MOSFET饱和区', 'CMOS反相器', '放大器频率响应',
  ]
  for (const d of defaults) set.add(d)
  return [...set]
})

/**
 * 从用户提问中提取知识点
 */
function extractTopic(question) {
  const text = question.toLowerCase()
  // 按长度降序匹配（避免短词匹配到长词的子串）
  const sorted = [...knownTopics.value].sort((a, b) => b.length - a.length)
  for (const topic of sorted) {
    if (text.includes(topic.toLowerCase())) {
      return topic
    }
  }
  return null
}

/**
 * 写回画像（F1 profileBus learning-event）
 */
function writebackProfile(userQuestion) {
  const topic = extractTopic(userQuestion)
  if (!topic) return
  profileBus.emit(EVT.LEARNING_EVENT, {
    topic,
    outcome: 'correct',
    questionType: 'voice-qa',
    timestamp: new Date().toISOString(),
  })
}

// === 滚动 ===
async function scrollToBottom() {
  await nextTick()
  const el = chatScrollRef.value
  if (el) el.scrollTop = el.scrollHeight
}

// === 发送消息（文字或语音转文字） ===
async function sendQuestion(text) {
  const content = (text || '').trim()
  if (!content || loading.value) return

  // 停止 TTS（如果正在播报）
  stopSpeaking()

  messages.value.push({
    role: 'user',
    content,
    timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    source: text === transcript.value ? 'voice' : 'text',
  })
  loading.value = true
  await scrollToBottom()

  // 推入空 assistant 占位
  const assistantIdx = messages.value.length
  messages.value.push({
    role: 'assistant',
    content: '',
    streaming: true,
    timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
  })

  currentAbort = new AbortController()

  const onToken = (chunk) => {
    const msg = messages.value[assistantIdx]
    if (msg) {
      msg.content = (msg.content || '') + (chunk.delta || '')
    }
  }

  // 构建对话历史
  const history = messages.value
    .slice(-12)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => !m.error && !m.streaming)
    .map((m) => ({
      role: m.role,
      content: String(m.content || '').slice(0, 2000),
    }))

  try {
    const replyContent = await callChatWithMode(content, {
      mode: 'taoyan',
      profile: modeProfile.value,
      onToken,
      signal: currentAbort.signal,
      history,
    })

    const finalMsg = messages.value[assistantIdx] || {}
    messages.value[assistantIdx] = {
      ...finalMsg,
      role: 'assistant',
      content: replyContent || finalMsg.content || '（无回复）',
      streaming: false,
      timestamp: finalMsg.timestamp,
    }

    // === 写回画像（GWT#2） ===
    writebackProfile(content)

    // === 自动 TTS 播报（GWT#1） ===
    speak(replyContent)
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
        timestamp: finalMsg.timestamp,
      }
    }
  } finally {
    loading.value = false
    currentAbort = null
    await scrollToBottom()
  }
}

// === 语音交互 ===
function onMicClick() {
  if (isListening.value) {
    stopListening()
  } else {
    stopSpeaking()
    startListening()
  }
}

// 监听语音识别结束 → 自动发送
let lastTranscript = ''
function checkTranscriptAndSend() {
  const text = transcript.value.trim()
  if (text && text !== lastTranscript && !loading.value) {
    lastTranscript = text
    sendQuestion(text)
  }
}

// 监听 transcript 变化
watch(transcript, (newVal) => {
  if (newVal && !isListening.value) {
    checkTranscriptAndSend()
  }
})
watch(isListening, (listening) => {
  if (!listening && transcript.value.trim()) {
    nextTick(() => checkTranscriptAndSend())
  }
})

// === 文字输入回退 ===
function sendText() {
  const text = textInput.value.trim()
  if (!text || loading.value) return
  textInput.value = ''
  sendQuestion(text)
}

function handleEnter(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendText()
  }
}

// === 停止播报 ===
function toggleSpeak() {
  if (isSpeaking.value) {
    stopSpeaking()
  }
}

// === 清空对话 ===
function clearChat() {
  stopSpeaking()
  messages.value = []
}

// 预加载 TTS voices（Chrome 需要异步加载）
onMounted(() => {
  if ('speechSynthesis' in window) {
    speechSynthesis.getVoices()
    // Chrome 需要触发 onvoiceschanged
    speechSynthesis.onvoiceschanged = () => {
      speechSynthesis.getVoices()
    }
  }
})
</script>

<template>
  <div class="voice-tutor-page">
    <TopBar active-agent="tutor" />

    <main class="voice-main">
      <!-- === 不支持降级 === -->
      <section v-if="!isSupported || isMobile" class="unsupported-section">
        <div class="unsupported-card">
          <div class="unsupported-icon">
            <svg v-if="isMobile" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
              <line x1="12" y1="18" x2="12" y2="18"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
              <line x1="1" y1="1" x2="23" y2="23" stroke-width="2"/>
            </svg>
          </div>
          <h2 class="unsupported-title">
            {{ isMobile ? '移动端暂不支持语音模式' : '当前浏览器不支持语音功能' }}
          </h2>
          <p class="unsupported-desc">
            {{ isMobile
              ? '语音辅导需要 Chrome 桌面端才能使用麦克风识别和语音播报。'
              : '语音辅导依赖 Web Speech API，请使用 Chrome 浏览器（桌面端）体验。'
            }}
          </p>
          <div class="unsupported-actions">
            <button class="btn-text-chat" @click="router.push('/chat')">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              切换到文字对话
            </button>
          </div>
        </div>
      </section>

      <!-- === 语音辅导主界面 === -->
      <section v-else class="voice-section">
        <header class="voice-header">
          <div class="voice-title-wrap">
            <h1 class="voice-title">语音辅导</h1>
            <p class="voice-subtitle">用语音提问，AI 导师实时回答并语音播报。苏格拉底式启发教学。</p>
          </div>
          <button v-if="messages.length > 0" class="btn-clear" @click="clearChat">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            清空
          </button>
        </header>

        <!-- 对话区 -->
        <div class="chat-area" ref="chatScrollRef">
          <!-- 空状态引导 -->
          <div v-if="messages.length === 0" class="empty-state">
            <div class="empty-mic-icon">
              <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </div>
            <p class="empty-hint">点击下方麦克风按钮开始提问</p>
            <div class="empty-examples">
              <button class="example-chip" @click="sendQuestion('PN 结为什么有内建电势？')">PN 结为什么有内建电势？</button>
              <button class="example-chip" @click="sendQuestion('MOSFET 饱和区的工作原理是什么？')">MOSFET 饱和区工作原理</button>
              <button class="example-chip" @click="sendQuestion('CMOS 反相器的功耗怎么分析？')">CMOS 反相器功耗分析</button>
            </div>
          </div>

          <!-- 对话消息 -->
          <div
            v-for="(msg, i) in messages"
            :key="i"
            class="msg-item"
            :class="msg.role === 'user' ? 'msg-item--user' : 'msg-item--assistant'"
          >
            <div class="msg-meta">
              <span class="msg-role-label">
                {{ msg.role === 'user'
                  ? (msg.source === 'voice' ? '我（语音）' : '我')
                  : 'AI 导师'
                }}
              </span>
              <span v-if="msg.streaming" class="msg-streaming">正在回答…</span>
              <span v-if="msg.cancelled" class="msg-cancelled">已取消</span>
            </div>
            <div
              class="msg-bubble"
              :class="{
                'msg-bubble--user': msg.role === 'user',
                'msg-bubble--assistant': msg.role === 'assistant',
                'msg-bubble--error': msg.error,
                streaming: msg.streaming,
              }"
            >
              <MarkdownRenderer v-if="msg.role === 'assistant' && !msg.streaming" :content="msg.content" />
              <template v-else>{{ msg.content }}</template>
            </div>
          </div>

          <!-- 加载占位 -->
          <div v-if="loading && messages.length > 0 && messages[messages.length - 1].streaming && !messages[messages.length - 1].content" class="msg-item msg-item--assistant">
            <div class="msg-meta">
              <span class="msg-role-label">AI 导师</span>
              <span class="msg-streaming">思考中…</span>
            </div>
            <div class="msg-bubble msg-bubble--assistant streaming">
              <span class="dots"><i></i><i></i><i></i></span>
            </div>
          </div>
        </div>

        <!-- 实时转写显示 -->
        <div v-if="isListening || (interimTranscript && !loading)" class="transcript-bar">
          <div class="transcript-indicator">
            <span class="pulse-dot" :class="{ active: isListening }"></span>
            <span class="transcript-label">{{ isListening ? '正在聆听…' : '识别中…' }}</span>
          </div>
          <div class="transcript-text">
            <span class="transcript-final">{{ transcript }}</span>
            <span class="transcript-interim">{{ interimTranscript }}</span>
          </div>
        </div>

        <!-- TTS 播报状态 -->
        <div v-if="isSpeaking" class="tts-bar">
          <div class="tts-indicator">
            <span class="tts-wave">
              <i></i><i></i><i></i><i></i><i></i>
            </span>
            <span class="tts-label">正在播报</span>
          </div>
          <button class="btn-stop-tts" @click="stopSpeaking">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
            停止
          </button>
        </div>

        <!-- 错误提示 -->
        <div v-if="voiceError" class="error-bar">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12" y2="16"/>
          </svg>
          {{ voiceError }}
        </div>

        <!-- 输入区 -->
        <div class="input-area">
          <!-- 麦克风按钮 -->
          <button
            class="mic-btn"
            :class="{ 'mic-btn--active': isListening }"
            :disabled="loading"
            @click="onMicClick"
            :title="isListening ? '停止录音' : '开始语音提问'"
          >
            <svg v-if="!isListening" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
          </button>

          <!-- 文字输入回退 -->
          <div class="text-input-wrap">
            <textarea
              v-model="textInput"
              class="text-input"
              placeholder="或在此输入文字提问…（Enter 发送）"
              rows="1"
              :disabled="loading"
              @keydown="handleEnter"
            ></textarea>
            <button
              class="btn-send-text"
              :disabled="!textInput.trim() || loading"
              @click="sendText"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.voice-tutor-page {
  min-height: 100vh;
  background: var(--color-bg-base, #f4f6fa);
  color: var(--color-ink-900, #1a2332);
}

.voice-main {
  max-width: 820px;
  margin: 0 auto;
  padding: 24px 20px 64px;
}

/* === 不支持降级 === */
.unsupported-card {
  background: var(--color-bg-elevated, #fff);
  border: 1px solid var(--color-border-subtle, #e3e8ef);
  border-radius: 16px;
  padding: 48px 32px;
  text-align: center;
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06));
}
.unsupported-icon {
  color: var(--color-fg-muted, #9aa3b2);
  margin-bottom: 16px;
}
.unsupported-title {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 700;
  color: var(--color-ink-900);
  margin: 0 0 8px;
}
.unsupported-desc {
  font-size: 14px;
  color: var(--color-fg-secondary, #5a6478);
  line-height: 1.6;
  margin: 0 0 24px;
}
.unsupported-actions {
  display: flex;
  justify-content: center;
}
.btn-text-chat {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 12px;
  border: none;
  background: var(--color-primary, #00d4aa);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.18s ease;
}
.btn-text-chat:hover { opacity: 0.88; }

/* === 语音辅导主界面 === */
.voice-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.voice-title {
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 700;
  margin: 0;
  color: var(--color-ink-900);
}
.voice-subtitle {
  font-size: 13px;
  color: var(--color-fg-secondary, #5a6478);
  line-height: 1.5;
  margin: 4px 0 0;
}
.btn-clear {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border-default, #d6dce6);
  background: transparent;
  color: var(--color-fg-secondary, #5a6478);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.18s ease;
  flex-shrink: 0;
}
.btn-clear:hover {
  border-color: var(--color-danger, #e74c3c);
  color: var(--color-danger, #e74c3c);
}

/* === 对话区 === */
.chat-area {
  background: var(--color-bg-elevated, #fff);
  border: 1px solid var(--color-border-subtle, #e3e8ef);
  border-radius: 12px;
  padding: 20px;
  min-height: 320px;
  max-height: 52vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* === 空状态 === */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  gap: 12px;
}
.empty-mic-icon {
  color: var(--color-primary, #00d4aa);
  opacity: 0.3;
  animation: mic-pulse 2.5s ease-in-out infinite;
}
@keyframes mic-pulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.05); }
}
.empty-hint {
  font-size: 15px;
  color: var(--color-fg-secondary, #5a6478);
  margin: 0;
}
.empty-examples {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 8px;
}
.example-chip {
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-family: var(--font-serif);
  font-weight: 500;
  color: var(--color-fg-secondary, #5a6478);
  background: var(--color-bg-sunken, #f0f3f8);
  border: 1px solid var(--color-border-subtle, #e3e8ef);
  cursor: pointer;
  transition: all 0.18s ease;
}
.example-chip:hover {
  background: color-mix(in srgb, var(--color-primary, #00d4aa) 10%, transparent);
  border-color: var(--color-primary, #00d4aa);
  color: var(--color-primary, #00d4aa);
}

/* === 消息 === */
.msg-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.msg-item--user { align-self: flex-end; max-width: 80%; }
.msg-item--assistant { align-self: flex-start; max-width: 88%; }
.msg-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-muted, #9aa3b2);
}
.msg-item--user .msg-meta { justify-content: flex-end; }
.msg-role-label { font-weight: 500; }
.msg-streaming { color: var(--color-primary, #00d4aa); }
.msg-cancelled { font-style: italic; }

.msg-bubble {
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.65;
  word-break: break-word;
}
.msg-bubble--user {
  background: color-mix(in srgb, var(--color-primary, #00d4aa) 12%, transparent);
  color: var(--color-ink-900);
  border-bottom-right-radius: 4px;
}
.msg-bubble--assistant {
  background: var(--color-bg-sunken, #f0f3f8);
  color: var(--color-ink-900);
  border-bottom-left-radius: 4px;
}
.msg-bubble--error {
  background: color-mix(in srgb, var(--color-danger, #e74c3c) 12%, transparent);
  color: var(--color-danger, #e74c3c);
}
.msg-bubble.streaming::after {
  content: '▌';
  color: var(--color-primary, #00d4aa);
  animation: cursor-blink 1s steps(2) infinite;
}
@keyframes cursor-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.dots { display: inline-flex; gap: 4px; padding: 4px 0; }
.dots i {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--color-fg-muted, #9aa3b2);
  animation: dot-bounce 1.2s infinite ease-in-out;
}
.dots i:nth-child(2) { animation-delay: 0.2s; }
.dots i:nth-child(3) { animation-delay: 0.4s; }
@keyframes dot-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

/* === 实时转写 === */
.transcript-bar {
  margin-top: 12px;
  padding: 12px 16px;
  background: var(--color-bg-elevated, #fff);
  border: 1px solid var(--color-primary, #00d4aa);
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.transcript-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.pulse-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-fg-muted, #9aa3b2);
}
.pulse-dot.active {
  background: var(--color-danger, #e74c3c);
  animation: pulse-rec 1s ease-in-out infinite;
}
@keyframes pulse-rec {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.6; }
}
.transcript-label {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-fg-secondary, #5a6478);
  white-space: nowrap;
}
.transcript-text {
  flex: 1;
  font-size: 14px;
  line-height: 1.5;
}
.transcript-final {
  color: var(--color-ink-900);
}
.transcript-interim {
  color: var(--color-fg-muted, #9aa3b2);
  font-style: italic;
}

/* === TTS 播报状态 === */
.tts-bar {
  margin-top: 12px;
  padding: 10px 16px;
  background: color-mix(in srgb, var(--color-primary, #00d4aa) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary, #00d4aa) 30%, transparent);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.tts-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tts-wave {
  display: inline-flex;
  gap: 3px;
  align-items: center;
}
.tts-wave i {
  width: 3px;
  height: 16px;
  background: var(--color-primary, #00d4aa);
  border-radius: 2px;
  animation: tts-wave 0.8s ease-in-out infinite;
}
.tts-wave i:nth-child(1) { animation-delay: 0s; height: 8px; }
.tts-wave i:nth-child(2) { animation-delay: 0.1s; height: 14px; }
.tts-wave i:nth-child(3) { animation-delay: 0.2s; height: 20px; }
.tts-wave i:nth-child(4) { animation-delay: 0.3s; height: 14px; }
.tts-wave i:nth-child(5) { animation-delay: 0.4s; height: 8px; }
@keyframes tts-wave {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}
.tts-label {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-primary, #00d4aa);
  font-weight: 600;
}
.btn-stop-tts {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid var(--color-border-default, #d6dce6);
  background: transparent;
  color: var(--color-fg-secondary, #5a6478);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.18s ease;
}
.btn-stop-tts:hover {
  border-color: var(--color-danger, #e74c3c);
  color: var(--color-danger, #e74c3c);
}

/* === 错误提示 === */
.error-bar {
  margin-top: 12px;
  padding: 10px 16px;
  background: color-mix(in srgb, var(--color-danger, #e74c3c) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-danger, #e74c3c) 25%, transparent);
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-danger, #e74c3c);
}

/* === 输入区 === */
.input-area {
  margin-top: 16px;
  display: flex;
  align-items: flex-end;
  gap: 12px;
}
.mic-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 2px solid var(--color-primary, #00d4aa);
  background: var(--color-bg-elevated, #fff);
  color: var(--color-primary, #00d4aa);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;
  position: relative;
}
.mic-btn:hover:not(:disabled) {
  background: var(--color-primary, #00d4aa);
  color: #fff;
  transform: scale(1.05);
}
.mic-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.mic-btn--active {
  background: var(--color-danger, #e74c3c);
  border-color: var(--color-danger, #e74c3c);
  color: #fff;
  animation: mic-rec-pulse 1.5s ease-in-out infinite;
}
@keyframes mic-rec-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-danger, #e74c3c) 40%, transparent); }
  50% { box-shadow: 0 0 0 12px transparent; }
}

.text-input-wrap {
  flex: 1;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-bg-elevated, #fff);
  border: 1px solid var(--color-border-subtle, #e3e8ef);
  border-radius: 12px;
  transition: border-color 0.18s ease;
}
.text-input-wrap:focus-within {
  border-color: var(--color-primary, #00d4aa);
}
.text-input {
  flex: 1;
  border: none;
  background: transparent;
  resize: none;
  outline: none;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-ink-900);
  max-height: 120px;
  padding: 4px 0;
}
.text-input::placeholder {
  color: var(--color-fg-muted, #9aa3b2);
}
.text-input:disabled { opacity: 0.5; }
.btn-send-text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: var(--color-primary, #00d4aa);
  color: #fff;
  cursor: pointer;
  transition: all 0.18s ease;
  flex-shrink: 0;
}
.btn-send-text:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: var(--color-fg-muted, #9aa3b2);
}
.btn-send-text:not(:disabled):hover {
  transform: translateY(-1px);
}

/* === 响应式 === */
@media (max-width: 768px) {
  .voice-main { padding: 16px 14px 56px; }
  .voice-title { font-size: 20px; }
  .chat-area { padding: 14px; min-height: 260px; max-height: 46vh; }
  .msg-item--user, .msg-item--assistant { max-width: 94%; }
  .input-area { gap: 8px; }
  .mic-btn { width: 48px; height: 48px; }
  .empty-examples { flex-direction: column; align-items: stretch; }
}
</style>
