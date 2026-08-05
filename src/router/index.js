import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { isSupabaseConfigured } from '@/services/supabase'
import { whenAuthReady } from '@/utils/authReady'
import { needsWizard } from '@/services/profileService'

// ============================================================
// 路由表（v2.0 + ProfileWizard）
// ============================================================
const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: '登录', public: true, hideTopBar: true }
  },
  {
    path: '/profile/wizard',
    name: 'profile-wizard',
    component: () => import('@/views/ProfileWizardView.vue'),
    meta: { title: '完善画像', requireAuth: true, hideTopBar: true }
  },
  {
    path: '/profile/edit',
    name: 'profile-edit',
    component: () => import('@/views/ProfileWizardView.vue'),
    meta: { title: '编辑画像', requireAuth: true, hideTopBar: true }
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
    path: '/journey',
    name: 'journey',
    component: () => import('@/views/JourneyView.vue'),
    meta: { title: '旗舰旅程', agent: 'cascade' }
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

  // 3. 等 bootstrap 完成
  await whenAuthReady()

  const auth = useAuthStore()

  // 4. requireAuth：未登录 → /login
  const requiresAuth = !to.meta.public
  if (requiresAuth && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // 4.5 向导拦截：已登录但未完成向导 → /profile/wizard（除非已在向导/编辑页）
  if (auth.isAuthenticated && !['profile-wizard', 'profile-edit'].includes(to.name) && !auth.isGuest) {
    try {
      const needWizard = await needsWizard()
      if (needWizard) {
        return { path: '/profile/wizard' }
      }
    } catch (e) {
      // needsWizard 失败不阻塞导航
      console.warn('[router] wizard check failed:', e)
    }
  }

  // 5. requireTeacher
  if (to.meta.requireTeacher) {
    if (auth.isTeacher || auth.hasTeacherClasses) return true
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
