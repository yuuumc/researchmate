// ============================================================
// 旗舰旅程 store（P0 #8 · 诊断 → 规划 → 科研 三步级联编排）
// ============================================================
// 职责：旗舰旅程的前端编排中枢——多 Agent 协作的状态机。
//
// 设计依据（设计文档 §3 + §6.3）：
//   - 每步独立 API 调用（规避 Vercel Hobby 60s 超时，不做后端长链）
//   - 每步结果写回 profileStore，作为下一步输入的共享上下文
//     （诊断 weak_points/root_causes → 规划 diagnosis_result）
//   - 用户可中断：每步可独立重试 / 跳过，不影响已完成步骤的结果
//
// 状态机：pending → running → done | error | skipped
// 数据流（答辩"Agent 间数据链路"实证）：
//   diagnose.structured ──→ profileStore（ability_stars/weak_topics/score）
//                        └─→ plan input.diagnosis_result
//   plan.structured      ──→ profileStore（preparation_stage）
//                        └─→ 解锁 research 入口
// ============================================================

import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'
import { useProfileStore } from '@/stores/profile'
import { useDiagnosisStore } from '@/stores/diagnosis'
import { usePlanStore } from '@/stores/plan'
import { buildDiagnosisInput, getDiagnosisResultForPlan } from '@/utils/diagnosisInput'

const STORAGE_KEY = 'flagship_journey'

// 步骤元信息（与 trace.js STEP_META 色系一致）
export const JOURNEY_STEPS = [
  {
    key: 'diagnose',
    title: '成长诊断',
    en: 'Diagnose',
    icon: 'D',
    color: '#4d9de0',
    desc: '8 字段结构化诊断 · 能力星图 · 4 层根因链'
  },
  {
    key: 'plan',
    title: '成长规划',
    en: 'Plan',
    icon: 'L',
    color: '#ffd166',
    desc: '基于诊断结果生成个性化周计划'
  },
  {
    key: 'research',
    title: '科研路线',
    en: 'Research',
    icon: 'X',
    color: '#e67e22',
    desc: '规划完成后解锁科研成长路线'
  }
]

function freshSteps() {
  return {
    diagnose: { status: 'pending', error: null, startedAt: null, completedAt: null, summary: null },
    plan: { status: 'pending', error: null, startedAt: null, completedAt: null, summary: null },
    research: { status: 'pending', error: null, startedAt: null, completedAt: null, summary: null }
  }
}

export const useJourneyStore = defineStore('journey', {
  state: () => {
    const saved = storage.get(STORAGE_KEY)
    return {
      steps: saved?.steps || freshSteps(),
      journeyStartedAt: saved?.journeyStartedAt || null
    }
  },

  getters: {
    /** 带元信息的步骤列表（UI 渲染用） */
    stepList: (state) =>
      JOURNEY_STEPS.map((meta) => ({ ...meta, ...(state.steps[meta.key] || {}) })),

    /** 当前待执行步骤 key（running 优先，其次第一个 pending/error；全部完成返回 null） */
    currentStepKey: (state) => {
      for (const meta of JOURNEY_STEPS) {
        const s = state.steps[meta.key]
        if (s?.status === 'running') return meta.key
      }
      for (const meta of JOURNEY_STEPS) {
        const s = state.steps[meta.key]
        if (s?.status === 'pending' || s?.status === 'error') return meta.key
      }
      return null
    },

    /** 进度百分比（done + skipped 计入） */
    progress: (state) => {
      const done = JOURNEY_STEPS.filter((m) =>
        ['done', 'skipped'].includes(state.steps[m.key]?.status)
      ).length
      return Math.round((done / JOURNEY_STEPS.length) * 100)
    },

    isComplete: (state) =>
      JOURNEY_STEPS.every((m) => ['done', 'skipped'].includes(state.steps[m.key]?.status)),

    isStarted: (state) => !!state.journeyStartedAt,

    /** 诊断步是否已完成且产出可用（供规划步判断输入来源） */
    diagnoseDone: (state) => state.steps.diagnose?.status === 'done'
  },

  actions: {
    persist() {
      storage.set(STORAGE_KEY, {
        steps: this.steps,
        journeyStartedAt: this.journeyStartedAt
      })
    },

    _markRunning(key) {
      if (!this.journeyStartedAt) this.journeyStartedAt = new Date().toISOString()
      this.steps[key] = {
        ...this.steps[key],
        status: 'running',
        error: null,
        startedAt: new Date().toISOString()
      }
      this.persist()
    },

    _markDone(key, summary) {
      this.steps[key] = {
        ...this.steps[key],
        status: 'done',
        completedAt: new Date().toISOString(),
        summary: summary || null
      }
      this.persist()
    },

    _markError(key, error) {
      this.steps[key] = { ...this.steps[key], status: 'error', error: error || '未知错误' }
      this.persist()
    },

    // === Step 1: 诊断 ===
    // 调 diagnosisStore.runDiagnosis()（#2 已接入真实 API），
    // 结果写回 profileStore：score / ability_stars / weak_topics
    async runDiagnose() {
      const profileStore = useProfileStore()
      const diagnosisStore = useDiagnosisStore()
      this._markRunning('diagnose')
      try {
        const res = await diagnosisStore.runDiagnosis(buildDiagnosisInput())
        const s = res.structured || {}

        // --- 共享上下文写回（多 Agent 协作核心） ---
        if (typeof s.score === 'number') {
          profileStore.setLastDiagnosis(s.score)
        }
        // ability_stars: { topic: 1-5 } → 逐知识点写回（setAbilityStar 自动联动 weak/mastered）
        if (s.ability_stars && typeof s.ability_stars === 'object') {
          Object.entries(s.ability_stars).forEach(([topic, star]) => {
            const n = parseInt(star, 10)
            if (n >= 1 && n <= 5) profileStore.setAbilityStar(topic, n)
          })
        }
        // weak_points 兼容 string / { knowledge_point } 两种格式
        const weakTopics = (Array.isArray(s.weak_points) ? s.weak_points : [])
          .map((w) => (typeof w === 'string' ? w : w?.knowledge_point))
          .filter(Boolean)
        weakTopics.forEach((t) => profileStore.addWeakTopic(t))

        this._markDone('diagnose', {
          score: s.score ?? null,
          weakCount: weakTopics.length,
          rootCauseCount: Array.isArray(s.root_causes) ? s.root_causes.length : 0,
          overall: s.overall_level || ''
        })
        return res
      } catch (e) {
        this._markError('diagnose', e.message || '诊断失败')
        throw e
      }
    },

    // === Step 2: 规划 ===
    // 诊断结果经 getDiagnosisResultForPlan()（#9 数据桥）作为
    // plan 的 diagnosis_result 输入——Agent 间数据链路的实证
    async runPlan() {
      const profileStore = useProfileStore()
      const planStore = usePlanStore()
      this._markRunning('plan')
      try {
        const profile = profileStore.profile || {}
        const diagnosisResult = getDiagnosisResultForPlan()
        const res = await planStore.runPlan({
          student_name: profile.name || '',
          target_major: profile.target_major || profile.major || '',
          diagnosis_result: diagnosisResult,
          exam_date: profile.exam_date || '',
          weekly_hours: 15
        })
        const s = res.structured || {}

        // --- 共享上下文写回 ---
        if (s.target_stage) {
          profileStore.setPreparationStage(s.target_stage)
        }

        this._markDone('plan', {
          weeks: Array.isArray(s.weeks) ? s.weeks.length : 0,
          targetStage: s.target_stage || '',
          basedOnDiagnosis: !!diagnosisResult
        })

        // 规划完成 → 科研路线入口自动解锁（P1 前仅解锁入口，不调 research API）
        if (this.steps.research?.status === 'pending') {
          this._markDone('research', { unlocked: true })
        }
        return res
      } catch (e) {
        this._markError('plan', e.message || '规划失败')
        throw e
      }
    },

    // === 统一入口 / 用户可中断 ===
    async runStep(key) {
      if (key === 'diagnose') return this.runDiagnose()
      if (key === 'plan') return this.runPlan()
      return null
    },

    /** 重跑某一步（重置该步状态后执行；不影响其他步骤结果） */
    async retryStep(key) {
      this.steps[key] = { status: 'pending', error: null, startedAt: null, completedAt: null, summary: null }
      this.persist()
      return this.runStep(key)
    },

    /** 跳过某一步（如学生想直接规划；规划步会在无诊断输入时由 Agent 自行分析） */
    skipStep(key) {
      if (!this.steps[key]) return
      this.steps[key] = {
        ...this.steps[key],
        status: 'skipped',
        completedAt: new Date().toISOString(),
        summary: { skipped: true }
      }
      this.persist()
    },

    /** 重置整个旅程（已产生的诊断历史 / 计划版本保留在各 store，不清除） */
    resetJourney() {
      this.steps = freshSteps()
      this.journeyStartedAt = null
      this.persist()
    }
  }
})
