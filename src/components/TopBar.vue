<script setup>
import { useRouter } from 'vue-router'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import AgentIcon from './AgentIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { toggleTheme, getCurrentTheme } from '@/composables/useTheme'

const props = defineProps({
  activeAgent: {
    type: String,
    default: 'tutor'
  }
})

const router = useRouter()
const auth = useAuthStore()

// V2.6: 每个 Agent 恢复差异化专属入口
// key → 目标路由 path（chat 类走 /chat?agent=，专属页走各自 path + boot 参数）
const AGENT_ROUTES = {
  tutor: { path: '/chat', query: 'agent' },
  diagnose: { path: '/diagnosis', query: 'boot' },
  planner: { path: '/plan', query: 'boot' },
  research: { path: '/research', query: 'boot' },
  career: { path: '/career', query: 'boot' },
  practice: { path: '/practice', query: 'boot' },
  peer: { path: '/peer', query: 'boot' },
  admission: { path: '/admission', query: 'boot' }
}
const coreAgents = [
  { key: 'tutor', label: 'AI 导师', en: 'Tutor', color: '#00d4aa', desc: '苏格拉底式教学' },
  { key: 'diagnose', label: '成长诊断', en: 'Diagnose', color: '#4d9de0', desc: '4 层根因链' },
  { key: 'planner', label: '学习规划', en: 'Planner', color: '#ffd166', desc: '动态周计划' },
  { key: 'research', label: '科研探索', en: 'Research', color: '#e67e22', desc: '本科→研究生路线' }
]

const moreAgents = [
  { key: 'career', label: '就业', en: 'Career', color: '#9b59b6', desc: '就业路径推荐' },
  { key: 'practice', label: '练习', en: 'Practice', color: '#e74c3c', desc: '针对性出题' },
  { key: 'peer', label: '同伴', en: 'Peer', color: '#3498db', desc: '互助匹配' },
  { key: 'admission', label: '择校', en: 'Admission', color: '#ff6b6b', desc: '数据驱动' }
]

// "更多"下拉
const moreOpen = ref(false)
const moreRef = ref(null)

// 用户菜单下拉
const userMenuOpen = ref(false)
const userMenuRef = ref(null)

function toggleMore() {
  moreOpen.value = !moreOpen.value
}

function closeMore() {
  moreOpen.value = false
}

function toggleUserMenu() {
  userMenuOpen.value = !userMenuOpen.value
}

function handleClickOutside(e) {
  if (moreRef.value && !moreRef.value.contains(e.target)) {
    moreOpen.value = false
  }
  if (userMenuRef.value && !userMenuRef.value.contains(e.target)) {
    userMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

function go(agent) {
  moreOpen.value = false
  const route = AGENT_ROUTES[agent.key]
  if (!route) return
  router.push({ path: route.path, query: { [route.query]: agent.key } })
}

function goProfile() {
  userMenuOpen.value = false
  router.push('/profile')
}

function goHome() {
  router.push('/')
}

function goLogin() {
  userMenuOpen.value = false
  router.push('/login')
}

async function handleSignOut() {
  userMenuOpen.value = false
  try {
    await auth.signOut()
  } catch (e) {
    console.error('[TopBar] signOut failed:', e)
  }
  router.push('/login')
}

const activeIndex = computed(() => coreAgents.findIndex((a) => a.key === props.activeAgent))

const avatarChar = computed(() => {
  const name = auth.displayName
  if (!name || name === '未登录') return '?'
  return name.charAt(0)
})

const currentTheme = ref(getCurrentTheme())

function handleToggleTheme() {
  currentTheme.value = toggleTheme()
}
</script>

<template>
  <header class="top-bar">
    <!-- 左侧：品牌 -->
    <div class="bar-left">
      <div class="brand" @click="goHome" title="返回首页">
        <div class="brand-mark">
          <svg viewBox="0 0 40 40" class="brand-svg">
            <circle cx="20" cy="20" r="4" fill="#0f1e33" />
            <circle cx="20" cy="20" r="10" fill="none" stroke="#0f1e33" stroke-width="0.8" stroke-dasharray="2 3" opacity="0.5">
              <animateTransform attributeName="transform" type="rotate" from="0 20 20" to="360 20 20" dur="20s" repeatCount="indefinite" />
            </circle>
            <circle cx="20" cy="6" r="1.5" fill="#00d4aa" />
            <circle cx="33.3" cy="15.5" r="1.5" fill="#4d9de0" />
            <circle cx="28.2" cy="31.3" r="1.5" fill="#ffd166" />
            <circle cx="11.8" cy="31.3" r="1.5" fill="#ff6b6b" />
            <circle cx="6.7" cy="15.5" r="1.5" fill="#e67e22" />
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

    <!-- 中央：4 核心 Agent + 更多下拉 -->
    <nav class="agent-nav">
      <button
        v-for="agent in coreAgents"
        :key="agent.key"
        class="agent-btn agent-btn--core"
        :class="{ active: activeAgent === agent.key }"
        :style="{ '--agent-color': agent.color }"
        @click="go(agent)"
      >
        <!-- AI 状态 badge：Tutor 常亮绿点，其余 hover 显示 -->
        <span
          class="agent-btn__status"
          :class="agent.key === 'tutor' ? 'agent-btn__status--online' : 'agent-btn__status--idle'"
        ></span>
        <span class="agent-btn__icon">
          <AgentIcon :type="agent.key" :agent-color="agent.color" :icon-size="16" :stroke-width="2" />
        </span>
        <span class="agent-btn__label">{{ agent.label }}</span>
      </button>

      <!-- 更多下拉 -->
      <div ref="moreRef" class="more-wrap">
        <button class="agent-btn agent-btn--more" :class="{ active: moreOpen }" @click="toggleMore">
          <span class="more-dots">···</span>
          <span class="agent-btn__label">更多</span>
        </button>
        <transition name="dropdown">
          <div v-if="moreOpen" class="agent-dropdown">
            <button
              v-for="agent in moreAgents"
              :key="agent.key"
              class="agent-dropdown__item"
              @click="go(agent)"
            >
              <span class="dropdown-icon" :style="{ '--agent-color': agent.color }">
                <AgentIcon :type="agent.key" :agent-color="agent.color" :icon-size="16" :stroke-width="2" />
              </span>
              <span class="dropdown-label">{{ agent.label }}</span>
              <span class="dropdown-en">{{ agent.en }}</span>
            </button>
          </div>
        </transition>
      </div>
    </nav>

    <!-- 右侧：状态 + 用户菜单 -->
    <div class="bar-right">
      <!-- 游客模式标识（可点击跳转登录） -->
      <button v-if="auth.isGuest" class="guest-pill" @click="goLogin" title="点击登录/注册">
        <span class="guest-dot"></span>
        <span class="guest-text">游客模式 · 点击登录</span>
      </button>
      <!-- 正常状态指示 -->
      <div v-else class="status-pill">
        <span class="status-dot"></span>
        <span class="status-text">8 Agents · Online</span>
      </div>

      <!-- 主题切换按钮 -->
      <button class="yx-theme-toggle" @click="handleToggleTheme" title="切换主题">
        <svg class="yx-theme-toggle__sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
        <svg class="yx-theme-toggle__moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>

      <!-- 用户菜单下拉 -->
      <div ref="userMenuRef" class="user-menu-wrap">
        <button class="user-entry" :title="auth.displayName" @click="toggleUserMenu">
          <span class="user-avatar">{{ avatarChar }}</span>
        </button>
        <transition name="dropdown">
          <div v-if="userMenuOpen" class="user-dropdown">
            <div class="user-dropdown__header">
              <div class="user-dropdown__name">{{ auth.displayName }}</div>
              <div v-if="auth.isGuest" class="user-dropdown__tag">游客模式</div>
            </div>
            <button class="user-dropdown__item" @click="goProfile">
              <svg class="user-dropdown__icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>学生画像</span>
            </button>
            <button v-if="auth.isGuest" class="user-dropdown__item user-dropdown__item--highlight" @click="goLogin">
              <svg class="user-dropdown__icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              <span>登录 / 注册</span>
            </button>
            <div class="user-dropdown__divider"></div>
            <button class="user-dropdown__item user-dropdown__item--danger" @click="handleSignOut">
              <svg class="user-dropdown__icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>退出登录</span>
            </button>
          </div>
        </transition>
      </div>
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
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.brand:hover {
  opacity: 0.7;
}

.brand-mark {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-svg { width: 100%; height: 100%; }

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

/* === 中央 Agent 导航 === */
.agent-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-sm);
}

.agent-btn--core {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-fg-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.agent-btn--core:hover {
  background: var(--color-bg-sunken);
  color: var(--color-ink-900);
}

.agent-btn--core.active {
  background: color-mix(in srgb, var(--agent-color) 8%, transparent);
  color: var(--agent-color);
}

.agent-btn__icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.agent-btn__label {
  font-family: var(--font-serif);
  font-weight: 600;
  white-space: nowrap;
}

/* AI 状态 badge */
.agent-btn__status {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: opacity 0.2s;
}

.agent-btn__status--online {
  background: var(--color-success);
  box-shadow: 0 0 0 2px rgba(0, 212, 170, 0.2);
}

.agent-btn__status--idle {
  background: var(--color-fg-muted);
  opacity: 0;
}

.agent-btn--core:hover .agent-btn__status--idle {
  opacity: 0.5;
}

/* === 更多下拉 === */
.more-wrap {
  position: relative;
}

.agent-btn--more {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-fg-tertiary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.agent-btn--more:hover,
.agent-btn--more.active {
  color: var(--color-ink-900);
  background: var(--color-bg-sunken);
}

.more-dots {
  font-size: 16px;
  letter-spacing: -2px;
  line-height: 1;
}

.agent-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 180px;
  padding: 6px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  z-index: 50;
}

.dropdown-enter-active, .dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from, .dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.agent-dropdown__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-fg-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.agent-dropdown__item:hover {
  background: var(--color-bg-sunken);
  color: var(--color-ink-900);
}

.dropdown-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.dropdown-label {
  font-family: var(--font-serif);
  font-weight: 600;
  flex: 1;
}

.dropdown-en {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-fg-muted);
  text-transform: uppercase;
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

/* 游客模式标识 */
.guest-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--color-warning-bg, rgba(255, 209, 102, 0.12));
  border: 1px solid color-mix(in srgb, var(--color-warning, #ffd166) 40%, transparent);
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-ink-700);
  cursor: pointer;
  transition: all 0.2s ease;
}

.guest-pill:hover {
  background: color-mix(in srgb, var(--color-warning, #ffd166) 18%, transparent);
  border-color: var(--color-warning, #ffd166);
}

.guest-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-warning, #ffd166);
  box-shadow: 0 0 0 3px rgba(255, 209, 102, 0.2);
}

.guest-text {
  white-space: nowrap;
}

/* 用户菜单 */
.user-menu-wrap {
  position: relative;
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
  cursor: pointer;
}

.user-entry:hover {
  border-color: var(--color-ink-700);
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-sm);
}

.user-avatar {
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink-700);
}

.user-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 200px;
  padding: 6px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  z-index: 50;
}

.user-dropdown__header {
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--color-border-subtle);
  margin-bottom: 4px;
}

.user-dropdown__name {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-900);
}

.user-dropdown__tag {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-warning, #ffd166);
  margin-top: 2px;
}

.user-dropdown__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-fg-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.user-dropdown__item:hover {
  background: var(--color-bg-sunken);
  color: var(--color-ink-900);
}

.user-dropdown__item--highlight {
  color: var(--color-primary, #00d4aa);
  font-weight: 600;
}

.user-dropdown__item--highlight:hover {
  background: color-mix(in srgb, var(--color-primary, #00d4aa) 8%, transparent);
}

.user-dropdown__item--danger {
  color: var(--color-danger, #e74c3c);
}

.user-dropdown__item--danger:hover {
  background: color-mix(in srgb, var(--color-danger, #e74c3c) 8%, transparent);
}

.user-dropdown__icon {
  flex-shrink: 0;
}

.user-dropdown__divider {
  height: 1px;
  background: var(--color-border-subtle);
  margin: 4px 0;
}

/* === 响应式 === */
@media (max-width: 1024px) {
  .top-bar { padding: 0 20px; }
  .brand-text { font-size: 16px; }
  .agent-btn--core { padding: 6px 10px; }
}

@media (max-width: 768px) {
  .top-bar { height: 60px; padding: 0 16px; }
  .brand-text { display: none; }
  .agent-nav { padding: 4px; gap: 2px; overflow-x: auto; scrollbar-width: none; max-width: 100%; }
  .agent-nav::-webkit-scrollbar { display: none; }
  .agent-btn--core { padding: 6px 8px; gap: 4px; flex-shrink: 0; }
  .agent-btn__label { font-size: 12px; }
  .agent-btn--more { padding: 6px 8px; }
  .status-pill { padding: 4px 8px; font-size: 10px; }
  .status-text { display: none; }
  .guest-pill { padding: 4px 8px; font-size: 10px; }
  .guest-text { display: none; }
  .user-entry { width: 30px; height: 30px; }
  :deep(.yx-theme-toggle) { width: 30px; height: 30px; }
}

@media (max-width: 480px) {
  .top-bar { padding: 0 12px; height: 56px; }
  .brand-mark { width: 32px; height: 32px; }
  .agent-btn--core { padding: 5px 6px; }
  .agent-btn__status { display: none; }
  .status-pill { display: none; }
  .guest-pill { padding: 4px 6px; }
}
</style>
