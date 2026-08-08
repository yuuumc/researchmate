// ============================================================
// Auth store（v2.7 邮箱+密码登录 · 数据隔离）
// ============================================================
// 登录路径：
//   1) bootstrap 自动恢复（useAuthBootstrap.bindAuthUser）
//   2) signUp 邮箱+密码注册（Confirm email 关闭后注册即登录）
//   3) signIn 邮箱+密码登录
//   4) guestLogin 游客登录（比赛/演示用，不走 Supabase）
//
// 数据隔离：
//   signUp / signIn 成功后清除游客遗留的本地业务数据
//   signOut 清除全部用户数据，确保回到游客模式是干净状态
//
// 教师身份 = 双源（user_metadata.role UI 速判 + classes.teacher_id 业务真相）
// 业务过滤全靠 Supabase RLS，前端不传 user_id
// ============================================================
import { defineStore } from 'pinia'
import { supabase } from '@/services/supabase'
import { realListClasses } from '@/services/teacher'
import { storage } from '@/utils/storage'
import { useProfileStore } from '@/stores/profile'
import { useDiagnosisStore } from '@/stores/diagnosis'

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
    email: (state) => (state.user && state.user.email) || null,
    displayName: (state) => {
      if (!state.user) return '未登录'
      const meta = state.user.user_metadata || {}
      return meta.name || state.user.email || '已登录用户'
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
     * 清除游客/用户遗留的本地业务数据
     * 清除：profile / diagnosis / plan / wrong_book / journey / subject / chat history / feedback / guest
     * 保留：主题设置（yanxintong-theme 用连字符前缀，不在清除范围）
     */
    clearLocalUserData() {
      storage.clearUserData()
      // 重置 Pinia store 内存状态，清除游客种子数据残留
      try {
        useProfileStore().$reset()
        useDiagnosisStore().$reset()
      } catch (e) {
        console.warn('[auth] Pinia store reset failed:', e)
      }
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
     * 邮箱+密码注册
     * 需要 Supabase Dashboard 关闭 Authentication → Providers → Email → Confirm email
     * 关闭后 signUp 成功即自动创建 session，无需邮件确认
     * 注册前清除游客遗留数据，确保新用户看到空状态
     * @param {string} email - 邮箱地址
     * @param {string} password - 密码（至少 6 位）
     */
    async signUp(email, password) {
      this.lastError = null
      // 清除游客遗留的本地业务数据，实现数据隔离
      this.clearLocalUserData()
      const { data, error } = await supabase.auth.signUp({ email, password })
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
     * 邮箱+密码登录
     * 登录前清除游客遗留数据，确保不串号
     * @param {string} email - 邮箱地址
     * @param {string} password - 密码
     */
    async signIn(email, password) {
      this.lastError = null
      // 清除游客遗留的本地业务数据，实现数据隔离
      this.clearLocalUserData()
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
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
        email: null,
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

    /** 退出登录，清除全部本地用户数据 */
    async signOut() {
      this.lastError = null
      // 清除全部本地用户业务数据（含游客数据），确保回到登录页是干净状态
      this.clearLocalUserData()
      // 游客直接清空内存状态，不走 Supabase signOut
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
