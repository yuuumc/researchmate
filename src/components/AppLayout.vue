<script setup>
// ============================================================
// AppLayout.vue — W4 侧边栏布局（sidebar + slim topbar + content）
// 替代原 TopBar + SyncStatusBar 的顶部导航模式
// ============================================================
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { toggleTheme, getCurrentTheme } from '@/composables/useTheme'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const syncStore = useSyncStore()

// ---- Sidebar collapse ----
const COLLAPSE_KEY = 'yx-sidebar-collapsed'
const collapsed = ref(false)
const userPinned = ref(false)

function initSidebar() {
  const saved = localStorage.getItem(COLLAPSE_KEY)
  if (saved !== null) {
    collapsed.value = saved === 'true'
    userPinned.value = true
  } else if (window.innerWidth <= 1024 && window.innerWidth > 768) {
    collapsed.value = true
  }
}

function toggleCollapsed() {
  collapsed.value = !collapsed.value
  userPinned.value = true
  localStorage.setItem(COLLAPSE_KEY, String(collapsed.value))
  // Trigger resize for ECharts
  setTimeout(() => window.dispatchEvent(new Event('resize')), 250)
}

// ---- Mobile drawer ----
const mobileOpen = ref(false)

function closeMobile() {
  mobileOpen.value = false
}

function onKeydown(e) {
  if (e.key === 'Escape' && mobileOpen.value) {
    closeMobile()
  }
}

// ---- Navigation config ----
const coreNav = [
  { path: '/', label: 'AI 导师', icon: 'sparkles' },
  { path: '/diagnosis', label: '成长诊断', icon: 'target' },
  { path: '/plan', label: '学习规划', icon: 'calendar' },
  { path: '/practice', label: '练习题', icon: 'pencil' },
  // F2: 拍题讲解（多模态拍照识别）
  { path: '/tutor-photo', label: '拍题讲解', icon: 'photo' },
  // F3: 模拟考试
  { path: '/exam', label: '模考', icon: 'exam' },
  // F4: 费曼复述（讲给AI听·深度理解）
  { path: '/feynman', label: '费曼复述', icon: 'flask' },

  // T0-3: research 已移除
]

const toolNav = [
  { path: '/career', label: '就业指导', icon: 'briefcase' },
  // B2: AI 白板推导入口
  { path: '/derivation', label: '白板推导', icon: 'edit' },
  // B5: 多 Agent 架构看板入口
  { path: '/architecture', label: '架构看板', icon: 'chip' },
  // B4: 知识图谱可视化入口
  { path: '/knowledge-graph', label: '知识图谱', icon: 'graph' },
  // F6: 语音辅导（语音版 AI 导师）
  { path: '/voice-tutor', label: '语音辅导', icon: 'voice' },
  // { path: '/peer', label: '同伴学习', icon: 'users' },  // 赛事展示范围裁剪，已移除
  // T0-3: admission 已移除
]

function isCurrent(path) {
  if (path === '/') return route.path === '/' || route.path === '/chat'
  return route.path.startsWith(path)
}

function onNavClick() {
  // Close mobile drawer on navigation
  closeMobile()
}

// ---- Breadcrumb ----
const currentPageTitle = computed(() => route.meta.title || '研芯通')

// ---- Theme toggle ----
const currentTheme = ref(getCurrentTheme())
function handleToggleTheme() {
  currentTheme.value = toggleTheme()
}

// ---- User menu ----
const userMenuOpen = ref(false)
function toggleUserMenu() {
  // Always toggle the dropdown menu — never redirect directly.
  // Guest sees "登录/注册" button inside the menu; logged-in user sees profile + signOut.
  userMenuOpen.value = !userMenuOpen.value
}

function goProfile() {
  userMenuOpen.value = false
  router.push('/profile')
}

async function handleSignOut() {
  userMenuOpen.value = false
  try {
    await auth.signOut()
  } catch (e) {
    console.error('[AppLayout] signOut failed:', e)
  }
  window.location.href = '/login'
}

function goLogin() {
  window.location.href = '/login'
}

// ---- Computed ----
const avatarChar = computed(() => {
  const name = auth.displayName
  if (!name || name === '未登录') return '?'
  if (auth.isGuest) return '游'
  return name.charAt(0)
})

const isGuest = computed(() => auth.isGuest)
const isAuthenticated = computed(() => auth.isAuthenticated)

const syncStatusText = computed(() => {
  if (!syncStore.configured) return ''
  return syncStore.lastSyncText || '从未同步'
})

const syncOk = computed(() => {
  return syncStore.configured && syncStore.status === 'success'
})

// ---- Click outside for user menu ----
const userMenuRef = ref(null)
function handleClickOutside(e) {
  if (userMenuRef.value && !userMenuRef.value.contains(e.target)) {
    userMenuOpen.value = false
  }
}

onMounted(() => {
  initSidebar()
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="yx-app">
    <!-- Mobile overlay -->
    <div
      class="yx-sidebar-overlay"
      :class="{ 'yx-sidebar-overlay--visible': mobileOpen }"
      @click="closeMobile"
    />

    <!-- Sidebar -->
    <aside
      class="yx-sidebar"
      :class="{
        'yx-sidebar--collapsed': collapsed && !mobileOpen,
        'yx-sidebar--mobile-open': mobileOpen,
        'yx-sidebar--user-pinned': userPinned
      }"
    >
      <!-- Toggle button (desktop) -->
      <button class="yx-sidebar__toggle" @click="toggleCollapsed" aria-label="折叠侧栏" :data-label="collapsed ? '展开侧栏' : '折叠侧栏'">
        <svg v-if="!collapsed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        <svg v-if="collapsed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      <!-- Logo Header -->
      <div class="yx-sidebar__header" @click="router.push('/')" title="返回首页">
        <svg class="yx-sidebar__logo" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="4" fill="var(--text-primary)" />
          <circle cx="20" cy="20" r="10" fill="none" stroke="var(--text-primary)" stroke-width="0.8" stroke-dasharray="2 3" opacity="0.5" />
          <circle cx="20" cy="6" r="1.5" fill="var(--primary)" />
          <circle cx="33.3" cy="15.5" r="1.5" fill="var(--secondary)" />
          <circle cx="28.2" cy="31.3" r="1.5" fill="var(--warning)" />
          <circle cx="11.8" cy="31.3" r="1.5" fill="var(--danger)" />
        </svg>
        <div>
          <div class="yx-sidebar__title">研芯通</div>
          <div class="yx-sidebar__subtitle">工科 AI 导师</div>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="yx-sidebar__nav">
        <div class="yx-sidebar__group-label">核心学习</div>
        <RouterLink
          v-for="item in coreNav"
          :key="item.path"
          :to="item.path"
          class="yx-sidebar__item"
          :class="{ 'yx-sidebar__item--active': isCurrent(item.path) }"
          :data-label="item.label"
          @click="onNavClick"
        >
          <!-- Icons -->
          <svg v-if="item.icon === 'sparkles'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 14l.8 2.4L22 17l-2.2.6L19 20l-.8-2.4L16 17l2.2-.6z"/></svg>
          <svg v-else-if="item.icon === 'target'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
          <svg v-else-if="item.icon === 'calendar'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>
          <svg v-else-if="item.icon === 'pencil'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/><path d="M15 5l4 4"/></svg>
          <svg v-else-if="item.icon === 'photo'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <svg v-else-if="item.icon === 'exam'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 14l2 2 4-4"/></svg>
          <svg v-else-if="item.icon === 'flask'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6v5l5 9a3 3 0 0 1-2.6 4.5H6.6A3 3 0 0 1 4 17l5-9V3z"/><path d="M7.5 13h9"/></svg>
          <span class="yx-sidebar__item-text">{{ item.label }}</span>
        </RouterLink>

        <div class="yx-sidebar__group-label">拓展工具</div>
        <RouterLink
          v-for="item in toolNav"
          :key="item.path"
          :to="item.path"
          class="yx-sidebar__item"
          :class="{ 'yx-sidebar__item--active': isCurrent(item.path) }"
          :data-label="item.label"
          @click="onNavClick"
        >
          <svg v-if="item.icon === 'briefcase'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
          <svg v-else-if="item.icon === 'users'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <svg v-else-if="item.icon === 'school'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5"/></svg>
          <svg v-else-if="item.icon === 'chip'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>
          <svg v-else-if="item.icon === 'edit'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          <svg v-else-if="item.icon === 'graph'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><path d="M8.5 7.5L11 15.5M15.5 7.5L13 15.5M8 6h8"/></svg>
          <svg v-else-if="item.icon === 'voice'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v4M8 23h8"/></svg>
          <span class="yx-sidebar__item-text">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <!-- Footer -->
      <div class="yx-sidebar__footer">
        <!-- Sync status -->
        <div
          v-if="syncStore.configured && isAuthenticated"
          class="yx-sidebar__sync"
          :class="{ 'yx-sidebar__sync--ok': syncOk }"
        >
          <span class="yx-sidebar__sync-dot" />
          <span class="yx-sidebar__sync-text">{{ syncOk ? '已同步' : '待同步' }} · {{ syncStatusText }}</span>
        </div>

        <!-- User area -->
        <div ref="userMenuRef" style="position: relative;">
          <div class="yx-sidebar__user" :data-label="auth.displayName" @click="toggleUserMenu">
            <div class="yx-sidebar__avatar">{{ avatarChar }}</div>
            <div class="yx-sidebar__user-info">
              <div class="yx-sidebar__user-name">{{ auth.displayName }}</div>
              <div
                class="yx-sidebar__user-status"
                :class="{ 'yx-sidebar__user-status--guest': isGuest }"
              >
                {{ isGuest ? '游客模式' : '已登录' }}
              </div>
            </div>
          </div>

          <!-- User dropdown -->
          <div v-if="userMenuOpen" class="yx-sidebar__dropdown">
            <!-- Guest menu: login/register -->
            <template v-if="isGuest">
              <div class="yx-sidebar__dropdown-header">
                <span class="yx-sidebar__dropdown-tag">游客模式</span>
              </div>
              <button class="yx-sidebar__dropdown-item yx-sidebar__dropdown-item--primary" @click="goLogin">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5M15 12H3"/></svg>
                登录 / 注册
              </button>
            </template>
            <!-- Logged-in menu: profile + signOut -->
            <template v-else>
              <button class="yx-sidebar__dropdown-item" @click="goProfile">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                学生画像
              </button>
              <button class="yx-sidebar__dropdown-item yx-sidebar__dropdown-item--danger" @click="handleSignOut">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>
                退出登录
              </button>
            </template>
          </div>
        </div>

        <!-- Guest login button -->
        <button v-if="isGuest" class="yx-sidebar__guest-btn" @click="goLogin">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5M15 12H3"/></svg>
          <span>登录 / 注册</span>
        </button>
      </div>
    </aside>

    <!-- Main area -->
    <div class="yx-main">
      <!-- Slim topbar -->
      <header class="yx-topbar">
        <div class="yx-topbar__left">
          <button class="yx-hamburger" @click="mobileOpen = true" aria-label="打开菜单">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <div class="yx-breadcrumb">
            <span class="yx-breadcrumb__current">{{ currentPageTitle }}</span>
          </div>
        </div>

        <div class="yx-topbar__actions">
          <!-- Theme toggle -->
          <button class="yx-theme-toggle" @click="handleToggleTheme" title="切换主题">
            <svg class="yx-theme-toggle__sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
            <svg class="yx-theme-toggle__moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>

          <!-- Guest capsule -->
          <button v-if="isGuest" class="yx-guest-capsule" @click="goLogin">
            游客模式 · 点击登录
          </button>
        </div>
      </header>

      <!-- Content -->
      <main class="yx-content">
        <slot />
      </main>

      <!-- AI notice -->
      <div class="yx-ai-notice">
        ✦ 本平台内容由人工智能生成，仅供学习参考，请以官方信息为准
      </div>
    </div>
  </div>
</template>
