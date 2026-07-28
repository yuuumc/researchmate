import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import router from './router'
import App from './App.vue'
import './styles/main.css'
import { bootstrapSubject } from './utils/subjectLoader'
import { useSubjectStore } from './stores/subject'
import { useAuthStore } from './stores/auth'
import { supabase, isSupabaseConfigured } from './services/supabase'
import { setAuthReady } from './utils/authReady'

// ============================================================
// 学科运行时加载（v2.0 学科路由）
// ============================================================
// 决策优先级：
//   1. URL 参数 ?subject=cs（一次性，覆盖后写 localStorage）
//   2. localStorage 持久化的用户偏好
//   3. import.meta.env.VITE_SUBJECT（构建期默认，向后兼容 v1.5）
//   4. /knowledge/subjects.json 注册表第一项
//
// v2.0 验收：
//   - 新增学科 = 上传 JSON + 在 subjects.json 加一条 + ?subject=xxx
//   - 不再需要：改 .env / 重新 build
//
// v1.5 → v2.0 兼容：
//   - VITE_SUBJECT 仍可作为构建期默认值（不在 .env 中则忽略）
//   - localStorage 已有偏好则继续生效
// ============================================================

// ============================================================
// Auth bootstrap（v2.5）
// ============================================================
// - 拉 session → 同步到 auth store
// - 订阅 onAuthStateChange，后续登录/退出自动更新 store
// - 登录后调 loadTeacherClasses 拿业务真相（双源）
// - 调 setAuthReady() 解锁 router guard
// ============================================================

async function bootstrapAuth() {
  const auth = useAuthStore()
  if (!isSupabaseConfigured) {
    // 优雅降级：未配置就不动 auth store，setAuthReady 解锁路由
    setAuthReady()
    return
  }
  try {
    const { data: { session } } = await supabase.auth.getSession()
    auth.setSession(session?.user || null)
    if (auth.isAuthenticated) {
      // 不阻塞 setAuthReady；teacherClasses 是教师路由的判定输入
      auth.loadTeacherClasses().catch((e) => {
        console.warn('[main] bootstrap loadTeacherClasses 失败：', e)
      })
    }
  } catch (e) {
    console.error('[main] bootstrap getSession 失败：', e)
  } finally {
    setAuthReady()
  }

  // 订阅后续变化
  supabase.auth.onAuthStateChange((_event, session) => {
    const u = session?.user || null
    auth.setSession(u)
    if (auth.isAuthenticated) {
      auth.loadTeacherClasses().catch((e) => {
        console.warn('[main] onAuthStateChange loadTeacherClasses 失败：', e)
      })
    } else {
      auth.clearSession()
    }
  })
}

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

app.mount('#app')

// 异步启动（不阻塞首屏）
async function bootstrap() {
  // 0. Auth bootstrap（解锁路由守卫）
  await bootstrapAuth()

  // 1. 读 URL 参数
  const urlParams = new URLSearchParams(window.location.search)
  const urlSubject = urlParams.get('subject')

  // 2. 走 subjectStore 完成学科加载（含持久化）
  const subjectStore = useSubjectStore()
  try {
    await subjectStore.init(urlSubject)
    if (subjectStore.isReady) {
      const s = subjectStore.current
      console.info(
        `[main] 学科: ${s.name} (${subjectStore.currentId}, source=${subjectStore.lastSource})`
      )
    }
  } catch (e) {
    console.error('[main] 学科 bootstrap 失败：', e)
  }
}

bootstrap()
