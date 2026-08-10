// ============================================================
// 多设备同步状态 store（v2.5 · UI 层）
// ============================================================
// 状态机：idle → syncing → success | conflict | offline | error
// 消费方：SyncStatusBar（状态展示 + 手动同步）、ConflictResolveModal（冲突解决）
// 数据层调用：services/sync.js 的 realPushProfile / realPullProfile
// 合并规则：utils/conflictMerge.js（数据层 sync.js 无字段级合并，UI 层补齐）
// ============================================================
import { defineStore } from 'pinia'
import { useProfileStore } from '@/stores/profile'
import { useAuthStore } from '@/stores/auth'
import { realPushProfile, realPullProfile } from '@/services/sync'
import { isSupabaseConfigured } from '@/services/supabase'
import { diffFields, mergeProfiles } from '@/utils/conflictMerge'

const LS_LAST_SYNC = 'researchmate_last_sync_at'

function readLastSync() {
  try {
    return localStorage.getItem(LS_LAST_SYNC) || null
  } catch (_) {
    return null
  }
}

export const useSyncStore = defineStore('sync', {
  state: () => ({
    /** idle | syncing | success | conflict | offline | error */
    status: 'idle',
    lastSyncAt: readLastSync(),
    /** { local, remote, diffs } | null */
    conflict: null,
    lastError: null,
    online: typeof navigator === 'undefined' ? true : navigator.onLine
  }),

  getters: {
    configured: () => Boolean(isSupabaseConfigured),
    statusLabel(state) {
      const map = {
        idle: '待同步',
        syncing: '同步中',
        success: '已同步',
        conflict: '有冲突',
        offline: '离线',
        error: '同步失败'
      }
      return map[state.status] || '待同步'
    },
    lastSyncText(state) {
      if (!state.lastSyncAt) return '从未同步'
      const t = new Date(state.lastSyncAt).getTime()
      const diff = Date.now() - t
      if (diff < 60 * 1000) return '刚刚'
      if (diff < 3600 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
      if (diff < 86400 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
      return new Date(state.lastSyncAt).toLocaleDateString('zh-CN')
    }
  },

  actions: {
    setOnline(online) {
      this.online = online
      if (!online) this.status = 'offline'
      else if (this.status === 'offline') this.status = 'idle'
    },

    markSynced() {
      this.lastSyncAt = new Date().toISOString()
      try {
        localStorage.setItem(LS_LAST_SYNC, this.lastSyncAt)
      } catch (_) { /* 隐私模式忽略 */ }
      this.status = 'success'
    },

    /**
     * 手动同步（SyncStatusBar 按钮触发）
     * 流程：拉远端 → 无远端推本地 / 一致按新旧取舍 / 有 diff 且远端更新 → conflict
     */
    async syncNow() {
      const auth = useAuthStore()
      const profileStore = useProfileStore()

      if (!this.configured) {
        this.lastError = new Error('未配置 Supabase，同步不可用')
        this.status = 'error'
        return false
      }
      if (!auth.isAuthenticated) {
        this.lastError = new Error('未登录，同步不可用')
        this.status = 'error'
        return false
      }
      if (!this.online) {
        this.status = 'offline'
        return false
      }

      this.status = 'syncing'
      this.lastError = null
      try {
        const remote = await realPullProfile()
        const local = profileStore.profile

        if (!remote) {
          // 远端无记录 → 推本地
          await realPushProfile(local)
          this.markSynced()
          return true
        }

        const diffs = diffFields(local, remote)
        if (diffs.length === 0) {
          // 内容一致 → 直接标记成功
          this.markSynced()
          return true
        }

        const lt = new Date(local.updated_at || 0).getTime()
        const rt = new Date(remote.updated_at || 0).getTime()
        if (lt >= rt) {
          // 本地更新 → 推本地
          await realPushProfile(local)
          this.markSynced()
          return true
        }

        // 远端更新且内容有 diff → 进入冲突窗口
        this.conflict = { local: { ...local }, remote, diffs }
        this.status = 'conflict'
        return false
      } catch (e) {
        console.error('[sync-store] syncNow failed:', e)
        this.lastError = e
        this.status = this.online ? 'error' : 'offline'
        return false
      }
    },

    /**
     * 解决冲突（ConflictResolveModal 应用）
     * @param {Record<string, 'local'|'remote'|'suggested'>} choices
     */
    async resolveConflict(choices) {
      if (!this.conflict) return false
      const profileStore = useProfileStore()
      this.status = 'syncing'
      try {
        const merged = mergeProfiles(this.conflict.local, this.conflict.remote, choices)
        profileStore.updateProfile(merged)
        await realPushProfile(profileStore.profile)
        this.conflict = null
        this.markSynced()
        return true
      } catch (e) {
        console.error('[sync-store] resolveConflict failed:', e)
        this.lastError = e
        this.status = 'error'
        return false
      }
    },

    dismissConflict() {
      this.conflict = null
      this.status = 'idle'
    }
  }
})
