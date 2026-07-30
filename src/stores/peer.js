// ============================================================
// 同伴匹配 store（v3.1 新增）
// ============================================================
// 调用 POST /api/agent { action: 'peer' }
// input: { student_name, target_school, target_major, mastered_skills, weak_points?, peer_pool? }
// 响应 structured: { matches: [...] }
// ============================================================

import { defineStore } from 'pinia'
import { callAgent } from '@/api/agent'

export const usePeerStore = defineStore('peer', {
  state: () => ({
    loading: false,
    error: null,
    result: null  // { content, structured }
  }),

  getters: {
    matches: (state) => state.result?.structured?.matches || [],
    hasResult: (state) => !!state.result
  },

  actions: {
    async runPeer(input) {
      this.loading = true
      this.error = null
      try {
        const res = await callAgent('peer', input)
        this.result = {
          content: res.content || '',
          structured: res.structured || null
        }
        return this.result
      } catch (e) {
        this.error = e.message
        throw e
      } finally {
        this.loading = false
      }
    },

    clear() {
      this.result = null
      this.error = null
    }
  }
})
