// ============================================================
// 每日学习路径 store（B6 · 策略权重 v1.0）
// ============================================================
// 基于产品管理专家《每日学习路径推荐策略权重 v1.0》实现：
//   - §1 知识点分桶（顺序判定，命中即停）
//   - §2 桶内排序（确定性公式 + 字典序 tiebreak）
//   - §3 三档配比 + T 例外 + 降级填充（不空槽）
//   - §4 任务类型映射（复习固定 foundational 档）
//   - §5 次日刷新（顺延 c<2 / 降级 c≥2 / 丢弃+冷却）
//   - §6 边界用例（新用户/全 mastered/字段缺失）
//
// 数据源：profile store（mastery 0-1、weak_topics、studentMasteryLevel getter）
// 持久化：localStorage（按日期 key，次日自动重新生成）
// 引擎：@/core/learningPathEngine.js（纯函数，零随机）
// ============================================================

import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'
import { useProfileStore } from '@/stores/profile'
import {
  generateDailyPath as engineGenerate,
  todayKey,
} from '@/core/learningPathEngine'

const STORAGE_KEY = 'daily_path'
const COOLDOWN_KEY = 'daily_path_cooldowns'

export const useDailyPathStore = defineStore('dailyPath', {
  state: () => {
    const saved = storage.get(STORAGE_KEY)
    const cooldowns = storage.get(COOLDOWN_KEY) || []
    return {
      // 当前日期 key
      date: saved?.date || null,
      // 当前路径项
      items: saved?.items || [],
      // 已完成项 ID
      completedIds: saved?.completedIds || [],
      // 昨日路径（用于 §5 次日刷新）
      yesterdayPath: saved?.yesterdayPath || null,
      // 冷却记录（§5 丢弃后 7 天冷却）
      cooldownHistory: cooldowns,
      loading: false,
    }
  },

  getters: {
    // 今日路径是否已生成
    isGenerated: (state) => state.date === todayKey() && state.items.length > 0,

    // 完成数
    completedCount: (state) => state.completedIds.length,

    // 总数
    totalCount: (state) => state.items.length,

    // 完成率
    completionRate: (state) => {
      if (state.items.length === 0) return 0
      return Math.round((state.completedIds.length / state.items.length) * 100)
    },

    // 路径项列表（带完成状态 + 顺延标记）
    pathItems: (state) => {
      return state.items.map((item) => ({
        ...item,
        completed: state.completedIds.includes(item.id),
        isCarriedOver: (item.carryCount || 0) > 0,
      }))
    },

    // 顺延项数量
    carriedOverCount: (state) => state.items.filter(i => (i.carryCount || 0) > 0).length,
  },

  actions: {
    persist() {
      storage.set(STORAGE_KEY, {
        date: this.date,
        items: this.items,
        completedIds: this.completedIds,
        yesterdayPath: this.yesterdayPath,
      })
      storage.set(COOLDOWN_KEY, this.cooldownHistory)
    },

    /**
     * 生成今日学习路径（策略 v1.0 引擎）
     * 需在组件中调用（依赖 Pinia stores）
     */
    async generateDailyPath() {
      this.loading = true
      try {
        const profileStore = useProfileStore()
        const profile = profileStore.profile
        const tier = profileStore.studentMasteryLevel

        // 调用纯函数引擎
        const result = engineGenerate(
          profile,
          tier,
          this.yesterdayPath,
          this.cooldownHistory,
          todayKey(),
        )

        // 更新冷却记录
        if (result.newCooldowns && result.newCooldowns.length > 0) {
          this.cooldownHistory = [...this.cooldownHistory, ...result.newCooldowns]
        }

        // 清理过期冷却（超过 7 天的）
        const today = new Date(todayKey())
        this.cooldownHistory = this.cooldownHistory.filter(c => {
          if (!c.until) return false
          return new Date(c.until) > today
        })

        this.date = todayKey()
        this.items = result.tasks
        // 保留当天已完成的 ID（重新生成时不清除）
        this.completedIds = this.completedIds.filter((id) =>
          result.tasks.some((i) => i.id === id),
        )
        this.persist()
      } catch (e) {
        console.error('[dailyPath] generateDailyPath error:', e)
        // §6 边界：空数据态降级占位不报错
        this.date = todayKey()
        this.items = []
        this.persist()
      } finally {
        this.loading = false
      }
    },

    /**
     * 标记路径项完成
     * 完成后触发主页学情数据刷新
     */
    async completeItem(itemId) {
      if (!this.completedIds.includes(itemId)) {
        this.completedIds.push(itemId)
        this.persist()
      }

      // 完成路径项后刷新学情数据
      try {
        const { useDiagnosisStore } = await import('@/stores/diagnosis')
        const { useWrongBookStore } = await import('@/stores/wrongBook')

        const diagnosisStore = useDiagnosisStore()
        const wrongBookStore = useWrongBookStore()

        await diagnosisStore.loadFromDB()
        await wrongBookStore.loadFromDB()
      } catch (e) {
        console.warn('[dailyPath] refresh after complete error:', e)
      }
    },

    /**
     * 取消完成标记
     */
    uncompleteItem(itemId) {
      this.completedIds = this.completedIds.filter((id) => id !== itemId)
      this.persist()
    },

    /**
     * 次日刷新：将当前路径存为昨日路径，清空当前路径
     * 在 ensureGenerated 中自动检测日期变化时调用
     */
    rolloverToNextDay() {
      // 当前路径成为昨日路径
      this.yesterdayPath = {
        date: this.date,
        items: this.items,
        completedIds: this.completedIds,
      }
      // 清空当前路径（触发重新生成）
      this.date = null
      this.items = []
      this.completedIds = []
      this.persist()
    },

    /**
     * 如果今日路径未生成，自动生成
     * 检测日期变化：如果 date !== today，执行 rollover + 重新生成
     */
    async ensureGenerated() {
      const today = todayKey()

      // 日期变了 → 次日刷新
      if (this.date && this.date !== today) {
        this.rolloverToNextDay()
      }

      if (!this.isGenerated) {
        await this.generateDailyPath()
      }
    },

    /**
     * 手动重新生成（用户点击刷新按钮）
     */
    async regenerate() {
      // 不触发 rollover，直接重新生成
      await this.generateDailyPath()
    },
  },
})
