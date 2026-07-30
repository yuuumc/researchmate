// ============================================================
// 诊断历史 store（v1 列表，v2 升级为 5 轮对比，v3.1 接入 Agent API）
// ============================================================
// 数据契约：数组（严禁 Set/Map）
//   每条记录：{ id, timestamp, score, weak_points, root_causes, raw_report }
// v3.1 新增：runDiagnosis() → POST /api/agent { action: 'diagnose' }
// ============================================================

import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'
import { callAgent } from '@/api/agent'

const STORAGE_KEY = 'diagnosis_history'

export const useDiagnosisStore = defineStore('diagnosis', {
  state: () => ({
    history: storage.get(STORAGE_KEY) || [],
    // v3.1: Agent API 调用状态
    loading: false,
    error: null,
    lastReport: null  // { content, structured } 最近一次 Agent 返回
  }),

  getters: {
    count: (state) => state.history.length,
    latest: (state) => state.history[state.history.length - 1] || null,
    // v2: 5 轮趋势
    scoreTrend: (state) => state.history.slice(-5).map((h) => h.score)
  },

  actions: {
    persist() {
      storage.set(STORAGE_KEY, this.history)
    },

    add(record) {
      const item = {
        id: `diag-${Date.now()}`,
        timestamp: new Date().toISOString(),
        score: record.score,
        subject: record.subject || '',
        weak_points: Array.isArray(record.weak_points) ? record.weak_points : [],
        root_causes: Array.isArray(record.root_causes) ? record.root_causes : [],
        raw_report: record.raw_report || '',
        // v2: 知识点变化对比用
        topics_snapshot: record.topics_snapshot || [],
        // v1.5: ability_stars 快照（HistoryView 趋势图用）
        ability_stars_snapshot: record.ability_stars_snapshot || {}
      }
      this.history.push(item)
      this.persist()
      return item
    },

    getById(id) {
      return this.history.find((h) => h.id === id)
    },

    clear() {
      this.history = []
      this.persist()
    },

    // v3.1: 调用 Agent API 执行诊断
    // input: { student_name, target_major, mastered_skills, weak_points?, knowledge_points? }
    async runDiagnosis(input) {
      this.loading = true
      this.error = null
      try {
        const res = await callAgent('diagnose', input)
        this.lastReport = {
          content: res.content || '',
          structured: res.structured || null
        }

        // 同步存入 history
        const s = res.structured || {}
        this.add({
          score: s.score ?? null,
          subject: input.target_major || '',
          weak_points: s.weak_points || input.weak_points || [],
          root_causes: s.root_causes || s.direct_causes || [],
          raw_report: res.content || '',
          topics_snapshot: s.knowledge_points || [],
          ability_stars_snapshot: s.ability_stars || {}
        })

        return this.lastReport
      } catch (e) {
        this.error = e.message
        throw e
      } finally {
        this.loading = false
      }
    }
  }
})
