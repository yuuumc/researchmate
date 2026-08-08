// ============================================================
// 复习计划 store（v2 plan_version 迭代，v3.1 接入 Agent API，v4 数据库持久化）
// ============================================================
// 数据契约：
//   currentVersion: 当前生效版本号（整数）
//   versions: [{ version, created_at, based_on_diagnosis, weeks, adjustments, completion_rate }]
// v3.1: runPlan() → POST /api/agent { action: 'plan' }
// v4 (W3-2): Supabase 持久化 — plans 表 + plan_progress 表
// ============================================================

import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'
import { callAgent } from '@/api/agent'
import { supabase, isSupabaseConfigured } from '@/services/supabase'

const STORAGE_KEY = 'plan_version'

export const usePlanStore = defineStore('plan', {
  state: () => {
    const saved = storage.get(STORAGE_KEY)
    return {
      currentVersion: saved?.currentVersion || 0,
      versions: saved?.versions || [],
      loading: false,
      error: null,
      lastPlan: null,
      // W3-2: 数据库持久化
      dbPlanId: null,
      progress: {},
      progressLoading: false
    }
  },

  getters: {
    current: (state) => state.versions.find((v) => v.version === state.currentVersion) || null,
    count: (state) => state.versions.length,
    recent3: (state) => state.versions.slice(-3),
    // W3-2: 基于进度计算完成率
    completionRate(state) {
      const plan = state.versions.find((v) => v.version === state.currentVersion)
      if (!plan?.weeks?.length) return 0
      let total = 0
      let done = 0
      for (const week of plan.weeks) {
        const tasks = week.tasks || []
        total += tasks.length
        const wn = week.week || 0
        done += (state.progress[wn] || []).length
      }
      return total > 0 ? Math.round((done / total) * 100) : 0
    }
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
      this.dbPlanId = null
      this.progress = {}
      this.persist()
    },

    // v3.1: 调用 Agent API 生成计划
    async runPlan(input) {
      this.loading = true
      this.error = null
      try {
        const res = await callAgent('plan', input)
        const s = res.structured || {}

        // P0 修复：规划结果为空（structured 缺失或无 weeks）时直接抛错，
        // 不落库、不生成空版本——否则 CURRENT PLAN 会渲染一张空白卡片
        if (!Array.isArray(s.weeks) || s.weeks.length === 0) {
          throw new Error('AI 未能生成有效计划（返回内容为空），请重试')
        }

        this.lastPlan = {
          content: res.content || '',
          structured: res.structured || null
        }

        const planItem = this.addPlan({
          based_on_diagnosis: input.diagnosis_result || null,
          weeks: s.weeks || [],
          adjustments: s.adjustments || { keep: [], strengthen: [], drop: [] },
          raw_plan: res.content || ''
        })

        // W3-2: 持久化到数据库（非阻塞，失败不影响 UI）
        await this.savePlanToDB(planItem)

        return this.lastPlan
      } catch (e) {
        this.error = e.message
        throw e
      } finally {
        this.loading = false
      }
    },

    // W3-2: 保存计划到 Supabase plans 表
    async savePlanToDB(planItem) {
      if (!isSupabaseConfigured) return null
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.warn('[plan] 未登录，跳过 DB 持久化')
          return null
        }

        // 停用旧计划
        await supabase
          .from('plans')
          .update({ active: false })
          .eq('user_id', user.id)

        const { data, error } = await supabase
          .from('plans')
          .insert({
            user_id: user.id,
            structured: {
              weeks: planItem.weeks,
              adjustments: planItem.adjustments,
              based_on_diagnosis: planItem.based_on_diagnosis,
              raw_plan: planItem.raw_plan,
              version: planItem.version
            },
            active: true
          })
          .select('id')
          .single()

        if (error) {
          console.warn('[plan] DB 保存失败:', error.message)
          return null
        }

        this.dbPlanId = data.id
        console.info('[plan] 计划已保存到数据库, id=', data.id)
        return data.id
      } catch (e) {
        console.warn('[plan] DB 保存异常:', e.message)
        return null
      }
    },

    // W3-2: 从数据库加载活跃计划
    async fetchActivePlan() {
      if (!isSupabaseConfigured) return null
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return null

        const { data, error } = await supabase
          .from('plans')
          .select('*')
          .eq('user_id', user.id)
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (error || !data) return null

        this.dbPlanId = data.id
        const s = data.structured || {}

        // 如果 localStorage 已有同版本计划则不重复加载
        const existing = this.versions.find(
          (v) => v.version === s.version || (v.weeks?.length === s.weeks?.length && v.created_at?.slice(0, 10) === data.created_at?.slice(0, 10))
        )
        if (!existing && s.weeks?.length) {
          this.addPlan({
            weeks: s.weeks,
            adjustments: s.adjustments || { keep: [], strengthen: [], drop: [] },
            based_on_diagnosis: s.based_on_diagnosis || null,
            raw_plan: s.raw_plan || ''
          })
        }

        await this.fetchProgress(data.id)
        return data
      } catch (e) {
        console.warn('[plan] DB 加载异常:', e.message)
        return null
      }
    },

    // W3-2: 切换任务完成状态
    async toggleTask(weekNum, taskIndex) {
      const current = this.progress[weekNum] || []
      if (current.includes(taskIndex)) {
        this.progress[weekNum] = current.filter((i) => i !== taskIndex)
      } else {
        this.progress[weekNum] = [...current, taskIndex]
      }

      if (!this.dbPlanId || !isSupabaseConfigured) return

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const completedTasks = this.progress[weekNum] || []

        // 查询是否已有进度记录
        const { data: existing } = await supabase
          .from('plan_progress')
          .select('id')
          .eq('plan_id', this.dbPlanId)
          .eq('week_num', weekNum)
          .eq('user_id', user.id)
          .maybeSingle()

        if (existing) {
          await supabase
            .from('plan_progress')
            .update({
              completed_tasks: completedTasks,
              checked_at: new Date().toISOString()
            })
            .eq('id', existing.id)
        } else {
          await supabase
            .from('plan_progress')
            .insert({
              user_id: user.id,
              plan_id: this.dbPlanId,
              week_num: weekNum,
              completed_tasks: completedTasks,
              checked_at: new Date().toISOString()
            })
        }
      } catch (e) {
        console.warn('[plan] 进度保存异常:', e.message)
      }
    },

    // W3-2: 从数据库加载进度
    async fetchProgress(planId) {
      if (!isSupabaseConfigured || !planId) return
      this.progressLoading = true
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
          .from('plan_progress')
          .select('week_num, completed_tasks')
          .eq('plan_id', planId)
          .eq('user_id', user.id)

        if (error || !data) return

        const map = {}
        for (const row of data) {
          map[row.week_num] = row.completed_tasks || []
        }
        this.progress = map
      } catch (e) {
        console.warn('[plan] 进度加载异常:', e.message)
      } finally {
        this.progressLoading = false
      }
    },

    // P0 修复：清理历史遗留的空计划版本（weeks 为空），
    // 避免旧版本 bug 产生的空壳数据导致 CURRENT PLAN 渲染空白
    pruneEmptyVersions() {
      const valid = this.versions.filter((v) => Array.isArray(v.weeks) && v.weeks.length > 0)
      if (valid.length !== this.versions.length) {
        this.versions = valid
        if (!valid.find((v) => v.version === this.currentVersion)) {
          this.currentVersion = valid.length ? valid[valid.length - 1].version : 0
        }
        this.persist()
      }
    },

    isTaskDone(weekNum, taskIndex) {
      return (this.progress[weekNum] || []).includes(taskIndex)
    }
  }
})
