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
import { profileBus, EVT } from '@/core/profileBus'
import {
  applyLearningEvent,
  applySnapshot,
  decayAll,
  masteryToStars,
  starsToMastery,
  migrateMasteryScale,
} from '@/core/masteryEngine'
import { computeMasteryLevel } from '@/core/difficultyAdapt'

const STORAGE_KEY = 'profile'

let _busWired = false  // F1: profileBus 订阅幂等守卫

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
    knowledge_state: {},           // F1: { [知识点]: {mastery,confidence,lastStudied,attempts,correctRate,errorTypes} }
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
    knowledge_state: migrateMasteryScale(p.knowledge_state || {}), // F1: 0-100→0-1 一次性迁移
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
    },

    // 难度自适应：学生水平档（foundational/intermediate/advanced）
    // 判定逻辑见 @/core/difficultyAdapt.js computeMasteryLevel（单一事实源）
    studentMasteryLevel: (state) => computeMasteryLevel(state.profile)
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
      // P2-6: fire-and-forget Supabase push（登录用户非游客）
      this._pushToCloud(updates)
    },

    /**
     * P2-6: 异步推 profile 到 Supabase（不阻塞 UI）
     * 仅登录用户非游客；失败静默（localStorage 是离线 fallback）
     */
    async _pushToCloud(updates) {
      try {
        const { useAuthStore } = await import('@/stores/auth')
        const auth = useAuthStore()
        if (!auth.isAuthenticated || auth.isGuest) return
        const { saveProfile } = await import('@/services/profileService')
        await saveProfile(updates)
      } catch (e) {
        // P0: 不再静默吞错——打印完整错误体（code/hint/details），便于定位 upsert 失败根因
        const body = e && typeof e === 'object'
          ? { message: e.message, code: e.code, hint: e.hint, details: e.details }
          : String(e)
        console.warn('[profile] cloud push failed:', body)
      }
    },

    /**
     * P0 兼容层：把云端拉回的 profile 合并到本地（不回推云端，避免 pull->push 循环）
     * 供 auth.pullProfile 使用
     */
    applyRemoteProfile(remote) {
      if (!remote || typeof remote !== 'object') return
      const merged = { ...this.profile }
      for (const [k, v] of Object.entries(remote)) {
        if (v != null && !['id', 'user_id', 'created_at'].includes(k)) {
          merged[k] = v
        }
      }
      this.profile = { ...merged, updated_at: new Date().toISOString() }
      this.persist()
    },

    /**
     * P0 兼容兜底（方案 B）：profiles 认知列为空时，从 diagnoses.structured 水合
     * 星级 / 诊断分 / 薄弱点到本地 store（不回推云端，避免缺列 400）
     * 供 auth.pullProfile 在新列缺失或为空时调用
     */
    hydrateCognitive({ ability_stars, last_diagnosis_score, last_diagnosis_date, weak_topics } = {}) {
      const updates = {}
      if (ability_stars && typeof ability_stars === 'object' && Object.keys(ability_stars).length > 0) {
        updates.ability_stars = { ...this.profile.ability_stars, ...ability_stars }
      }
      if (typeof last_diagnosis_score === 'number' && this.profile.last_diagnosis_score == null) {
        updates.last_diagnosis_score = last_diagnosis_score
      }
      if (last_diagnosis_date && this.profile.last_diagnosis_date == null) {
        updates.last_diagnosis_date = last_diagnosis_date
      }
      if (Array.isArray(weak_topics) && weak_topics.length > 0) {
        const merged = [...new Set([...this.profile.weak_topics, ...weak_topics])]
        updates.weak_topics = merged
      }
      if (Object.keys(updates).length === 0) return
      this.profile = { ...this.profile, ...updates, updated_at: new Date().toISOString() }
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
      // F1: 同步 knowledge_state mastery（诊断/练习的绝对星级写入也经规则引擎快照）
      const ksNext = {
        ...this.profile.knowledge_state,
        [topic]: applySnapshot(this.profile.knowledge_state[topic], {
          mastery: starsToMastery(s),
          timestamp: new Date().toISOString(),
        }),
      }
      this.updateProfile({ ability_stars: next, knowledge_state: ksNext })

      // 联动 weak/mastered：≤2 星入 weak���=5 星入 mastered
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

    // === F1 画像引擎地基：事件总线 + 规则引擎 ===

    /**
     * 处理增量学习事件（由 profileBus 'learning-event' 触发）
     * 更新 knowledge_state[topic]，同步 ability_stars，持久化并广播 profile-updated。
     * 所有写画像操作的统一入口——F2/F3/F4 答题/推导/复述一律经此。
     */
    recordLearningEvent(event) {
      const topic = event.topic
      if (!topic) return
      const prevKS = this.profile.knowledge_state?.[topic] || null
      const newKS = applyLearningEvent(prevKS, event)
      const ksNext = { ...this.profile.knowledge_state, [topic]: newKS }
      const starsNext = { ...this.profile.ability_stars, [topic]: masteryToStars(newKS.mastery) }
      this.updateProfile({ knowledge_state: ksNext, ability_stars: starsNext })
      profileBus.emit(EVT.PROFILE_UPDATED, { source: 'learning-event', topics: [topic] })
      return newKS
    },

    /**
     * 处理掌握度快照（由 profileBus 'mastery-snapshot' 触发，诊断完成批量设定）
     * @param {object} payload { items: [{ topic, mastery, source }], timestamp }
     */
    applyMasterySnapshot(payload) {
      const items = payload?.items || []
      if (items.length === 0) return
      const now = payload.timestamp || new Date().toISOString()
      const ksNext = { ...this.profile.knowledge_state }
      const starsNext = { ...this.profile.ability_stars }
      const topics = []
      for (const it of items) {
        if (!it.topic) continue
        ksNext[it.topic] = applySnapshot(ksNext[it.topic], { mastery: it.mastery, timestamp: now })
        starsNext[it.topic] = masteryToStars(ksNext[it.topic].mastery)
        topics.push(it.topic)
      }
      this.updateProfile({ knowledge_state: ksNext, ability_stars: starsNext })

      // P1-3: 联动 weak_topics / mastered_topics（与 setAbilityStar 阈值对齐：
      //        ≤2 星入 weak，==5 星入 mastered 并移出 weak）
      const weakSet = new Set(this.profile.weak_topics)
      const masteredSet = new Set(this.profile.mastered_topics)
      let changed = false
      for (const it of items) {
        if (!it.topic) continue
        const s = starsNext[it.topic]
        if (s > 0 && s <= 2) {
          if (!weakSet.has(it.topic)) { weakSet.add(it.topic); changed = true }
        } else if (s === 5) {
          if (!masteredSet.has(it.topic)) { masteredSet.add(it.topic); changed = true }
          if (weakSet.has(it.topic)) { weakSet.delete(it.topic); changed = true }
        }
      }
      if (changed) {
        this.profile.weak_topics = Array.from(weakSet)
        this.profile.mastered_topics = Array.from(masteredSet)
        this.persist()
      }

      profileBus.emit(EVT.PROFILE_UPDATED, { source: 'mastery-snapshot', topics })
    },

    /**
     * 遗忘衰减：画像页打开时调用，按 lastStudied 衰减全部 knowledge_state
     */
    decayStaleMastery() {
      const now = new Date().toISOString()
      const { map, changed } = decayAll(this.profile.knowledge_state, now)
      if (!changed) return false
      this.updateProfile({ knowledge_state: map })
      profileBus.emit(EVT.PROFILE_UPDATED, { source: 'decay', topics: Object.keys(map) })
      return true
    },

    /**
     * 注册 profileBus 事件监听（幂等，app 启动时调用一次）
     */
    initProfileBus() {
      if (_busWired) return
      _busWired = true
      profileBus.on(EVT.LEARNING_EVENT, (ev) => this.recordLearningEvent(ev))
      profileBus.on(EVT.MASTERY_SNAPSHOT, (snap) => this.applyMasterySnapshot(snap))
    },

    // === v2.0 新增（多用户 SaaS · 数据层）===

    /**
     * 登录后把 profile.user_id 对齐到 auth.users.id
     * 首次登录用 auth.id 覆���本地临时 uuid
     * @param {string} authUserId - Supabase auth.users.id (UUID)
     * @param {object} [meta] - 可选 metadata: { phone, name, role, avatar_url }
     */
    bindAuthUser(authUserId, meta = {}) {
      if (!authUserId) {
        console.warn('[profile] bindAuthUser called without authUserId')
        return
      }
      const updates = { user_id: authUserId }
      if (meta.phone) updates.phone = meta.phone
      if (meta.name) updates.name = meta.name
      if (meta.role) updates.role = meta.role
      if (meta.avatar_url) updates.avatar_url = meta.avatar_url
      this.updateProfile(updates)
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
