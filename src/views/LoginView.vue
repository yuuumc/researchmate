<script setup>
// ============================================================
// LoginView · /login 路由页（v2.5）
// ============================================================
// 内嵌 AuthModal（inline 模式）。登录成功后按双源路由分发：
//   教师（isTeacher || hasTeacherClasses）→ /teacher/classes
//   学生 → query.redirect || /chat（主聊天）
// 已登录用户直接按上规则跳转，不重复展示表单。
// ============================================================
import { watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AuthModal from '@/components/AuthModal.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

async function dispatchByRole() {
  // 等教师班级加载完，双源判断
  if (!auth.hasTeacherClasses && !auth.loadingTeacherClasses) {
    try {
      await auth.loadTeacherClasses()
    } catch (_) { /* RLS 拒绝即非教师，忽略 */ }
  }
  const isTeacherSide = auth.isTeacher || auth.hasTeacherClasses
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null
  if (isTeacherSide) {
    // 教师：redirect 仅当目标是教师侧才尊重，否则固定去班级列表
    if (redirect && redirect.startsWith('/teacher')) router.replace(redirect)
    else router.replace('/teacher/classes')
  } else {
    router.replace(redirect || '/chat')
  }
}

function onSuccess() {
  dispatchByRole()
}

onMounted(() => {
  if (auth.isAuthenticated) dispatchByRole()
})

watch(
  () => auth.isAuthenticated,
  (v) => {
    if (v) dispatchByRole()
  }
)
</script>

<template>
  <div class="login-page">
    <div class="login-hero">
      <h1 class="hero-title">研芯通</h1>
      <p class="hero-subtitle">工科生成长 AI 导师 · 多设备同步</p>
    </div>
    <AuthModal mode="inline" @success="onSuccess" />
  </div>
</template>

<style scoped>
.login-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8) var(--space-4);
  gap: var(--space-8);
}

.login-hero {
  text-align: center;
}

.hero-title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: var(--text-display);
  color: var(--color-ink-900);
}

.hero-subtitle {
  margin: var(--space-2) 0 0;
  font-size: var(--text-meta);
  color: var(--color-fg-tertiary);
}

@media (max-width: 480px) {
  .hero-title {
    font-size: var(--text-section);
  }
}
</style>
