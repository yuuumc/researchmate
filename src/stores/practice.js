// ============================================================
// 练习题 store（v3.1 新增）
// ============================================================
// 调用 POST /api/agent { action: 'practice' }
// input: { knowledge_point, difficulty?, question_type?, count?, student_level? }
// 响应 structured: { questions: [...] }
// ============================================================

import { defineStore } from 'pinia'
import { callAgent } from '@/api/agent'

export const usePracticeStore = defineStore('practice', {
  state: () => ({
    loading: false,
    error: null,
    result: null  // { content, structured }
  }),

  getters: {
    questions: (state) => state.result?.structured?.questions || [],
    hasResult: (state) => !!state.result
  },

  actions: {
    async runPractice(input) {
      this.loading = true
      this.error = null
      try {
        const res = await callAgent('practice', input)
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
