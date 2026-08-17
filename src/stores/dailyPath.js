// ============================================================
// 每日学习路径 store（B6 · 每日个性化学习路径）
// ============================================================
// 基于最新学情（ability_stars / weak_points / mastered_skills）
// 每日生成 ≤5 项个性化学习路径，路径项完成后主页学情即时更新。
// 数据源：useMasteryData composable（A1 统一学情层）
// 持久化：localStorage（按日期 key，次日自动重新生成）
// ============================================================

import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'
import { useProfileStore } from '@/stores/profile'
import { useDiagnosisStore } from '@/stores/diagnosis'
import { useWrongBookStore } from '@/stores/wrongBook'

const STORAGE_KEY = 'daily_path'

/**
 * 生成今日日期 key（YYYY-MM-DD）
 */
function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 根据学情数据生成每日学习路径
 * @param {object} mastery - useMasteryData() 返回值（需 .value 解包）
 * @param {object} profileStore
 * @param {object} wrongBookStore
 * @returns {Array} 路径项数组（≤5）
 */
function generatePathItems(masteryData, profileStore, wrongBookStore) {
  const items = []
  const abilityLevel = profileStore.abilityLevel || 0

  // 解包 mastery computed refs
  const weakPoints = masteryData.weakPoints.value || []
  const abilityStars = masteryData.abilityStars.value || []
  const masteredSkills = masteryData.masteredSkills.value || []
  const biggestWeakness = masteryData.biggestWeakness.value
  const weakStarCount = masteryData.weakStarCount.value
  const strongCount = masteryData.strongCount.value

  // === 差生路径（abilityLevel < 40 或有薄弱点） ===
  // 侧重薄弱点补救
  if (abilityLevel < 40 || weakPoints.length > 0 || weakStarCount > 0) {
    // 1. 最大短板优先
    if (biggestWeakness) {
      items.push({
        id: 'weak-top',
        title: `补强薄弱点：${biggestWeakness.topic}`,
        type: 'diagnose',
        icon: '!',
        priority: 'high',
        route: '/chat',
        query: { q: `帮我补强 ${biggestWeakness.topic}` },
        description: `当前星级 ${biggestWeakness.stars}/5，优先突破最大短板`,
      })
    }

    // 2. 其他薄弱知识点（从 ability_stars 取 ≤2 星的）
    const weakStars = abilityStars.filter((a) => a.type === 'weak').filter((a) => !biggestWeakness || a.topic !== biggestWeakness.topic)
    for (const w of weakStars.slice(0, 2)) {
      items.push({
        id: `weak-${w.topic}`,
        title: `巩固：${w.topic}`,
        type: 'practice',
        icon: 'P',
        priority: 'high',
        route: '/chat',
        query: { q: `给我出几道 ${w.topic} 的练习题` },
        description: `当前 ${w.star}/5 星，需要加强基础`,
      })
    }

    // 3. 错题本回顾
    const wrongCount = wrongBookStore.items?.length || 0
    if (wrongCount > 0) {
      items.push({
        id: 'wrongbook-review',
        title: `错题回顾（${wrongCount} 题）`,
        type: 'review',
        icon: 'W',
        priority: 'medium',
        route: '/',
        query: {},
        description: '复习错题，避免重复犯错',
      })
    }

    // 4. 基础诊断（如果尚未诊断）
    if (abilityLevel === 0) {
      items.push({
        id: 'diagnose-initial',
        title: '完成首次能力诊断',
        type: 'diagnose',
        icon: 'D',
        priority: 'high',
        route: '/chat',
        query: { q: '我半导体物理考了 55 分，帮我诊断' },
        description: '先了解你的能力画像',
      })
    }

    // 5. 白板推导练习（针对薄弱知识点）
    if (weakPoints.length > 0) {
      items.push({
        id: 'derivation-weak',
        title: `白板推导：${weakPoints[0]}`,
        type: 'derivation',
        icon: '∇',
        priority: 'medium',
        route: '/derivation',
        query: { kp: weakPoints[0] },
        description: '通过推导加深理解',
      })
    }
  }

  // === 中等生路径（40 ≤ abilityLevel < 80） ===
  // 侧重巩固 + 适度进阶
  else if (abilityLevel >= 40 && abilityLevel < 80) {
    // 1. 巩固发展中知识点（3 星）
    const developing = abilityStars.filter((a) => a.type === 'developing')
    for (const d of developing.slice(0, 2)) {
      items.push({
        id: `dev-${d.topic}`,
        title: `提升：${d.topic}`,
        type: 'practice',
        icon: '↑',
        priority: 'high',
        route: '/chat',
        query: { q: `给我出几道 ${d.topic} 的进阶练习题` },
        description: `当前 ${d.star}/5 星，向掌握冲刺`,
      })
    }

    // 2. 变式题练习
    if (developing.length > 0) {
      items.push({
        id: 'variant-practice',
        title: `变式题：${developing[0].topic}`,
        type: 'variant',
        icon: 'V',
        priority: 'medium',
        route: '/practice',
        query: {},
        description: '通过变式题检验掌握度',
      })
    }

    // 3. 错题回顾
    const wrongCount = wrongBookStore.items?.length || 0
    if (wrongCount > 0) {
      items.push({
        id: 'wrongbook-review',
        title: `错题回顾（${wrongCount} 题）`,
        type: 'review',
        icon: 'W',
        priority: 'medium',
        route: '/',
        query: {},
        description: '定期复习，巩固记忆',
      })
    }

    // 4. 白板推导
    const targetTopic = developing[0]?.topic || abilityStars[0]?.topic || 'MOSFET'
    items.push({
      id: 'derivation-daily',
      title: `白板推导：${targetTopic}`,
      type: 'derivation',
      icon: '∇',
      priority: 'medium',
      route: '/derivation',
      query: { kp: targetTopic },
      description: '每日推导，深化理解',
    })

    // 5. 拓展学习
    items.push({
      id: 'research-expand',
      title: '探索研究方向',
      type: 'research',
      icon: 'R',
      priority: 'low',
      route: '/chat',
      query: { q: '我以后想做 AI 芯片，给我科研路线图' },
      description: '了解前沿，激发学习动力',
    })
  }

  // === 学霸路径（abilityLevel >= 80） ===
  // 侧重进阶 + 拓展
  else {
    // 1. 进阶推导
    const strongTopic = masteredSkills[0] || 'MOSFET'
    items.push({
      id: 'derivation-advanced',
      title: `进阶推导：${strongTopic}`,
      type: 'derivation',
      icon: '∇',
      priority: 'high',
      route: '/derivation',
      query: { kp: strongTopic },
      description: '深入推导，追求满分理解',
    })

    // 2. 高难变式题
    items.push({
      id: 'variant-hard',
      title: '高难变式题挑战',
      type: 'variant',
      icon: 'V',
      priority: 'high',
      route: '/practice',
      query: {},
      description: '挑战难题，保持手感',
    })

    // 3. 科研路线探索
    items.push({
      id: 'research-route',
      title: '科研路线规划',
      type: 'research',
      icon: 'R',
      priority: 'high',
      route: '/chat',
      query: { q: '我以后想做 AI 芯片，给我科研路线图' },
      description: '规划未来方向',
    })

    // 4. 升学规划
    items.push({
      id: 'admission-plan',
      title: '升学择校分析',
      type: 'admission',
      icon: 'A',
      priority: 'medium',
      route: '/chat',
      query: { q: '双非前 30%，想去长三角读微电子' },
      description: '了解目标院校',
    })

    // 5. 知识体系查漏
    items.push({
      id: 'knowledge-audit',
      title: '知识体系查漏',
      type: 'diagnose',
      icon: 'D',
      priority: 'low',
      route: '/chat',
      query: { q: '帮我全面诊断知识体系，找出遗漏点' },
      description: '定期自检，确保无盲区',
    })
  }

  // 确保不超过 5 项
  return items.slice(0, 5)
}

export const useDailyPathStore = defineStore('dailyPath', {
  state: () => {
    const saved = storage.get(STORAGE_KEY)
    return {
      date: saved?.date || null,
      items: saved?.items || [],
      completedIds: saved?.completedIds || [],
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
    // 路径项列表（带完成状态）
    pathItems: (state) => {
      return state.items.map((item) => ({
        ...item,
        completed: state.completedIds.includes(item.id),
      }))
    },
  },

  actions: {
    persist() {
      storage.set(STORAGE_KEY, {
        date: this.date,
        items: this.items,
        completedIds: this.completedIds,
      })
    },

    /**
     * 生成今日学习路径
     * 需在组件中调用（依赖 Pinia stores）
     */
    async generateDailyPath() {
      this.loading = true
      try {
        // 延迟导入避免循环依赖
        const { useMasteryData } = await import('@/composables/useMasteryData')
        const profileStore = useProfileStore()
        const diagnosisStore = useDiagnosisStore()
        const wrongBookStore = useWrongBookStore()

        // 确保数据已加载
        try { await diagnosisStore.loadFromDB() } catch (e) { /* silent */ }
        try { await wrongBookStore.loadFromDB() } catch (e) { /* silent */ }

        const mastery = useMasteryData()

        const items = generatePathItems(mastery, profileStore, wrongBookStore)

        this.date = todayKey()
        this.items = items
        // 保留当天已完成的 ID（重新生成时不清除）
        this.completedIds = this.completedIds.filter((id) => items.some((i) => i.id === id))
        this.persist()
      } catch (e) {
        console.error('[dailyPath] generateDailyPath error:', e)
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
        const { useProfileStore } = await import('@/stores/profile')

        const diagnosisStore = useDiagnosisStore()
        const wrongBookStore = useWrongBookStore()
        const profileStore = useProfileStore()

        // 重新从 DB 加载，刷新主页学情
        await diagnosisStore.loadFromDB()
        await wrongBookStore.loadFromDB()
        // profileStore 通常不需要重新加载（ability_stars 由诊断/练习写入时更新）
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
     * 如果今日路径未生成，自动生成
     */
    async ensureGenerated() {
      if (!this.isGenerated) {
        await this.generateDailyPath()
      }
    },
  },
})
