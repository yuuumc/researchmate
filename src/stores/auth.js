// ============================================================
// Auth store（v2.0 多用户 SaaS · 数据层 · v3.2 游客登录）
// ============================================================
// 登录路径：
//   1) bootstrap 自动恢复（useAuthBootstrap.bindAuthUser）
//   2) verifyOtp 手机号 OTP
//   3) wechatLogin 微信扫码（v2.5 接 Provider，v2.0 留 stub）
//   4) guestLogin 游客登录（v3.2 · 比赛/演示用，不走 Supabase）
//
// 教师身份 = 双源（user_metadata.role UI 速判 + classes.teacher_id 业务真相）
// 业务过滤全靠 Supabase RLS，前端不传 user_id
// ============================================================
import { defineStore } from 'pinia'
import { supabase } from '@/services/supabase'
import { realListClasses } from '@/services/teacher'

const GUEST_STORAGE_KEY = 'yanxintong.guest'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,                  // Supabase auth user 对象
    session: null,               // 当前 session（保留 user 引用）
    teacherClasses: [],          // 教师名下非归档班级
    loadingTeacherClasses: false,
    lastError: null
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.user),
    /** UI 速判：user_metadata.role === 'teacher' */
    isTeacher: (state) => Boolean(state.user && state.user.user_metadata && state.user.user_metadata.role === 'teacher'),
    /** 业务真相：teacherClasses 非空（双源之一） */
    hasTeacherClasses: (state) => state.teacherClasses.length > 0,
    userId: (state) => (state.user && state.user.id) || null,
    phone: (state) => (state.user && state.user.phone) || null,
    displayName: (state) => {
      if (!state.user) return '未登录'
      const meta = state.user.user_metadata || {}
      return meta.name || state.user.phone || '已登录用户'
    },
    /** 是否为游客用户（未经 Supabase 认证） */
    isGuest: (state) => Boolean(state.user && state.user.user_metadata && state.user.user_metadata.is_guest)
  },

  actions: {
    /**
     * composable 调用：把 supabase user 同步到 state
     * 如果没有真实用户，尝试从 localStorage 恢复游客状态
     * @param {object|null} user
     */
    setSession(user) {
      if (!user) {
        try {
          const saved = localStorage.getItem(GUEST_STORAGE_KEY)
          if (saved) {
            const guestUser = JSON.parse(saved)
            this.user = guestUser
            this.session = { user: guestUser }
            this.lastError = null
            return
          }
        } catch (_) {}
      }
      this.user = user
      this.session = user ? { user } : null
      this.lastError = null
    },

    clearSession() {
      this.user = null
      this.session = null
      this.teacherClasses = []
      this.loadingTeacherClasses = false
    },

    /**
     * 教师拉自己名下非归档班级
     * 业务真相：classes.teacher_id = auth.uid() 由 RLS 强制
     * @returns {Promise<Array>}
     */
    async loadTeacherClasses() {
      if (!this.isAuthenticated) {
        this.teacherClasses = []
        return []
      }
      this.loadingTeacherClasses = true
      try {
        const list = await realListClasses()
        this.teacherClasses = list
        return list
      } catch (e) {
        console.error('[auth] loadTeacherClasses failed:', e)
        this.lastError = e
        this.teacherClasses = []
        return []
      } finally {
        this.loadingTeacherClasses = false
      }
    },

    /**
     * 手机号 OTP 登录
     * @param {string} phone - E.164 格式（如 +8613800138000）
     * @param {string} token - 6 位验证码
     */
    async verifyOtp(phone, token) {
      this.lastError = null
      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms'
      })
      if (error) {
        this.lastError = error
        throw error
      }
      // 状态同步由 onAuthStateChange → bindAuthUser 触发；这里额外主动拉一次班级
      if (data && data.user) {
        await this.loadTeacherClasses()
      }
      return data
    },

    /**
     * 微信扫码登录（v2.0 数据层就绪，Provider/UI 留到 v2.5）
     * 抛 NotImplemented 让 UI 知道当前未接 Supabase Provider
     */
    async wechatLogin(_payload = {}) {
      this.lastError = null
      const err = new Error(
        '[auth] 微信扫码登录尚未接入 Supabase Provider，v2.0 数据层就绪，UI/Provider 留到 v2.5'
      )
      this.lastError = err
      throw err
    },

    /**
     * 游客登录（比赛/演示用，不走 Supabase 认证）
     * 创建本地游客用户，状态持久化到 localStorage
     * 游客可使用聊天/诊断/规划等功能，但无多设备同步和教师功能
     */
    guestLogin() {
      const guestId = 'guest_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
      const guestUser = {
        id: guestId,
        phone: null,
        user_metadata: {
          name: '游客用户',
          role: 'student',
          is_guest: true
        }
      }
      this.user = guestUser
      this.session = { user: guestUser }
      this.teacherClasses = []
      this.lastError = null
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guestUser))
      } catch (_) {}
    },

    /** 退出登录 */
    async signOut() {
      this.lastError = null
      // 清除游客状态
      try { localStorage.removeItem(GUEST_STORAGE_KEY) } catch (_) {}
      // 游客直接清空，不走 Supabase signOut
      if (this.isGuest) {
        this.clearSession()
        return
      }
      const { error } = await supabase.auth.signOut()
      if (error) {
        this.lastError = error
        throw error
      }
      // 状态由 onAuthStateChange → bindAuthUser → auth.clearSession 清
    }
  }
})
