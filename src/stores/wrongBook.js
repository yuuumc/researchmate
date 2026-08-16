// ============================================================
// 错题本 store（v1.5 新增）
// ============================================================
// 触发逻辑（src/core/profileUpdater.js updateAfterDiagnose）：
//   diagnose 完成 → 检查每个 weak_point / root_cause 在 profile.ability_stars 中的星级
//   - 未评分（undefined / null）→ 视为 0 颗星 → 入错题本
//   - 1-2 颗星 → 入错题本
//   - 3-5 颗星 → 不入
//
// 数据契约（数组，禁止 Set/Map）：
//   [{
//     id, topic, source: 'weak_point' | 'root_cause',
//     ability_stars: number,           // 触发时的星级
//     first_seen: ISO,
//     last_seen: ISO,
//     occurrences: number,             // 累计出现次数（重复错题累加）
//     resolved: boolean,
//     resolved_at: ISO | null
//   }]
// ============================================================

import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'
import { supabase, isSupabaseConfigured } from '@/services/supabase'

const STORAGE_KEY = 'wrong_book'

export const useWrongBookStore = defineStore('wrongBook', {
  state: () => ({
    items: storage.get(STORAGE_KEY) || [],
    // OB-1: DB wrong_book_entries 行数（按题计数，与 loadWrongQuestions 同源）
    dbWrongCount: 0
  }),

  getters: {
    count: (state) => state.items.length,
    unresolvedCount: (state) => state.items.filter((i) => !i.resolved).length,
    /** 按 last_seen 倒序 */
    recent: (state) =>
      [...state.items].sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen)),
    /** 活跃错题（未解决 + 按出现次数 + 最近出现） */
    active: (state) =>
      state.items
        .filter((i) => !i.resolved)
        .sort((a, b) => b.occurrences - a.occurrences || new Date(b.last_seen) - new Date(a.last_seen))
  },

  actions: {
    persist() {
      storage.set(STORAGE_KEY, this.items)
    },

    /**
     * 入错题本（仅当 ability_stars <= 2）
     * @param {string} topic - 知识点
     * @param {number} stars - 当前星级
     * @param {string} source - 'weak_point' | 'root_cause'
     * @returns {object|null} 新增或更新的项；不入错题本返回 null
     */
    addIfWeak(topic, stars, source = 'weak_point') {
      if (!topic) return null
      const safeStars = Number.isFinite(stars) ? stars : 0
      if (safeStars > 2) return null

      const existing = this.items.find((i) => i.topic === topic && !i.resolved)
      if (existing) {
        existing.last_seen = new Date().toISOString()
        existing.occurrences = (existing.occurrences || 1) + 1
        existing.ability_stars = safeStars
        existing.source = source
        this.persist()
        return existing
      }

      const item = {
        id: `wb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        topic,
        source,
        ability_stars: safeStars,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        occurrences: 1,
        resolved: false,
        resolved_at: null
      }
      this.items.push(item)
      this.persist()
      return item
    },

    /** 标记掌握（移出错题本；保留轨迹 7 天后清理） */
    resolve(id) {
      const item = this.items.find((i) => i.id === id)
      if (item) {
        item.resolved = true
        item.resolved_at = new Date().toISOString()
        this.persist()
      }
    },

    /** 删除单条 */
    remove(id) {
      this.items = this.items.filter((i) => i.id !== id)
      this.persist()
    },

    /** 清空已解决且超过 7 天的项 */
    gc() {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
      this.items = this.items.filter(
        (i) => !i.resolved || (i.resolved_at && new Date(i.resolved_at).getTime() > cutoff)
      )
      this.persist()
    },


    // W2 Step 3: 从 DB 加载错题
    async loadFromDB() {
      if (!isSupabaseConfigured) return
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data, error } = await supabase
          .from('wrong_book_entries')
          .select('id, question_id, wrong_count, last_wrong_at')
          .eq('user_id', user.id)
          .order('last_wrong_at', { ascending: false })
          .limit(20)
        if (error) {
          console.warn('[wrongBook] loadFromDB:', error.message)
          return
        }
        // OB-1: 记录 DB 错题行数（按题），供错题重练 badge 与 loadWrongQuestions 对齐
        this.dbWrongCount = (data || []).length
        if (data && data.length > 0) {
          // 拉取关联的 question 信息
          const qIds = data.map(w => w.question_id).filter(Boolean)
          if (qIds.length > 0) {
            const { data: qData } = await supabase
              .from('questions')
              .select('id, knowledge_point, subject')
              .in('id', qIds)
            const qMap = {}
            if (qData) {
              for (const q of qData) qMap[q.id] = q
            }
            // Merge DB records into localStorage items
            const dbTopics = new Set()
            for (const w of data) {
              const q = qMap[w.question_id]
              if (!q) continue
              dbTopics.add(q.knowledge_point)
              const existing = this.items.find(i => i.topic === q.knowledge_point && !i.resolved)
              if (existing) {
                existing.occurrences = Math.max(existing.occurrences || 1, w.wrong_count || 1)
                existing.last_seen = w.last_wrong_at
              } else {
                this.items.push({
                  id: w.id,
                  topic: q.knowledge_point,
                  source: 'weak_point',
                  ability_stars: 1,
                  first_seen: w.last_wrong_at,
                  last_seen: w.last_wrong_at,
                  occurrences: w.wrong_count || 1,
                  resolved: false,
                  resolved_at: null,
                  _question_id: w.question_id,
                })
              }
            }
            this.persist()
          }
        }
      } catch (e) {
        console.warn('[wrongBook] loadFromDB failed:', e)
      }
    },

    resolveByTopic(topic) {
      const item = this.items.find(i => i.topic === topic && !i.resolved)
      if (item) {
        item.resolved = true
        item.resolved_at = new Date().toISOString()
        this.persist()
      }
    },

    clear() {
      this.items = []
      this.persist()
    }
  }
})
