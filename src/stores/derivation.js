// ============================================================
// 推导 store（B2 · AI 白板推导）
// ============================================================
// 状态管理 + Supabase 持久化（derivation_history 表）
// RLS: 用户只能读自己的推导历史
// ============================================================

import { defineStore } from 'pinia'
import { supabase, isSupabaseConfigured } from '@/services/supabase'
import { parseSteps, normalizeSteps, serializeSteps, deserializeSteps } from '@/utils/derivationNormalize'

const STORAGE_KEY = 'derivation_history_local'

export const useDerivationStore = defineStore('derivation', {
  state: () => ({
    // 当前推导
    currentKnowledgePoint: '',
    currentSteps: [],
    isStreaming: false,
    streamError: null,
    accumulatedText: '',

    // 历史
    history: JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'),
  }),

  getters: {
    stepCount: (state) => state.currentSteps.length,
    hasHistory: (state) => state.history.length > 0,
    recentHistory: (state) =>
      [...state.history].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
  },

  actions: {
    /**
     * 开始流式推导
     * @param {string} knowledgePoint
     * @param {object} callbacks - { onToken, onStep }
     * @param {AbortSignal} signal
     */
    async startDerivation(knowledgePoint, callbacks = {}, signal = null) {
      this.currentKnowledgePoint = knowledgePoint
      this.currentSteps = []
      this.isStreaming = true
      this.streamError = null
      this.accumulatedText = ''

      try {
        const { streamDerivation } = await import('@/api/derivation')

        const fullText = await streamDerivation(knowledgePoint, {
          onToken: ({ delta }) => {
            this.accumulatedText += delta
            // 实时更新步骤
            const steps = parseSteps(this.accumulatedText)
            this.currentSteps = normalizeSteps(steps)
            if (callbacks.onToken) callbacks.onToken({ delta })
          },
          onStep: (count, currentStep) => {
            if (callbacks.onStep) callbacks.onStep(count, currentStep)
          },
          signal,
        })

        // 最终解析
        this.accumulatedText = fullText
        this.currentSteps = normalizeSteps(parseSteps(fullText))
        this.isStreaming = false

        // 持久化
        await this.saveToHistory(knowledgePoint, this.currentSteps)

        return this.currentSteps
      } catch (e) {
        this.isStreaming = false
        this.streamError = e.message

        // 如果已有部分内容，仍然保存
        if (this.accumulatedText && this.currentSteps.length > 0) {
          await this.saveToHistory(knowledgePoint, this.currentSteps)
        }

        throw e
      }
    },

    /**
     * 取消推导
     */
    cancelDerivation() {
      this.isStreaming = false
      // AbortController 由调用方管理
    },

    /**
     * 从历史加载推导
     */
    loadFromHistory(item) {
      this.currentKnowledgePoint = item.knowledge_point
      this.currentSteps = deserializeSteps(item.steps)
      this.accumulatedText = this.currentSteps
        .map(s => `### 步骤 ${s.index}：${s.title}\n\n${s.content}`)
        .join('\n\n')
      this.isStreaming = false
      this.streamError = null
    },

    /**
     * 清空当前推导
     */
    clearCurrent() {
      this.currentKnowledgePoint = ''
      this.currentSteps = []
      this.accumulatedText = ''
      this.streamError = null
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
          // 表不存在等错误不阻塞
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
          // 合并到 history（DB 优先）
          const dbItems = data.map(d => ({
            id: d.id,
            knowledge_point: d.knowledge_point,
            steps: typeof d.steps === 'string' ? d.steps : JSON.stringify(d.steps),
            created_at: d.created_at,
          }))

          // 用 DB 数据覆盖 local 中同 knowledge_point +相近时间的记录
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
