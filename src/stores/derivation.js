// ============================================================
// 推导 store（B2 v1.0 · 结构化 JSON + 步进播放器）
// ============================================================
// 状态管理 + Supabase 持久化（derivation_history 表）
// RLS: 用户只能读自己的推导历史
// 步进播放器状态：currentIndex / nextStep / prevStep / gotoStep / replay
// ============================================================

import { defineStore } from 'pinia'
import { supabase, isSupabaseConfigured } from '@/services/supabase'
import {
  parseDerivationJSON,
  normalizeSteps,
  serializeSteps,
  deserializeSteps,
  stepToMarkdown,
} from '@/utils/derivationNormalize'

const STORAGE_KEY = 'derivation_history_local'

export const useDerivationStore = defineStore('derivation', {
  state: () => ({
    // 当前推导
    currentKnowledgePoint: '',
    currentSteps: [],
    isLoading: false,
    loadingError: null,

    // 步进播放器状态
    currentIndex: 0, // 0-indexed
    isPlaying: false,
    playTimer: null,

    // 历史
    history: JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'),
  }),

  getters: {
    stepCount: (state) => state.currentSteps.length,
    hasHistory: (state) => state.history.length > 0,
    recentHistory: (state) =>
      [...state.history].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),

    // 当前步骤对象
    currentStep: (state) => {
      if (state.currentSteps.length === 0) return null
      const idx = Math.min(state.currentIndex, state.currentSteps.length - 1)
      return state.currentSteps[idx]
    },

    // 当前步骤的 markdown（供 MarkdownRenderer 渲染）
    currentStepMarkdown() {
      const step = this.currentStep
      if (!step) return ''
      // 新格式：结构化 → markdown
      if (step.formulas?.length || step.figure || step.key_insight) {
        return stepToMarkdown(step)
      }
      // 旧格式：text 即 markdown content
      return step.text || step.content || ''
    },

    // 进度（0-1）
    progress: (state) => {
      if (state.currentSteps.length === 0) return 0
      return (state.currentIndex + 1) / state.currentSteps.length
    },

    // 是否可前进/后退
    canNext: (state) => state.currentIndex < state.currentSteps.length - 1,
    canPrev: (state) => state.currentIndex > 0,
  },

  actions: {
    /**
     * 开始推导（一次性 JSON fetch）
     * @param {string} knowledgePoint
     * @param {object} opts - { tier, context, signal }
     */
    async startDerivation(knowledgePoint, opts = {}) {
      this.currentKnowledgePoint = knowledgePoint
      this.currentSteps = []
      this.currentIndex = 0
      this.isLoading = true
      this.loadingError = null
      this.isPlaying = false
      this._clearPlayTimer()

      try {
        const { fetchDerivation } = await import('@/api/derivation')
        const data = await fetchDerivation(knowledgePoint, {
          tier: opts.tier,
          context: opts.context,
          signal: opts.signal,
        })

        if (!data.ok || !data.steps?.length) {
          throw new Error(data.error || 'no_steps_returned')
        }

        this.currentSteps = normalizeSteps(data.steps)
        this.currentIndex = 0
        this.isLoading = false

        // 持久化
        await this.saveToHistory(knowledgePoint, this.currentSteps)

        return this.currentSteps
      } catch (e) {
        this.isLoading = false
        this.loadingError = e.message?.replace('DERIVATION_ERROR: ', '') || e.message

        throw e
      }
    },

    /**
     * 取消推导
     */
    cancelDerivation() {
      this.isLoading = false
      this._clearPlayTimer()
      this.isPlaying = false
    },

    // ---- 步进播放器 ----

    nextStep() {
      if (this.canNext) {
        this.currentIndex++
      }
    },

    prevStep() {
      if (this.canPrev) {
        this.currentIndex--
      }
    },

    gotoStep(idx) {
      if (idx >= 0 && idx < this.currentSteps.length) {
        this.currentIndex = idx
      }
    },

    replay() {
      this.currentIndex = 0
      this.isPlaying = false
      this._clearPlayTimer()
    },

    /**
     * 自动播放（每步停留指定秒数）
     * @param {number} intervalMs - 每步停留毫秒数，默认 5000
     */
    play(intervalMs = 5000) {
      if (this.currentSteps.length === 0) return
      this.isPlaying = true
      this._clearPlayTimer()

      this.playTimer = setInterval(() => {
        if (this.canNext) {
          this.nextStep()
        } else {
          // 到最后一步，停止播放
          this.stop()
        }
      }, intervalMs)
    },

    stop() {
      this.isPlaying = false
      this._clearPlayTimer()
    },

    _clearPlayTimer() {
      if (this.playTimer) {
        clearInterval(this.playTimer)
        this.playTimer = null
      }
    },

    // ---- 历史管理 ----

    /**
     * 从历史加载推导
     */
    loadFromHistory(item) {
      this.currentKnowledgePoint = item.knowledge_point
      this.currentSteps = deserializeSteps(item.steps)
      this.currentIndex = 0
      this.isLoading = false
      this.loadingError = null
      this.isPlaying = false
      this._clearPlayTimer()
    },

    /**
     * 清空当前推导
     */
    clearCurrent() {
      this.currentKnowledgePoint = ''
      this.currentSteps = []
      this.currentIndex = 0
      this.loadingError = null
      this.isPlaying = false
      this._clearPlayTimer()
    },

    /**
     * 保存推导到历史（Supabase + localStorage 回退）
     */
    async saveToHistory(knowledgePoint, steps) {
      const item = {
        knowledge_point: knowledgePoint,
        steps: serializeSteps(steps),
        created_at: new Date().toISOString(),
      }

      // localStorage（始终执行）
      this.history.push(item)
      if (this.history.length > 50) {
        this.history = this.history.slice(-50)
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.history))

      // Supabase（best-effort）
      if (!isSupabaseConfigured) return
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { error } = await supabase
          .from('derivation_history')
          .insert({
            user_id: user.id,
            knowledge_point: knowledgePoint,
            steps: steps,
          })

        if (error) {
          console.warn('[derivation] saveToDB:', error.message)
        }
      } catch (e) {
        console.warn('[derivation] saveToDB failed:', e)
      }
    },

    /**
     * 从 Supabase 加载历史
     */
    async loadFromDB() {
      if (!isSupabaseConfigured) return
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
          .from('derivation_history')
          .select('id, knowledge_point, steps, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20)

        if (error) {
          console.warn('[derivation] loadFromDB:', error.message)
          return
        }

        if (data && data.length > 0) {
          const dbItems = data.map(d => ({
            id: d.id,
            knowledge_point: d.knowledge_point,
            steps: typeof d.steps === 'string' ? d.steps : JSON.stringify(d.steps),
            created_at: d.created_at,
          }))

          const merged = [...dbItems]
          for (const local of this.history) {
            const existsInDB = dbItems.some(
              d => d.knowledge_point === local.knowledge_point &&
                   Math.abs(new Date(d.created_at) - new Date(local.created_at)) < 60000
            )
            if (!existsInDB) merged.push(local)
          }

          this.history = merged.sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
          ).slice(0, 50)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.history))
        }
      } catch (e) {
        console.warn('[derivation] loadFromDB failed:', e)
      }
    },

    /**
     * 删除历史记录
     */
    async deleteHistory(id) {
      this.history = this.history.filter(h => h.id !== id && h.created_at !== id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.history))

      if (isSupabaseConfigured && id) {
        try {
          await supabase.from('derivation_history').delete().eq('id', id)
        } catch (_) {}
      }
    },
  },
})
