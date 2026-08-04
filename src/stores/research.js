// ============================================================
// 科研探索 store（P1 #6 · 接入 research Agent API）
// ============================================================
// 调用 POST /api/agent { action: 'research' }
// input: { student_name, target_major, target_direction, current_stage, plan_result }
// 响应 structured: { roadmap, papers, tech_stack, labs, summary }
// ============================================================

import { defineStore } from 'pinia'
import { callAgent } from '@/api/agent'

export const useResearchStore = defineStore('research', {
  state: () => ({
    loading: false,
    error: null,
    result: null  // { content, structured }
  }),

  getters: {
    hasResult: (state) => !!state.result,
    structured: (state) => state.result?.structured || null,
    roadmap: (state) => state.result?.structured?.roadmap || [],
    papers: (state) => state.result?.structured?.papers || [],
    techStack: (state) => state.result?.structured?.tech_stack || [],
    labs: (state) => state.result?.structured?.labs || [],
    summary: (state) => state.result?.structured?.summary || ''
  },

  actions: {
    async runResearch(input) {
      this.loading = true
      this.error = null
      try {
        const res = await callAgent('research', input)
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
