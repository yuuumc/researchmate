import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { isSupabaseConfigured } from '@/services/supabase'
import { whenAuthReady } from '@/utils/authReady'

// ============================================================
// 路由表（v2.5 增 /login + /teacher/*）
// ============================================================
// public: /login（未配置 Supabase 时也允许）
// requireAuth: /, /chat, /profile, /history, /plan（未配置时跳过）
// requireTeacher: /teacher/* （需 isTeacher || hasTeacherClasses）
//
// 守卫顺序：
//   1. 公开路由放行
//   2. 未配置 Supabase → 全放行（优雅降级）
//   3. 等 whenAuthReady()（防止首屏 user=null 误判）
//   4. requireAuth 未登录 → /login?redirect=...
//   5. requireTeacher 但非教师 → /
// ============================================================

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: '登录', public: true, hideTopBar: true }
  },
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '我的AI导师', agent: 'tutor' }
  },
  {
    path: '/chat',
    name: 'chat',
    component: () => import('@/views/ChatView.vue'),
    meta: { title: '智能对话', agent: 'tutor' }
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/ProfileView.vue'),
    meta: { title: '学生画像', agent: 'profile' }
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('@/views/HistoryView.vue'),
    meta: { title: '诊断历史', agent: 'diagnose' }
  },
  {
    path: '/diagnosis',
    name: 'diagnosis',
    component: () => import('@/views/DiagnosisView.vue'),
    meta: { title: '成长诊断', agent: 'diagnose' }
  },
  {
    path: '/research',
    name: 'research',
    component: () => import('@/views/ResearchView.vue'),
    meta: { title: '科研探索', agent: 'research' }
  },
  {
    path: '/admission',
    name: 'admission',
    component: () => import('@/views/AdmissionView.vue'),
    meta: { title: '择校推荐', agent: 'admission' }
  },
  {
    path: '/plan',
    name: 'plan',
    component: () => import('@/views/PlanView.vue'),
    meta: { title: '复习计划', agent: 'planner' }
  },
  {
    path: '/career',
    name: 'career',
    component: () => import('@/views/CareerView.vue'),
    meta: { title: '就业指导', agent: 'career' }
  },
  {
    path: '/practice',
    name: 'practice',
    component: () => import('@/views/PracticeView.vue'),
    meta: { title: '练习题', agent: 'practice' }
  },
  {
    path: '/peer',
    name: 'peer',
    component: () => import('@/views/PeerView.vue'),
    meta: { title: '同伴匹配', agent: 'peer' }
  },
  {
    path: '/teacher/classes',
    name: 'teacher-classes',
    component: () => import('@/views/teacher/ClassListView.vue'),
    meta: { title: '我的班级', requireTeacher: true }
  },
  {
    path: '/teacher/classes/:id/stats',
    name: 'teacher-class-stats',
    component: () => import('@/views/teacher/ClassStatsView.vue'),
    meta: { title: '班级统计', requireTeacher: true }
  },
  {
    path: '/teacher/students/:studentId',
    name: 'teacher-student-profile',
    component: () => import('@/views/teacher/StudentProfileView.vue'),
    meta: { title: '学生画像', requireTeacher: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

router.beforeEach(async (to) => {
  // 1. 公开路由
  if (to.meta.public) return true

  // 2. 未配置 Supabase → 优雅降级，全放行
  if (!isSupabaseConfigured) return true

  // 3. 等 bootstrap 完成（user 已被 onAuthStateChange 写入 auth store）
  await whenAuthReady()

  const auth = useAuthStore()

  // 4. requireAuth：未登录 → /login
  const requiresAuth = !to.meta.public
  if (requiresAuth && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // 5. requireTeacher：业务真相 + UI 速判（双源），需 fresh loadTeacherClasses
  if (to.meta.requireTeacher) {
    if (auth.isTeacher || auth.hasTeacherClasses) return true
    // 双源都不满足时再 fresh load 一次（防止初始 bootstrap 还没拉到 classes）
    await auth.loadTeacherClasses()
    if (auth.isTeacher || auth.hasTeacherClasses) return true
    return { path: '/' }
  }

  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 研芯通` : '研芯通'
})

export default router
