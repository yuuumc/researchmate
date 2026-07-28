// ============================================================
// Auth 启动 composable（v2.0 多用户 SaaS）
// ============================================================
// 在 main.js 启动时调一次：bootstrap() 恢复本地会话
// onAuthStateChange 监听登录/登出/refresh
// 两者都调 bindAuthUser，把 auth.users.id 注入到 profile store
//
// 三处登录路径（bootstrap 自动恢复 / verifyOtp / wechatLogin）
// 都通过 bindAuthUser → auth.loadTeacherClasses() 触发教师班级加载
// ============================================================
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/profile'
import { supabase } from '@/services/supabase'

/**
 * @returns {{
 *   bootstrap: () => Promise<{ unsubscribe: () => void }>,
 *   bindAuthUser: (authUser: object|null) => void
 * }}
 */
export function useAuthBootstrap() {
  const auth = useAuthStore()
  const profile = useProfileStore()

  /**
   * 把 supabase auth user 同步到 auth store + profile store
   * @param {object|null} authUser - supabase.auth user 对象
   */
  function bindAuthUser(authUser) {
    // 1. auth store 状态同步
    auth.setSession(authUser)
    if (authUser) {
      // 2. profile.user_id 对齐到 auth.users.id（首次登录用 auth.id 覆盖本地临时 uuid）
      profile.bindAuthUser(authUser.id, {
        phone: authUser.phone || null,
        name: authUser.user_metadata?.name || null,
        role: authUser.user_metadata?.role || 'student',
        avatar_url: authUser.user_metadata?.avatar_url || null
      })
      // 3. 加载教师班级（RLS 强制 teacher_id = auth.uid()，非教师会拿到空数组）
      auth.loadTeacherClasses().catch((e) => {
        console.error('[auth-bootstrap] loadTeacherClasses failed:', e)
      })
    } else {
      auth.clearSession()
    }
  }

  /**
   * 启动：恢复本地 session + 订阅 auth 变化
   * @returns {Promise<{ unsubscribe: () => void }>}
   */
  async function bootstrap() {
    // 1. 恢复本地 session
    const { data: { session } } = await supabase.auth.getSession()
    if (session && session.user) {
      bindAuthUser(session.user)
    } else {
      auth.clearSession()
    }
    // 2. 监听后续登录/登出/refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      bindAuthUser(newSession?.user || null)
    })
    return {
      unsubscribe: () => subscription.unsubscribe()
    }
  }

  return { bootstrap, bindAuthUser }
}
