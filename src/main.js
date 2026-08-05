import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { ElButton, ElDialog, ElConfigProvider } from 'element-plus'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/config-provider/style/css'
import router from './router'
import App from './App.vue'
import './styles/main.css'
import './styles/tokens.css'        // v2.0 Design Tokens（UI 设计师交付）
import './styles/theme-tokens.css'
import './styles/sidebar-layout.css'  // W4 侧边栏布局样式  // v2.0 深浅双主题 Token（W4 主题切换）
import './styles/components.css'    // v2.0 yx- 组件库（UI 设计师交付）
import { bootstrapSubject } from './utils/subjectLoader'
import { useSubjectStore } from './stores/subject'
import { useAuthStore } from './stores/auth'
import { supabase, isSupabaseConfigured } from './services/supabase'
import { setAuthReady } from './utils/authReady'
import { injectSeedData } from './data/seedDemo'
import { initTheme } from './composables/useTheme'

// ============================================================
// Auth bootstrap（v2.5 + v2.0 向导拦截）
// ============================================================
async function bootstrapAuth() {
  const auth = useAuthStore()
  if (!isSupabaseConfigured) {
    setAuthReady()
    return
  }
  try {
    const { data: { session } } = await supabase.auth.getSession()
    auth.setSession(session?.user || null)
    if (auth.isAuthenticated) {
      auth.loadTeacherClasses().catch((e) => {
        console.warn('[main] bootstrap loadTeacherClasses 失败：', e)
      })
    }
  } catch (e) {
    console.error('[main] bootstrap getSession 失败：', e)
  } finally {
    setAuthReady()
  }

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
app.component('ElButton', ElButton)
app.component('ElDialog', ElDialog)
app.component('ElConfigProvider', ElConfigProvider)
app.mount('#app')

async function bootstrap() {
  initTheme()
  await bootstrapAuth()
  try { injectSeedData() } catch (e) { console.warn('[main] 种子数据注入失败：', e) }
  const urlParams = new URLSearchParams(window.location.search)
  const urlSubject = urlParams.get('subject')
  const subjectStore = useSubjectStore()
  try {
    await subjectStore.init(urlSubject)
    if (subjectStore.isReady) {
      const s = subjectStore.current
      console.info(`[main] 学科: ${s.name} (${subjectStore.currentId}, source=${subjectStore.lastSource})`)
    }
  } catch (e) {
    console.error('[main] 学科 bootstrap 失败：', e)
  }
}

// 全局未捕获 Promise rejection 兜底——避免请求静默失败导致按钮没反应
window.addEventListener('unhandledrejection', (e) => {
  console.error('[global] unhandled rejection:', e.reason)
})
window.addEventListener('error', (e) => {
  console.error('[global] uncaught error:', e.error || e.message)
})

bootstrap()
