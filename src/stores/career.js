// ============================================================
// 就业指导 store（v3.1 新增）
// ============================================================
// 调用 POST /api/agent { action: 'career' }
// input: { student_name, target_school, target_major, mastered_skills?, weak_points? }
// 响应 structured: { career_paths: [...], school_profile: {...} }
// ============================================================

import { defineStore } from 'pinia'
import { callAgent } from '@/api/agent'

export const useCareerStore = defineStore('career', {
  state: () => ({
    loading: false,
    error: null,
    result: null  // { content, structured }
  }),

  getters: {
    careerPaths: (state) => state.result?.structured?.career_paths || [],
    hasResult: (state) => !!state.result
  },

  actions: {
    async runCareer(input) {
      this.loading = true
      this.error = null
      try {
        const res = await callAgent('career', input)
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
