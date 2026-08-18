// ============================================================
// 诊断会话 Store（W2 Step 2 · 混合模式）
// ============================================================
// 编排：抽客观题(DB) → 获取主观题(LLM) → 收集作答 → 自动判分 +
// LLM 评判 → 写 diagnoses 表 + 更新 profiles.weak_points
// ============================================================

import { defineStore } from 'pinia'
import { supabase, isSupabaseConfigured } from '@/services/supabase'
import { fetchSubjectiveQuestions, gradeDiagnosis } from '@/api/diagnosis'
import { gradeObjective as _gradeObjective } from '@/utils/grading'
import { useProfileStore } from '@/stores/profile'
import { saveProfile } from '@/services/profileService'
import { useDiagnosisStore } from '@/stores/diagnosis'
import { useWrongBookStore } from '@/stores/wrongBook'
import { useSyncStore } from '@/stores/sync'

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
      // Batch query: single .in() instead of per-subject loop (N+1 fix)
      const all = []
      const { data, error } = await supabase
        .from('questions')
        .select('id, subject, knowledge_point, question_type, difficulty, content')
        .eq('status', 'published')
        .in('question_type', ['choice', 'fill'])
        .in('subject', SUBJECTS)
        .limit(100)
      if (error) {
        console.warn('[diagnosisSession] batch sample error:', error.message)
      } else if (data) {
        // Group by subject, take 2 per subject
        const bySubject = {}
        for (const q of data) {
          if (!bySubject[q.subject]) bySubject[q.subject] = []
          if (bySubject[q.subject].length < 2) bySubject[q.subject].push(q)
        }
        for (const subj of SUBJECTS) {
          if (bySubject[subj]) {
            const shuffled = bySubject[subj].sort(() => Math.random() - 0.5)
            all.push(...shuffled.slice(0, 2))
          }
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
      // T0-1/T0-2: 委托共享判分模块（确保诊断与练习判分一致）
      return _gradeObjective(question, userAnswer)
    },

    async persistToDB(gradeRes, objectiveResults) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const structured = gradeRes.structured || {}

      // A2-e: 持久化客观题 ID 到 structured，供练习去重使用
      if (objectiveResults && objectiveResults.length > 0) {
        structured.objective_question_ids = objectiveResults.map(r => r.question_id)
      }

      // P1-fix②: LLM 评分返回空 weakPoints 时，以客观题答错对应知识点兜底入 weak
      // （确定性后处理，不动 prompt；与 8/14 suggested_score 锚点后处理同思路）
      let weakPoints = (structured.weak_points || []).map(wp => {
        if (typeof wp === 'string') return wp
        return wp.knowledge_point || wp.reason || JSON.stringify(wp)
      })
      if (weakPoints.length === 0 && objectiveResults && objectiveResults.length > 0) {
        const fallback = objectiveResults
          .filter(r => !r.is_correct && r.knowledge_point)
          .map(r => r.knowledge_point)
        weakPoints = [...new Set(fallback)]
        if (weakPoints.length > 0) {
          structured.weak_points = weakPoints
          console.info('[diagnosisSession] LLM weak_points empty, fallback from objective wrong answers:', weakPoints)
        }
      }

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

      // OB-1: 错题回写 — 诊断客观题答错 → wrong_book_entries（与练习 gradeAndPersist 同口径，修复 RC-3）
      const wrongResults = objectiveResults.filter(r => !r.is_correct)
      if (wrongResults.length > 0) {
        const wrongQIds = wrongResults.map(r => r.question_id)
        const { data: attData } = await supabase
          .from('question_attempts')
          .select('id, question_id')
          .eq('user_id', user.id)
          .in('question_id', wrongQIds)
          .order('created_at', { ascending: false })
          .limit(wrongQIds.length * 2)
        const attMap = {}
        if (attData) {
          for (const r of attData) {
            if (!attMap[r.question_id]) attMap[r.question_id] = r.id
          }
        }
        const wbRows = wrongResults.map(r => ({
          user_id: user.id,
          question_id: r.question_id,
          attempt_id: attMap[r.question_id] || null,
          wrong_count: 1,
          last_wrong_at: new Date().toISOString(),
        }))
        const { error: wbError } = await supabase
          .from('wrong_book_entries')
          .upsert(wbRows, { onConflict: 'user_id,question_id' })
        if (wbError) console.error('[diagnosisSession] wrong_book insert:', wbError)
      }

      // 更新 profiles.weak_points（flat 列）— weakPoints 已在上方含兜底逻辑计算
      try {
        await saveProfile({ weak_points: weakPoints })
        // 同步到 profileStore（让 ProfileView 也能读到）
        const profileStore = useProfileStore()
        profileStore.updateProfile({ weak_points: weakPoints, weak_topics: weakPoints })
      } catch (e) {
        console.error('[diagnosisSession] profiles update:', e)
      }

      // OB-1: 刷新诊断历史与错题本 store，使主页/练习页即时读到新记录（数据刷新链路，修复 RC-1）
      try {
        const diagnosisStore = useDiagnosisStore()
        await diagnosisStore.loadFromDB()
      } catch (e) {
        console.warn('[diagnosisSession] diagnosisStore refresh:', e)
      }
      try {
        const wrongBookStore = useWrongBookStore()
        await wrongBookStore.loadFromDB()
      } catch (e) {
        console.warn('[diagnosisSession] wrongBookStore refresh:', e)
      }

      // P0-fix①: 诊断写入 DB 后翻转同步状态机（persistToDB 此前全程未触发 syncStore，
      // 导致侧边栏「待同步·从未同步」常驻——用户可见状态，P0）
      try {
        const syncStore = useSyncStore()
        syncStore.markSynced()
      } catch (e) {
        console.warn('[diagnosisSession] syncStore.markSynced:', e)
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
