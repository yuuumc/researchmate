// ============================================================
// 学生画像 store（v1 正式版 · 认知模型升级）
// ============================================================
// v1 正式版升级点（v1正式版.txt §问题1）：
//   从"数据存储"升级为"学生认知模型"
//   - ability_stars: 能力星级（知识点 → 1-5 星）
//   - learning_style: 学习风格（理论型/实践型/混合型）
//   - target_direction: 目标方向（AI芯片/集成电路/通信等）
//   - exam_date: 考研日期（用于计算倒计时）
//
// 数据契约（v1 §4.1 + v1 正式版）：
//   user_id: UUID
//   name: 姓名（可选）
//   major: 专业（可选）
//   target_direction: 目标方向（可选）
//   ability_stars: { [topic]: 1|2|3|4|5 }  能力星级
//   weak_topics / mastered_topics: 数组（互斥，mastered 优先级 > weak）
//   learning_style: 'theoretical' | 'practical' | 'mixed'
//   exam_date: ISO 日期字符串（如 '2026-12-21'）
//   last_diagnosis_score / last_diagnosis_date
//   target_school / target_major
//   preparation_stage: 'initial' | 'basic' | 'intensive' | 'sprint'
// ============================================================

import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'

const STORAGE_KEY = 'profile'

// 默认考研日期（次年 12 月倒数第二个周末，简化为 12-21）
function defaultExamDate() {
  const now = new Date()
  const year = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()
  return `${year}-12-21`
}

function createDefaultProfile() {
  return {
    user_id: (crypto.randomUUID && crypto.randomUUID()) || `uid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),

    // === 认知模型字段（v1 正式版新增） ===
    name: null,                    // 姓名
    major: null,                   // 专业（如"微电子"）
    target_direction: null,        // 目标方向（如"AI芯片"/"集成电路"/"通信"）
    ability_stars: {},             // { [知识点]: 1-5 星 }
    learning_style: 'mixed',       // theoretical / practical / mixed
    exam_date: defaultExamDate(),  // 考研日期

    // === 原有字段（向后兼容） ===
    weak_topics: [],               // 薄弱知识点
    mastered_topics: [],           // 已掌握知识点
    last_diagnosis_score: null,
    last_diagnosis_date: null,
    target_school: null,
    target_major: null,
    preparation_stage: 'initial'
  }
}

// 迁移旧 profile（补齐认知模型字段）
function migrateProfile(p) {
  if (!p || typeof p !== 'object') return createDefaultProfile()
  const def = createDefaultProfile()
  return {
    ...def,
    ...p,
    ability_stars: p.ability_stars || {},
    learning_style: p.learning_style || 'mixed',
    exam_date: p.exam_date || def.exam_date
  }
}

export const useProfileStore = defineStore('profile', {
  state: () => ({
    profile: migrateProfile(storage.get(STORAGE_KEY))
  }),

  getters: {
    isInitialized: (state) => !!state.profile.user_id,
    weakCount: (state) => state.profile.weak_topics.length,
    masteredCount: (state) => state.profile.mastered_topics.length,

    // 综合能力百分比（0-100），基于 ability_stars 平均值
    abilityLevel: (state) => {
      const stars = state.profile.ability_stars
      const topics = Object.keys(stars)
      if (topics.length === 0) return 0
      const sum = topics.reduce((s, k) => s + stars[k], 0)
      return Math.round((sum / (topics.length * 5)) * 100)
    },

    // 最大短板（ability_stars 中星级最低的知识点，或 weak_topics 第一个）
    biggestWeakness: (state) => {
      const stars = state.profile.ability_stars
      const topics = Object.keys(stars)
      if (topics.length > 0) {
        const sorted = topics.sort((a, b) => stars[a] - stars[b])
        return { topic: sorted[0], stars: stars[sorted[0]] }
      }
      if (state.profile.weak_topics.length > 0) {
        return { topic: state.profile.weak_topics[0], stars: 0 }
      }
      return null
    },

    // 距考研天数
    daysLeft: (state) => {
      if (!state.profile.exam_date) return null
      const exam = new Date(state.profile.exam_date)
      const now = new Date()
      const diff = exam.getTime() - now.getTime()
      return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
    },

    // 学习风格中文标签
    learningStyleLabel: (state) => {
      const map = { theoretical: '理论型', practical: '实践型', mixed: '混合型' }
      return map[state.profile.learning_style] || '混合型'
    }
  },

  actions: {
    persist() {
      storage.set(STORAGE_KEY, this.profile)
    },

    updateProfile(updates) {
      this.profile = {
        ...this.profile,
        ...updates,
        updated_at: new Date().toISOString()
      }
      this.persist()
    },

    // === 认知模型 actions（v1 正式版新增） ===

    setIdentity({ name, major, target_direction } = {}) {
      const updates = {}
      if (name !== undefined) updates.name = name
      if (major !== undefined) updates.major = major
      if (target_direction !== undefined) updates.target_direction = target_direction
      this.updateProfile(updates)
    },

    setAbilityStar(topic, stars) {
      if (!topic) return
      const s = Math.max(0, Math.min(5, parseInt(stars, 10) || 0))
      const next = { ...this.profile.ability_stars, [topic]: s }
      this.updateProfile({ ability_stars: next })

      // 联动 weak/mastered：≤2 星入 weak，=5 星入 mastered
      if (s > 0 && s <= 2 && !this.profile.weak_topics.includes(topic)) {
        this.profile.weak_topics.push(topic)
        this.persist()
      }
      if (s === 5 && !this.profile.mastered_topics.includes(topic)) {
        this.profile.mastered_topics.push(topic)
        this.profile.weak_topics = this.profile.weak_topics.filter((t) => t !== topic)
        this.persist()
      }
    },

    setLearningStyle(style) {
      const valid = ['theoretical', 'practical', 'mixed']
      if (!valid.includes(style)) {
        console.warn('[profile] invalid learning_style:', style)
        return
      }
      this.updateProfile({ learning_style: style })
    },

    setExamDate(date) {
      this.updateProfile({ exam_date: date })
    },

    // === 原有 actions（向后兼容） ===

    addWeakTopic(topic) {
      if (!topic) return
      if (this.profile.mastered_topics.includes(topic)) return
      if (!this.profile.weak_topics.includes(topic)) {
        this.profile.weak_topics.push(topic)
        this.updateProfile({})
      }
    },

    addMasteredTopic(topic) {
      if (!topic) return
      if (!this.profile.mastered_topics.includes(topic)) {
        this.profile.mastered_topics.push(topic)
        this.profile.weak_topics = this.profile.weak_topics.filter((t) => t !== topic)
        this.updateProfile({})
      }
    },

    removeWeakTopic(topic) {
      this.profile.weak_topics = this.profile.weak_topics.filter((t) => t !== topic)
      this.updateProfile({})
    },

    removeMasteredTopic(topic) {
      this.profile.mastered_topics = this.profile.mastered_topics.filter((t) => t !== topic)
      this.updateProfile({})
    },

    setLastDiagnosis(score) {
      this.profile.last_diagnosis_score = score
      this.profile.last_diagnosis_date = new Date().toISOString()
      this.updateProfile({})
    },

    setTarget(school, major) {
      this.updateProfile({ target_school: school, target_major: major })
    },

    setPreparationStage(stage) {
      const valid = ['initial', 'basic', 'intensive', 'sprint']
      if (!valid.includes(stage)) {
        console.warn('[profile] invalid stage:', stage)
        return
      }
      this.updateProfile({ preparation_stage: stage })
    },

    reset() {
      this.profile = createDefaultProfile()
      this.persist()
    }
  }
})
