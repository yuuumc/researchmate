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
    path: '/diagnosis/session',
    name: 'diagnosis-session',
    component: () => import('@/views/DiagnosisSessionView.vue'),
    meta: { title: '混合诊断', requireAuth: true, agent: 'diagnose' }
  },
  // T0-3: 隐藏科研探索/择校分析入口（路由重定向，组件保留）
  { path: '/research', redirect: '/' },
  { path: '/admission', alias: '/school', redirect: '/' },
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
  // B2: AI 白板推导
  {
    path: '/derivation',
    name: 'derivation',
    component: () => import('@/views/DerivationView.vue'),
    meta: { title: '白板推导', agent: 'tutor' }
  },
  // B3: 变式题练习
  {
    path: '/variant/:topic',
    name: 'variant-practice',
    component: () => import('@/views/VariantPracticeView.vue'),
    meta: { title: '变式练习', requireAuth: true }
  },
  // B5: 多 Agent 架构看板（数据来自 agent_traces 真实落库，只读展示）
  {
    path: '/architecture',
    name: 'architecture',
    component: () => import('@/views/ArchitectureView.vue'),
    meta: { title: '架构看板', agent: 'cascade' }
  },
  // B4: 知识图谱可视化
  {
    path: '/knowledge-graph',
    name: 'knowledge-graph',
    component: () => import('@/views/KnowledgeGraphView.vue'),
    meta: { title: '知识图谱', agent: 'tutor' }
  },
  // F2: 拍题讲解（多模态）
  {
    path: '/tutor-photo',
    name: 'tutor-photo',
    component: () => import('@/views/TutorPhotoView.vue'),
    meta: { title: '拍题讲解', agent: 'tutor' }
  },
  // 同伴学习模块：赛事展示范围裁剪（2026-08-16），入口移除、代码保留待赛后迭代启用
  // 直接访问 /peer 重定向回首页；PeerView.vue / stores/peer.js / api peer action 均未删除
  { path: '/peer', alias: '/peers', redirect: '/' },
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
