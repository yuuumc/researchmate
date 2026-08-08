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
import { supabase, isSupabaseConfigured } from '@/services/supabase'

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


    // v2.1-W2: 从 diagnoses 表加载历史（混合模式写入的记录）
    async loadFromDB() {
      if (!isSupabaseConfigured) return
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data, error } = await supabase
          .from('diagnoses')
          .select('id, structured, score, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10)
        if (error) {
          console.warn('[diagnosis] loadFromDB error:', error.message)
          return
        }
        if (data && data.length > 0) {
          const dbRecords = data.map(row => {
            const s = row.structured || {}
            return {
              id: row.id,
              timestamp: row.created_at,
              score: row.score ?? s.score ?? null,
              subject: s.subject || '',
              weak_points: Array.isArray(s.weak_points) ? s.weak_points : [],
              root_causes: s.root_causes || s.direct_causes || [],
              raw_report: '',
              topics_snapshot: [],
              ability_stars_snapshot: s.ability_stars || {},
              _source: 'db'
            }
          })
          // Merge: DB records first, then localStorage-only records (not in DB)
          const dbIds = new Set(dbRecords.map(r => r.id))
          const localOnly = this.history.filter(h => !dbIds.has(h.id))
          this.history = [...dbRecords, ...localOnly]
          this.persist()
        }
      } catch (e) {
        console.warn('[diagnosis] loadFromDB failed:', e)
      }
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

        // P0-1: 回写 profileStore（对齐 journey.js，三条诊断路径一致）
        try {
          const { useProfileStore } = await import('@/stores/profile')
          const profileStore = useProfileStore()
          if (typeof s.score === 'number') {
            profileStore.setLastDiagnosis(s.score)
          }
          if (s.ability_stars && typeof s.ability_stars === 'object') {
            Object.entries(s.ability_stars).forEach(([topic, star]) => {
              const n = parseInt(star, 10)
              if (n >= 1 && n <= 5) profileStore.setAbilityStar(topic, n)
            })
          }
          const weakTopics = (Array.isArray(s.weak_points) ? s.weak_points : [])
            .map((w) => (typeof w === 'string' ? w : w?.knowledge_point))
            .filter(Boolean)
          weakTopics.forEach((t) => profileStore.addWeakTopic(t))
        } catch (e) {
          console.warn('[diagnosis] profile writeback failed:', e)
        }

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
