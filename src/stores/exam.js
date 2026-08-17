// ============================================================
// exam store — F3 模考编排（Pinia）
// ============================================================
// 阶段流转：idle → composing → answering → grading → done
// 闭环：
//   1. composePaper() — 从画像取薄弱知识点 → DB 抽客观题 → /api/diagnosis op=subjective 生成主观题
//   2. submitExam() — 客观题走 grading.js / 主观题走 /api/exam-grade 并行评分
//   3. _writebackToProfile() — 经 profileBus LEARNING_EVENT 回写画像
//   4. _saveToHistory() — localStorage 考试历史 + 同步 last_diagnosis_score
// ============================================================

import { defineStore } from 'pinia'
import { supabase, isSupabaseConfigured } from '@/services/supabase'
import { useProfileStore } from '@/stores/profile'
import { usePracticeStore } from '@/stores/practice'
import { profileBus, EVT } from '@/core/profileBus'
import { gradeObjective } from '@/utils/grading'

const EXAM_HISTORY_KEY = 'exam_history'
const MAX_HISTORY = 20

export const useExamStore = defineStore('exam', {
  state: () => ({
    phase: 'idle',        // idle | composing | answering | grading | done
    paper: null,          // { objective: [], subjective: [], created_at }
    answers: {},          // { [questionId]: answer }
    timer: { duration: 0, remaining: 0, intervalId: null },
    results: null,        // { objective: [], subjective: [], total_score, max_score }
    error: null,
    gradingProgress: { done: 0, total: 0 },
  }),

  getters: {
    hasPaper: (state) => !!state.paper && (state.paper.objective.length > 0 || state.paper.subjective.length > 0),
    questionCount: (state) => {
      if (!state.paper) return 0
      return state.paper.objective.length + state.paper.subjective.length
    },
    answeredCount: (state) => {
      if (!state.paper) return 0
      const all = [...state.paper.objective, ...state.paper.subjective]
      return all.filter(q => {
        const a = state.answers[q.id]
        return a != null && String(a).trim() !== ''
      }).length
    },
    isGrading: (state) => state.phase === 'grading',
  },

  actions: {
    /**
     * GWT#1: 组卷 — 基于画像薄弱知识点
     */
    async composePaper() {
      this.phase = 'composing'
      this.error = null
      this.paper = null
      this.answers = {}
      this.results = null

      try {
        const profileStore = useProfileStore()
        const weakTopics = profileStore.profile.weak_topics || []
        const weakPoints = weakTopics.length > 0 ? weakTopics : Object.keys(profileStore.profile.ability_stars || {}).filter(k => (profileStore.profile.ability_stars[k] || 0) <= 2)

        if (weakPoints.length === 0) {
          throw new Error('画像中暂无薄弱知识点，请先完成诊断或练习')
        }

        // 1. 客观题：复用 practice store 从 DB 抽题
        const practiceStore = usePracticeStore()
        const objectiveQuestions = await practiceStore.sampleByWeakPoints(weakPoints, 6)

        // 2. 主观题：调 /api/diagnosis op=subjective
        const subjectiveQuestions = await this._generateSubjective(weakPoints, profileStore.profile.target_direction)

        this.paper = {
          objective: objectiveQuestions.map(q => ({
            ...q,
            type: 'objective',
          })),
          subjective: subjectiveQuestions.map((q, i) => ({
            id: q.id || `sub-${i + 1}`,
            knowledge_point: q.knowledge_point || weakPoints[i % weakPoints.length],
            stem: q.question || q.stem || '',
            question_type: 'essay',
            type: 'subjective',
            difficulty: q.difficulty || 3,
            max_score: 10,
          })),
          created_at: new Date().toISOString(),
          weak_points: weakPoints,
        }

        // 初始化答案
        for (const q of [...this.paper.objective, ...this.paper.subjective]) {
          this.answers[q.id] = ''
        }

        // 设置计时器（客观题 1 分钟/题 + 主观题 5 分钟/题，最少 10 分钟）
        const duration = Math.max(600, this.paper.objective.length * 60 + this.paper.subjective.length * 300)
        this.timer.duration = duration
        this.timer.remaining = duration

        this.phase = 'answering'
        this._startTimer()

        return this.paper
      } catch (e) {
        this.error = e.message
        this.phase = 'idle'
        throw e
      }
    },

    /**
     * 调用 /api/diagnosis op=subjective 生成主观题
     */
    async _generateSubjective(weakPoints, targetDirection) {
      try {
        const response = await fetch('/api/diagnosis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            op: 'subjective',
            payload: {
              target_major: targetDirection || '集成电路',
              weak_points: weakPoints.slice(0, 5),
            },
          }),
        })

        if (!response.ok) {
          console.warn('[exam] subjective gen failed:', response.status)
          return []
        }

        const data = await response.json()
        return data.questions || []
      } catch (e) {
        console.warn('[exam] subjective gen error:', e)
        return []
      }
    },

    /**
     * GWT#2: 提交试卷 → 客观题判分 + 主观题并行 LLM 评分
     */
    async submitExam() {
      this.phase = 'grading'
      this._stopTimer()
      this.error = null
      this.gradingProgress = { done: 0, total: 0 }

      try {
        const objectiveResults = []
        const subjectiveResults = []

        // 1. 客观题：走 grading.js（与 practice/diagnosis 一致）
        for (const q of this.paper.objective) {
          const userAnswer = this.answers[q.id] || ''
          const isCorrect = gradeObjective(q, userAnswer)
          objectiveResults.push({
            question_id: q.id,
            knowledge_point: q.knowledge_point,
            question_type: q.question_type,
            difficulty: q.difficulty,
            is_correct: isCorrect,
            score: isCorrect ? (q.difficulty || 1) : 0,
            user_answer: userAnswer,
            correct_answer: q.correct_answer || '',
            stem: q.stem,
          })
        }

        // 2. 主观题：逐题独立并行评分（Promise.allSettled，禁止单请求串行）
        const subjectiveQuestions = this.paper.subjective
        this.gradingProgress.total = subjectiveQuestions.length

        if (subjectiveQuestions.length > 0) {
          const gradePromises = subjectiveQuestions.map(q => this._gradeOneSubjective(q))
          const settled = await Promise.allSettled(gradePromises)

          for (let i = 0; i < subjectiveQuestions.length; i++) {
            const q = subjectiveQuestions[i]
            const result = settled[i]
            this.gradingProgress.done = i + 1

            if (result.status === 'fulfilled' && result.value) {
              subjectiveResults.push({
                question_id: q.id,
                knowledge_point: q.knowledge_point,
                question_type: 'essay',
                stem: q.stem,
                user_answer: this.answers[q.id] || '',
                grade_result: result.value,
                score: result.value.total_score || 0,
                max_score: q.max_score || 10,
                pending_review: result.value.pending_review || false,
              })
            } else {
              // GWT#4: 失败标记"待复评"，不阻塞
              subjectiveResults.push({
                question_id: q.id,
                knowledge_point: q.knowledge_point,
                question_type: 'essay',
                stem: q.stem,
                user_answer: this.answers[q.id] || '',
                grade_result: { pending_review: true, overall_comment: '评分失败，待复评' },
                score: 0,
                max_score: q.max_score || 10,
                pending_review: true,
              })
            }
          }
        }

        // 3. 汇总
        const objScore = objectiveResults.reduce((s, r) => s + r.score, 0)
        const subjScore = subjectiveResults.reduce((s, r) => s + r.score, 0)
        const objMax = objectiveResults.reduce((s, r) => s + (r.difficulty || 1), 0)
        const subjMax = subjectiveResults.reduce((s, r) => s + r.max_score, 0)

        this.results = {
          objective: objectiveResults,
          subjective: subjectiveResults,
          total_score: objScore + subjScore,
          max_score: objMax + subjMax,
          obj_score: objScore,
          obj_max: objMax,
          subj_score: subjScore,
          subj_max: subjMax,
          submitted_at: new Date().toISOString(),
        }

        // 4. 回写画像
        this._writebackToProfile()

        // 5. 保存历史
        await this._saveToHistory()

        this.phase = 'done'
        return this.results
      } catch (e) {
        this.error = e.message
        this.phase = 'answering'
        throw e
      }
    },

    /**
     * 单题主观题评分（含 1 次重试 + 2s 延迟）
     */
    async _gradeOneSubjective(q) {
      const studentAnswer = this.answers[q.id] || ''

      // 空白作答直接返回 0 分
      if (!studentAnswer.trim()) {
        return {
          dimensions: {
            correctness: { score: 0, comment: '未作答' },
            completeness: { score: 0, comment: '未作答' },
            logic: { score: 0, comment: '未作答' },
          },
          total_score: 0,
          max_total_score: 15,
          overall_comment: '学生未作答，0 分',
        }
      }

      const doGrade = async () => {
        const response = await fetch('/api/exam-grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: q.stem,
            student_answer: studentAnswer,
            knowledge_point: q.knowledge_point,
            max_score: q.max_score || 10,
          }),
        })

        if (!response.ok) {
          throw new Error('exam-grade HTTP ' + response.status)
        }

        const data = await response.json()
        return data.result
      }

      try {
        return await doGrade()
      } catch (firstErr) {
        // 重试 1 次，延迟 2s
        console.warn('[exam] grade retry for', q.id, ':', firstErr.message)
        await new Promise(r => setTimeout(r, 2000))
        try {
          return await doGrade()
        } catch (secondErr) {
          // GWT#4: 返回 pending_review
          console.error('[exam] grade failed for', q.id, ':', secondErr.message)
          return {
            dimensions: {
              correctness: { score: 0, comment: '待复评' },
              completeness: { score: 0, comment: '待复评' },
              logic: { score: 0, comment: '待复评' },
            },
            total_score: 0,
            max_total_score: 15,
            overall_comment: '评分失败，待复评：' + secondErr.message,
            pending_review: true,
          }
        }
      }
    },

    /**
     * GWT#3: 回写画像 — 经 profileBus LEARNING_EVENT
     */
    _writebackToProfile() {
      if (!this.results) return

      const profileStore = useProfileStore()

      // 客观题
      for (const r of this.results.objective) {
        if (!r.knowledge_point) continue
        profileBus.emit(EVT.LEARNING_EVENT, {
          topic: r.knowledge_point,
          outcome: r.is_correct ? 'correct' : 'incorrect',
          questionType: r.question_type || 'choice',
          errorType: r.is_correct ? null : 'exam_objective',
          timestamp: new Date().toISOString(),
        })

        // 更新 ability_stars
        const current = profileStore.profile.ability_stars?.[r.knowledge_point] ?? 0
        if (r.is_correct) {
          if (current < 5) profileStore.setAbilityStar(r.knowledge_point, current + 1)
        } else {
          if (current > 2) profileStore.setAbilityStar(r.knowledge_point, 2)
        }
      }

      // 主观题
      for (const r of this.results.subjective) {
        if (!r.knowledge_point) continue
        const score = r.score || 0
        const maxScore = r.max_score || 10
        const ratio = maxScore > 0 ? score / maxScore : 0

        profileBus.emit(EVT.LEARNING_EVENT, {
          topic: r.knowledge_point,
          outcome: ratio >= 0.6 ? 'correct' : 'incorrect',
          questionType: 'essay',
          errorType: ratio >= 0.6 ? null : 'exam_subjective',
          timestamp: new Date().toISOString(),
        })

        // 更新 ability_stars（主观题按得分率映射星级）
        const stars = ratio >= 0.8 ? 4 : ratio >= 0.6 ? 3 : ratio >= 0.3 ? 2 : 1
        const current = profileStore.profile.ability_stars?.[r.knowledge_point] ?? 0
        if (stars > current) {
          profileStore.setAbilityStar(r.knowledge_point, stars)
        }
      }

      // 广播画像更新
      profileBus.emit(EVT.PROFILE_UPDATED, {
        source: 'exam',
        topics: [
          ...new Set([
            ...this.results.objective.map(r => r.knowledge_point),
            ...this.results.subjective.map(r => r.knowledge_point),
          ].filter(Boolean)),
        ],
      })
    },

    /**
     * 保存考试历史到 localStorage + 同步 last_diagnosis_score
     */
    async _saveToHistory() {
      if (!this.results) return

      const profileStore = useProfileStore()

      // 同步 last_diagnosis_score（模考总分作为诊断分数）
      const scorePercent = this.results.max_score > 0
        ? Math.round((this.results.total_score / this.results.max_score) * 100)
        : 0
      profileStore.setLastDiagnosis(scorePercent)

      // localStorage 历史
      try {
        const raw = localStorage.getItem(EXAM_HISTORY_KEY)
        const history = raw ? JSON.parse(raw) : []
        history.unshift({
          date: this.results.submitted_at,
          total_score: this.results.total_score,
          max_score: this.results.max_score,
          score_percent: scorePercent,
          obj_score: this.results.obj_score,
          obj_max: this.results.obj_max,
          subj_score: this.results.subj_score,
          subj_max: this.results.subj_max,
          weak_points: this.paper.weak_points,
          question_count: this.questionCount,
        })
        localStorage.setItem(EXAM_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
      } catch (e) {
        console.warn('[exam] save history failed:', e)
      }
    },

    // ---- 计时器 ----
    _startTimer() {
      this._stopTimer()
      this.timer.intervalId = setInterval(() => {
        if (this.timer.remaining > 0) {
          this.timer.remaining--
        } else {
          this._stopTimer()
          // 自动提交
          if (this.phase === 'answering') {
            this.submitExam()
          }
        }
      }, 1000)
    },

    _stopTimer() {
      if (this.timer.intervalId) {
        clearInterval(this.timer.intervalId)
        this.timer.intervalId = null
      }
    },

    // ---- 工具 ----
    setAnswer(questionId, answer) {
      this.answers[questionId] = answer
    },

    reset() {
      this._stopTimer()
      this.phase = 'idle'
      this.paper = null
      this.answers = {}
      this.results = null
      this.error = null
      this.gradingProgress = { done: 0, total: 0 }
      this.timer = { duration: 0, remaining: 0, intervalId: null }
    },

    getHistory() {
      try {
        const raw = localStorage.getItem(EXAM_HISTORY_KEY)
        return raw ? JSON.parse(raw) : []
      } catch {
        return []
      }
    },
  },
})
