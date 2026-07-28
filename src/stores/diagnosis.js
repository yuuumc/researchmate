// ============================================================
// 诊断历史 store（v1 列表，v2 升级为 5 轮对比）
// ============================================================
// 数据契约：数组（严禁 Set/Map）
//   每条记录：{ id, timestamp, score, weak_points, root_causes, raw_report }
// ============================================================

import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'

const STORAGE_KEY = 'diagnosis_history'

export const useDiagnosisStore = defineStore('diagnosis', {
  state: () => ({
    history: storage.get(STORAGE_KEY) || []
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
    }
  }
})
