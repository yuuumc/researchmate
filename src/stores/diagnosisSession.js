// ============================================================
// 诊断会话 Store（W2 Step 2 · 混合模式）
// ============================================================
// 编排：抽客观题(DB) → 获取主观题(LLM) → 收集作答 → 自动判分 +
// LLM 评判 → 写 diagnoses 表 + 更新 profiles.weak_points
// ============================================================

import { defineStore } from 'pinia'
import { supabase, isSupabaseConfigured } from '@/services/supabase'
import { fetchSubjectiveQuestions, gradeDiagnosis } from '@/api/diagnosis'
import { useProfileStore } from '@/stores/profile'
import { saveProfile } from '@/services/profileService'

const SUBJECTS = ['半导体物理', '微电子器件', '数字IC', '模拟IC', '固态物理']

export const useDiagnosisSessionStore = defineStore('diagnosisSession', {
  state: () => ({
    phase: 'idle',      // idle | loading | testing | grading | done | error
    objectiveQuestions: [],
    subjectiveQuestions: [],
    answers: {},        // { [questionId]: answer }
    result: null,       // { content, structured, objective_stats }
    error: null,
  }),

  getters: {
    allQuestions: (s) => [...s.objectiveQuestions, ...s.subjectiveQuestions],
    answeredCount: (s) => {
      const all = [...s.objectiveQuestions, ...s.subjectiveQuestions]
      return all.filter(q => {
        const a = s.answers[q.id]
        return a != null && String(a).trim() !== ''
      }).length
    },
    totalQuestions: (s) => s.objectiveQuestions.length + s.subjectiveQuestions.length,
  },

  actions: {
    async start() {
      this.phase = 'loading'
      this.error = null
      this.result = null
      try {
        const profileStore = useProfileStore()
        const profile = profileStore.profile || {}
        const targetMajor = profile.target_major || profile.major || '集成电路'

        // 1. 客观题：从 DB 抽题
        let objectiveQuestions = []
        if (isSupabaseConfigured) {
          objectiveQuestions = await this.sampleObjective()
        }
        this.objectiveQuestions = objectiveQuestions

        // 2. 主观题：LLM 生成
        const weakPoints = profile.weak_topics || profile.weak_points || []
        const mastered = profile.mastered_topics || profile.mastered_skills || []

        const subjRes = await fetchSubjectiveQuestions({
          target_major: targetMajor,
          weak_points: Array.isArray(weakPoints) ? weakPoints : [],
          knowledge_points: [],
        })
        this.subjectiveQuestions = (subjRes.questions || []).map(q => ({
          ...q,
          source: 'subjective',
        }))

        // 3. 初始化答案
        this.answers = {}
        for (const q of this.allQuestions) {
          this.answers[q.id] = q.question_type === 'choice' ? '' : ''
        }

        this.phase = 'testing'
      } catch (e) {
        console.error('[diagnosisSession] start failed:', e)
        this.error = e.message
        this.phase = 'error'
      }
    },

    async sampleObjective() {
      // 每学科抽 2 题（choice/fill），混合难度
      const all = []
      for (const subject of SUBJECTS) {
        const { data, error } = await supabase
          .from('questions')
          .select('id, subject, knowledge_point, question_type, difficulty, content')
          .eq('subject', subject)
          .eq('status', 'published')
          .in('question_type', ['choice', 'fill'])
          .limit(20)
        if (error) {
          console.warn('[diagnosisSession] sample ' + subject + ' error:', error.message)
          continue
        }
        if (data && data.length > 0) {
          const shuffled = data.sort(() => Math.random() - 0.5)
          all.push(...shuffled.slice(0, 2))
        }
      }
      // 标准化结构
      return all.map(q => {
        const c = q.content || {}
        return {
          id: q.id,
          source: 'objective',
          subject: q.subject,
          knowledge_point: q.knowledge_point,
          question_type: q.question_type,
          difficulty: q.difficulty,
          stem: c.stem || c.question || c.title || '',
          options: c.options
            ? (Array.isArray(c.options)
              ? c.options
              : (typeof c.options === 'object' ? Object.values(c.options) : [c.options]))
            : null,
          correct_answer: c.answer ?? c.correct_answer ?? null,
          explanation: c.explanation || c.analysis || '',
        }
      })
    },

    setAnswer(questionId, answer) {
      this.answers[questionId] = answer
    },

    async submit() {
      this.phase = 'grading'
      this.error = null
      try {
        // 1. 客观题自动判分
        const objectiveResults = this.objectiveQuestions.map(q => {
          const userAnswer = this.answers[q.id] ?? ''
          const isCorrect = this.gradeObjective(q, userAnswer)
          return {
            question_id: q.id,
            knowledge_point: q.knowledge_point,
            subject: q.subject,
            question_type: q.question_type,
            difficulty: q.difficulty,
            is_correct: isCorrect,
            score: isCorrect ? q.difficulty : 0,
            user_answer: userAnswer,
          }
        })

        // 2. 主观题作答
        const subjectiveAnswers = this.subjectiveQuestions.map(q => ({
          id: q.id,
          knowledge_point: q.knowledge_point || '',
          question: q.question,
          answer: this.answers[q.id] || '',
        }))

        // 3. 调 grade API
        const profileStore = useProfileStore()
        const profile = profileStore.profile || {}
        const gradeRes = await gradeDiagnosis({
          objective_results: objectiveResults,
          subjective_answers: subjectiveAnswers,
          profile: {
            student_name: profile.name || profile.nickname || '',
            target_major: profile.target_major || profile.major || '集成电路',
            mastered_skills: profile.mastered_topics || profile.mastered_skills || [],
            weak_points: profile.weak_topics || profile.weak_points || [],
          },
          knowledge_points: [],
        })

        this.result = gradeRes

        // 4. 持久化到 DB
        if (isSupabaseConfigured) {
          await this.persistToDB(gradeRes, objectiveResults)
        }

        this.phase = 'done'
        return gradeRes
      } catch (e) {
        console.error('[diagnosisSession] submit failed:', e)
        this.error = e.message
        this.phase = 'error'
        throw e
      }
    },

    gradeObjective(question, userAnswer) {
      if (!userAnswer || !question.correct_answer) return false
      const correct = String(question.correct_answer).trim()
      const user = String(userAnswer).trim()
      if (question.question_type === 'choice') {
        // 选择题：取首字母（A/B/C/D 或 0/1/2/3）
        const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 1)
        return norm(correct) === norm(user)
      }
      // 填空题：去空白+标点后比较
      const normText = (s) => s.toLowerCase().replace(/\s+/g, '').replace(/[，。、；：！？,.:;!?]/g, '')
      return normText(correct) === normText(user)
    },

    async persistToDB(gradeRes, objectiveResults) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const structured = gradeRes.structured || {}

      // 写 diagnoses 表
      const { error: diagError } = await supabase
        .from('diagnoses')
        .insert({
          user_id: user.id,
          structured: structured,
          score: typeof structured.score === 'number' ? structured.score : null,
        })
      if (diagError) console.error('[diagnosisSession] diagnoses insert:', diagError)

      // 写 question_attempts
      const attempts = objectiveResults.map(r => ({
        user_id: user.id,
        question_id: r.question_id,
        answer: { user_answer: r.user_answer, is_correct: r.is_correct },
        is_correct: r.is_correct,
        score: r.score,
        feedback: { knowledge_point: r.knowledge_point, difficulty: r.difficulty, subject: r.subject },
      }))
      if (attempts.length > 0) {
        const { error: attError } = await supabase
          .from('question_attempts')
          .insert(attempts)
        if (attError) console.error('[diagnosisSession] attempts insert:', attError)
      }

      // 更新 profiles.weak_points（flat 列）
      const weakPoints = (structured.weak_points || []).map(wp => {
        if (typeof wp === 'string') return wp
        return wp.knowledge_point || wp.reason || JSON.stringify(wp)
      })
      try {
        await saveProfile({ weak_points: weakPoints })
        // 同步到 profileStore（让 ProfileView 也能读到）
        const profileStore = useProfileStore()
        profileStore.updateProfile({ weak_points: weakPoints, weak_topics: weakPoints })
      } catch (e) {
        console.error('[diagnosisSession] profiles update:', e)
      }
    },

    reset() {
      this.phase = 'idle'
      this.objectiveQuestions = []
      this.subjectiveQuestions = []
      this.answers = {}
      this.result = null
      this.error = null
    },
  },
})
