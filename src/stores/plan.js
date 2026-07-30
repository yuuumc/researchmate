// ============================================================
// 复习计划 store（v2 升级为 plan_version 迭代，v3.1 接入 Agent API）
// ============================================================
// 数据契约：
//   currentVersion: 当前生效版本号（整数）
//   versions: [{ version, created_at, based_on_diagnosis, weeks, adjustments, completion_rate }]
// v3.1 新增：runPlan() → POST /api/agent { action: 'plan' }
// ============================================================

import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'
import { callAgent } from '@/api/agent'

const STORAGE_KEY = 'plan_version'

export const usePlanStore = defineStore('plan', {
  state: () => {
    const saved = storage.get(STORAGE_KEY)
    return {
      currentVersion: saved?.currentVersion || 0,
      versions: saved?.versions || [],
      // v3.1: Agent API 调用状态
      loading: false,
      error: null,
      lastPlan: null  // { content, structured } 最近一次 Agent 返回
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
    },

    // v3.1: 调用 Agent API 生成计划
    // input: { student_name, target_major, diagnosis_result?, exam_date?, weekly_hours? }
    async runPlan(input) {
      this.loading = true
      this.error = null
      try {
        const res = await callAgent('plan', input)
        this.lastPlan = {
          content: res.content || '',
          structured: res.structured || null
        }

        // 同步存入 versions
        const s = res.structured || {}
        this.addPlan({
          based_on_diagnosis: input.diagnosis_result || null,
          weeks: s.weeks || [],
          adjustments: s.adjustments || { keep: [], strengthen: [], drop: [] },
          raw_plan: res.content || ''
        })

        return this.lastPlan
      } catch (e) {
        this.error = e.message
        throw e
      } finally {
        this.loading = false
      }
    }
  }
})
