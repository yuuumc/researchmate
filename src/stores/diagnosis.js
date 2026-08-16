// ============================================================
// 诊断历史 store（v1 列表，v2 升级为 5 轮对比，v3.1 接入 Agent API）
// ============================================================
// 数据契约：数组（严禁 Set/Map）
//   每条记录：{ id, timestamp, score, weak_points, root_causes, raw_report }
// v3.1 新增：runDiagnosis() → POST /api/agent { action: 'diagnose' }
// P0-3 新增：add() 时同步写入向量记忆（addMemory）
//   - 原因: Agent API 路径不走 profileUpdater，独立覆盖此路径防记忆缺口
// ============================================================


import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'
import { callAgent } from '@/api/agent'
import { supabase, isSupabaseConfigured } from '@/services/supabase'
// P0-3: 向量记忆写入
import { addMemory } from '@/utils/vectorMemory'

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
        ability_stars_snapshot: record.ability_stars_snapshot || {},
        // A1/Bug2: 持久化完整 structured（4 层根因链 direct/middle/root/remediation），
        // 离开诊断完成页后成长诊断页仍可直读同一数据源
        structured: record.structured || null
      }
      this.history.push(item)
      this.persist()

      // P0-3: 写入向量记忆
      //   原因: 本 add() 被两条诊断路径调用——
      //     ① router.js → profileUpdater.updateAfterDiagnose → diagnosisStore.add()
      //     ② diagnosis.js runDiagnosis (Agent API) → this.add()
      //   profileUpdater 中也写了 addMemory('diagnosis', ...)，但②不走 profileUpdater
      //   为了统一覆盖、在 add() 收口最安全（去重靠 text 相似度 + type 标签）
      //   写入失败不影响主流程（try/catch 兜底）
      try {
        const subject = item.subject || '未指定学科'
        const scorePart = typeof item.score === 'number' ? `考了${item.score}分` : '诊断'
        const weakPart = item.weak_points.length > 0
          ? `薄弱点:${item.weak_points.join('、')}`
          : '无明显薄弱'
        const memoryText = `${subject}${scorePart}，${weakPart}`
        addMemory('diagnosis', memoryText, {
          score: item.score,
          subject: item.subject,
          weak_points: item.weak_points,
          root_causes: item.root_causes
        })
      } catch (e) {
        console.warn('[diagnosis] addMemory failed:', e.message)
      }

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
              structured: s,  // A1/Bug2: DB 拉回的完整 structured
              _source: 'db'
            }
          })
          // Merge: DB records first, then localStorage-only records (not in DB)
          const dbIds = new Set(dbRecords.map(r => r.id))
          const localOnly = this.history.filter(h => !dbIds.has(h.id))
          this.history = [...dbRecords, ...localOnly]
          // OB-1: 按时间升序排列，确保 latest getter（末位）= 最新诊断记录（修复 RC-2 顺序倒置）
          this.history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
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
      // 502 重试：诊断链路偶发超时，最多重试 1 次
      let lastErr = null
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await callAgent('diagnose', input)
        this.lastReport = {
          content: res.content || '',
          structured: res.structured || null
        }

        // 同步存入 history（add() 内部已含 addMemory 写入，P0-3）
        const s = res.structured || {}
        this.add({
          score: s.score ?? null,
          subject: input.target_major || '',
          weak_points: s.weak_points || input.weak_points || [],
          root_causes: s.root_causes || s.direct_causes || [],
          raw_report: res.content || '',
          topics_snapshot: s.knowledge_points || [],
          ability_stars_snapshot: s.ability_stars || {},
          structured: s  // A1/Bug2: 持久化完整 structured 供根因链直读
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
          break // success
        } catch (e) {
          lastErr = e
          // 仅对 502/网络错误重试，其他错误直接抛出
          const is502 = e.message && (e.message.includes('502') || e.message.includes('upstream'))
          if (!is502 || attempt === 1) {
            this.error = e.message
            throw e
          }
          console.warn('[diagnosis] attempt ' + (attempt + 1) + ' failed with 502, retrying...')
        }
      }
      if (lastErr) {
        this.error = lastErr.message
        throw lastErr
      }
    }
  }
})
