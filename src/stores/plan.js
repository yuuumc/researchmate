// ============================================================
// 复习计划 store（v2 升级为 plan_version 迭代）
// ============================================================
// 数据契约：
//   currentVersion: 当前生效版本号（整数）
//   versions: [{ version, created_at, based_on_diagnosis, weeks, adjustments, completion_rate }]
// ============================================================

import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'

const STORAGE_KEY = 'plan_version'

export const usePlanStore = defineStore('plan', {
  state: () => {
    const saved = storage.get(STORAGE_KEY)
    return {
      currentVersion: saved?.currentVersion || 0,
      versions: saved?.versions || []
    }
  },

  getters: {
    current: (state) => state.versions.find((v) => v.version === state.currentVersion) || null,
    count: (state) => state.versions.length,
    // v3: 3 次迭代对比用
    recent3: (state) => state.versions.slice(-3)
  },

  actions: {
    persist() {
      storage.set(STORAGE_KEY, {
        currentVersion: this.currentVersion,
        versions: this.versions
      })
    },

    addPlan(plan) {
      const version = this.currentVersion + 1
      const item = {
        version,
        created_at: new Date().toISOString(),
        based_on_diagnosis: plan.based_on_diagnosis || null,
        weeks: Array.isArray(plan.weeks) ? plan.weeks : [],
        // v2: 3 类调整（保留 / 强化 / 放弃）
        adjustments: plan.adjustments || { keep: [], strengthen: [], drop: [] },
        completion_rate: null,
        raw_plan: plan.raw_plan || ''
      }
      this.versions.push(item)
      this.currentVersion = version
      this.persist()
      return item
    },

    updateCompletionRate(version, rate) {
      const item = this.versions.find((v) => v.version === version)
      if (item) {
        item.completion_rate = rate
        this.persist()
      }
    },

    rollback(version) {
      if (this.versions.find((v) => v.version === version)) {
        this.currentVersion = version
        this.persist()
      }
    },

    clear() {
      this.versions = []
      this.currentVersion = 0
      this.persist()
    }
  }
})
