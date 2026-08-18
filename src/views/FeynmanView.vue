<script setup>
import { ref, computed, nextTick, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFeynmanStore } from '@/stores/feynman'
import { useProfileStore } from '@/stores/profile'

const router = useRouter()
const feynman = useFeynmanStore()
const profile = useProfileStore()

const inputText = ref('')
const chatScrollRef = ref(null)

// 知识点候选：画像薄弱点 + 已有 knowledge_state + 默认热门
const topicCandidates = computed(() => {
  const set = new Set()
  // 薄弱点优先
  for (const t of (profile.profile?.weak_topics || [])) set.add(t)
  for (const t of Object.keys(profile.profile?.knowledge_state || {})) set.add(t)
  // 默认热门兜底（确保有可选）
  const defaults = ['MOSFET饱和区', 'PN结', 'CMOS反相器', '跨导', '耗尽层', '阈值电压', '漂移与扩散', '放大器频率响应']
  for (const d of defaults) set.add(d)
  return [...set].slice(0, 24)
})

const showTopicPicker = computed(() => feynman.status === 'idle')

function pickTopic(topic) {
  feynman.startSession(topic)
}

async function sendRetelling() {
  const text = inputText.value.trim()
  if (!text || feynman.status === 'asking') return
  inputText.value = ''
  try {
    await feynman.askRound(text)
    await nextTick()
    scrollToBottom()
  } catch (e) {
    // 错误已在 store 标记，UI 显示
  }
}

async function manualEnd() {
  try {
    await feynman.endSession()
  } catch (e) { /* UI 显示错误 */ }
}

function startOver() {
  feynman.reset()
}

function goToDerivation() {
  router.push({ path: '/derivation', query: { topic: feynman.topic } })
}

function goToVariant() {
  router.push({ path: `/variant/${encodeURIComponent(feynman.topic)}` })
}

function scrollToBottom() {
  const el = chatScrollRef.value
  if (el) el.scrollTop = el.scrollHeight
}

function onKeyCtrlEnter(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendRetelling()
}

onUnmounted(() => {
  // 离开页面不自动重置（允许返回继续），但释放流
})
</script>

<template>
  <div class="feynman-page">
    <main class="feynman-main">
      <!-- 步骤 1：知识点选择 -->
      <section v-if="showTopicPicker" class="pick-section">
        <div class="pick-card">
          <h1 class="pick-title">费曼复述</h1>
          <p class="pick-desc">用自己的话把知识点讲给 AI 听。AI 会指出你的概念错误并提出追问，帮你真正理解。对话满 3 轮后生成理解深度评估。</p>
          <div class="topic-grid">
            <button
              v-for="t in topicCandidates"
              :key="t"
              class="topic-chip"
              @click="pickTopic(t)"
            >{{ t }}</button>
          </div>
        </div>
      </section>

      <!-- 步骤 2/3：对话 / 评估 -->
      <section v-else class="session-section">
        <header class="session-header">
          <div class="session-topic">
            <span class="session-label">知识点</span>
            <span class="session-name">{{ feynman.topic }}</span>
          </div>
          <div class="session-meta">
            <span class="round-badge">第 {{ feynman.studentTurnCount }} / 3 轮</span>
            <button v-if="feynman.canEnd" class="btn-end" @click="manualEnd">结束并评估</button>
            <button class="btn-restart" @click="startOver">重选知识点</button>
          </div>
        </header>

        <!-- 对话区 -->
        <div v-if="feynman.status !== 'done'" class="chat-area" ref="chatScrollRef">
          <div class="msg msg--student" v-for="(m, i) in feynman.history.filter(h => h.role === 'student')" :key="'s' + i">
            <div class="msg-role">我的复述</div>
            <div class="msg-bubble msg-bubble--student">{{ m.content }}</div>
          </div>
          <template v-for="(m, i) in feynman.history" :key="'a' + i">
            <div v-if="m.role === 'assistant'" class="msg msg--assistant">
              <div class="msg-role">AI 导师追问</div>
              <div class="msg-bubble msg-bubble--assistant">{{ m.content }}</div>
            </div>
          </template>
          <!-- 流式输出中 -->
          <div v-if="feynman.status === 'asking' && feynman.streamingContent" class="msg msg--assistant">
            <div class="msg-role">AI 导师追问<span class="typing">…</span></div>
            <div class="msg-bubble msg-bubble--assistant streaming">{{ feynman.streamingContent }}</div>
          </div>
          <div v-if="feynman.status === 'asking' && !feynman.streamingContent" class="msg msg--assistant">
            <div class="msg-role">AI 思考中…</div>
            <div class="msg-bubble msg-bubble--assistant streaming"><span class="dots"><i></i><i></i><i></i></span></div>
          </div>
          <div v-if="feynman.status === 'evaluating'" class="msg msg--system">
            <div class="msg-bubble msg-bubble--system">正在生成理解深度评估…</div>
          </div>
          <div v-if="feynman.errorMsg" class="msg msg--error">
            <div class="msg-bubble msg-bubble--error">{{ feynman.errorMsg }}</div>
          </div>
        </div>

        <!-- 输入区 -->
        <div v-if="feynman.status !== 'done' && feynman.status !== 'evaluating'" class="input-area">
          <textarea
            v-model="inputText"
            class="retelling-input"
            placeholder="用你自己的话复述这个知识点…（Ctrl+Enter 发送）"
            rows="3"
            :disabled="feynman.status === 'asking'"
            @keydown="onKeyCtrlEnter"
          ></textarea>
          <button
            class="btn-send"
            :disabled="!inputText.trim() || feynman.status === 'asking'"
            @click="sendRetelling"
          >发送复述</button>
        </div>

        <!-- 评估结果 -->
        <div v-if="feynman.status === 'done' && feynman.evaluation" class="eval-area">
          <div class="eval-card">
            <div class="eval-score-wrap">
              <div class="eval-score" :class="{ 'eval-score--low': feynman.evaluation.score < 60, 'eval-score--mid': feynman.evaluation.score >= 60 && feynman.evaluation.score < 90, 'eval-score--high': feynman.evaluation.score >= 90 }">
                {{ feynman.evaluation.score }}
              </div>
              <div class="eval-score-label">理解深度评分</div>
            </div>
            <p v-if="feynman.evaluation.summary" class="eval-summary">{{ feynman.evaluation.summary }}</p>

            <div v-if="feynman.evaluation.errors.length" class="eval-block">
              <h3 class="eval-block-title">概念错误</h3>
              <ul class="eval-list">
                <li v-for="(e, i) in feynman.evaluation.errors" :key="'e' + i">{{ e }}</li>
              </ul>
            </div>
            <div v-if="feynman.evaluation.strengths.length" class="eval-block">
              <h3 class="eval-block-title">理解到位</h3>
              <ul class="eval-list eval-list--ok">
                <li v-for="(s, i) in feynman.evaluation.strengths" :key="'s' + i">{{ s }}</li>
              </ul>
            </div>

            <!-- 评分 <60 推荐巩固入口（GWT#3） -->
            <div v-if="feynman.evaluation.score < 60" class="eval-recommend">
              <h3 class="eval-block-title">建议巩固</h3>
              <div class="recommend-actions">
                <button class="btn-recommend btn-recommend--derive" @click="goToDerivation">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
                  白板推导
                </button>
                <button class="btn-recommend btn-recommend--variant" @click="goToVariant">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  变式题练习
                </button>
              </div>
            </div>

            <div class="eval-actions">
              <button class="btn-restart" @click="startOver">换个知识点再练</button>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.feynman-page {
  min-height: 100%;
  background: var(--color-bg-base, #f4f6fa);
  color: var(--color-ink-900, #1a2332);
}

.feynman-main {
  max-width: 820px;
  margin: 0 auto;
  padding: 24px 20px 64px;
}

/* === 知识点选择 === */
.pick-card {
  background: var(--color-bg-elevated, #fff);
  border: 1px solid var(--color-border-subtle, #e3e8ef);
  border-radius: 16px;
  padding: 32px 28px;
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06));
}
.pick-title {
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 8px;
  color: var(--color-ink-900);
}
.pick-desc {
  font-size: 14px;
  color: var(--color-fg-secondary, #5a6478);
  line-height: 1.6;
  margin: 0 0 24px;
}
.topic-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.topic-chip {
  padding: 9px 16px;
  border-radius: 10px;
  font-size: 14px;
  font-family: var(--font-serif);
  font-weight: 500;
  color: var(--color-fg-secondary, #5a6478);
  background: var(--color-bg-sunken, #f0f3f8);
  border: 1px solid var(--color-border-subtle, #e3e8ef);
  cursor: pointer;
  transition: all 0.18s ease;
}
.topic-chip:hover {
  background: color-mix(in srgb, var(--color-primary, #00d4aa) 10%, transparent);
  border-color: var(--color-primary, #00d4aa);
  color: var(--color-primary, #00d4aa);
}

/* === 会话区 === */
.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding: 14px 18px;
  background: var(--color-bg-elevated, #fff);
  border: 1px solid var(--color-border-subtle, #e3e8ef);
  border-radius: 12px;
}
.session-topic { display: flex; align-items: center; gap: 8px; }
.session-label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-muted, #9aa3b2);
  text-transform: uppercase;
}
.session-name {
  font-family: var(--font-serif);
  font-weight: 600;
  font-size: 16px;
  color: var(--color-ink-900);
}
.session-meta { display: flex; align-items: center; gap: 10px; }
.round-badge {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 4px 10px;
  border-radius: var(--radius-full, 999px);
  background: var(--color-bg-sunken, #f0f3f8);
  color: var(--color-ink-700, #3a4458);
}

.chat-area {
  background: var(--color-bg-elevated, #fff);
  border: 1px solid var(--color-border-subtle, #e3e8ef);
  border-radius: 12px;
  padding: 20px;
  min-height: 320px;
  max-height: 56vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.msg { display: flex; flex-direction: column; gap: 4px; }
.msg--student { align-self: flex-end; max-width: 80%; }
.msg--assistant, .msg--system, .msg--error { align-self: flex-start; max-width: 88%; }
.msg-role {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-muted, #9aa3b2);
  padding: 0 4px;
}
.msg--student .msg-role { text-align: right; }
.msg-bubble {
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-bubble--student {
  background: color-mix(in srgb, var(--color-primary, #00d4aa) 12%, transparent);
  color: var(--color-ink-900);
  border-bottom-right-radius: 4px;
}
.msg-bubble--assistant {
  background: var(--color-bg-sunken, #f0f3f8);
  color: var(--color-ink-900);
  border-bottom-left-radius: 4px;
}
.msg-bubble--system {
  background: color-mix(in srgb, var(--color-warning, #ffd166) 14%, transparent);
  color: var(--color-ink-800, #2a3346);
  font-style: italic;
}
.msg-bubble--error {
  background: color-mix(in srgb, var(--color-danger, #e74c3c) 12%, transparent);
  color: var(--color-danger, #e74c3c);
}
.streaming { opacity: 0.92; }
.typing { color: var(--color-primary, #00d4aa); }

.dots { display: inline-flex; gap: 4px; padding: 4px 0; }
.dots i {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--color-fg-muted, #9aa3b2);
  animation: dot-bounce 1.2s infinite ease-in-out;
}
.dots i:nth-child(2) { animation-delay: 0.2s; }
.dots i:nth-child(3) { animation-delay: 0.4s; }
@keyframes dot-bounce { 0%,80%,100% { transform: scale(0.6); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }

/* === 输入区 === */
.input-area {
  margin-top: 16px;
  display: flex;
  gap: 12px;
  align-items: flex-end;
}
.retelling-input {
  flex: 1;
  resize: vertical;
  min-height: 72px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--color-border-default, #d6dce6);
  background: var(--color-bg-elevated, #fff);
  color: var(--color-ink-900);
  font-size: 14px;
  font-family: inherit;
  line-height: 1.6;
  outline: none;
  transition: border-color 0.18s ease;
}
.retelling-input:focus { border-color: var(--color-primary, #00d4aa); }
.retelling-input:disabled { opacity: 0.6; }
.btn-send {
  padding: 12px 20px;
  border-radius: 12px;
  border: none;
  background: var(--color-primary, #00d4aa);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.18s ease;
}
.btn-send:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-send:not(:disabled):hover { opacity: 0.88; }

/* === 评估结果 === */
.eval-area { margin-top: 16px; }
.eval-card {
  background: var(--color-bg-elevated, #fff);
  border: 1px solid var(--color-border-subtle, #e3e8ef);
  border-radius: 16px;
  padding: 28px;
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06));
}
.eval-score-wrap { text-align: center; margin-bottom: 16px; }
.eval-score {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 56px;
  font-weight: 700;
  line-height: 1;
  padding: 8px 4px;
}
.eval-score--low { color: var(--color-danger, #e74c3c); }
.eval-score--mid { color: var(--color-warning, #f0a020); }
.eval-score--high { color: var(--color-success, #00d4aa); }
.eval-score-label {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-fg-muted, #9aa3b2);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 6px;
}
.eval-summary {
  font-size: 15px;
  color: var(--color-ink-800, #2a3346);
  line-height: 1.6;
  text-align: center;
  margin: 12px 0 20px;
}
.eval-block { margin-top: 18px; }
.eval-block-title {
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-ink-900);
  margin: 0 0 8px;
}
.eval-list { margin: 0; padding-left: 20px; }
.eval-list li {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-fg-secondary, #5a6478);
  margin-bottom: 6px;
}
.eval-list--ok li { color: var(--color-success, #00d4aa); }

.eval-recommend {
  margin-top: 22px;
  padding: 18px;
  background: color-mix(in srgb, var(--color-warning, #ffd166) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning, #ffd166) 30%, transparent);
  border-radius: 12px;
}
.recommend-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; }
.btn-recommend {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.18s ease;
}
.btn-recommend--derive {
  background: var(--color-primary, #00d4aa);
  color: #fff;
}
.btn-recommend--derive:hover { opacity: 0.88; }
.btn-recommend--variant {
  background: var(--color-bg-elevated, #fff);
  color: var(--color-ink-800, #2a3346);
  border-color: var(--color-border-default, #d6dce6);
}
.btn-recommend--variant:hover { border-color: var(--color-primary, #00d4aa); color: var(--color-primary, #00d4aa); }

.eval-actions { margin-top: 24px; text-align: center; }

.btn-end {
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid var(--color-danger, #e74c3c);
  background: transparent;
  color: var(--color-danger, #e74c3c);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
}
.btn-end:hover { background: color-mix(in srgb, var(--color-danger, #e74c3c) 8%, transparent); }
.btn-restart {
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid var(--color-border-default, #d6dce6);
  background: transparent;
  color: var(--color-fg-secondary, #5a6478);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s ease;
}
.btn-restart:hover { border-color: var(--color-ink-500, #6a7488); color: var(--color-ink-800, #2a3346); }

/* === 响应式 === */
@media (max-width: 768px) {
  .feynman-main { padding: 16px 14px 56px; }
  .pick-card { padding: 22px 18px; }
  .pick-title { font-size: 20px; }
  .session-header { padding: 12px 14px; }
  .session-name { font-size: 14px; }
  .chat-area { padding: 14px; min-height: 260px; max-height: 50vh; }
  .msg--student, .msg--assistant, .msg--system, .msg--error { max-width: 94%; }
  .input-area { flex-direction: column; align-items: stretch; }
  .btn-send { width: 100%; }
  .eval-card { padding: 20px 16px; }
  .eval-score { font-size: 44px; }
  .recommend-actions { flex-direction: column; }
  .btn-recommend { width: 100%; justify-content: center; }
}
</style>
