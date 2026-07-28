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

const STORAGE_KEY = 'wrong_book'

export const useWrongBookStore = defineStore('wrongBook', {
  state: () => ({
    items: storage.get(STORAGE_KEY) || []
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

    clear() {
      this.items = []
      this.persist()
    }
  }
})
