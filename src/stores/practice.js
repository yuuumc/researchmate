// ============================================================
// 练习题 store（v3.1 + W2 Step 3 增强）
// ============================================================
// v3.1: 调用 POST /api/agent { action: 'practice' } → LLM 出题
// W2 Step 3: 新增 DB 抽题模式（按薄弱知识点从 questions 表抽取）
//            + 自动判分 + 错题回写 wrong_book_entries
// ============================================================

import { defineStore } from 'pinia'
import { callAgent } from '@/api/agent'
import { supabase, isSupabaseConfigured } from '@/services/supabase'
import { useWrongBookStore } from '@/stores/wrongBook'

export const usePracticeStore = defineStore('practice', {
  state: () => ({
    loading: false,
    error: null,
    result: null,       // { content, structured } — LLM 模式
    // W2 Step 3: DB 模式
    mode: 'idle',       // idle | llm | db | retry
    dbQuestions: [],    // DB 抽取的题目
    dbAnswers: {},      // { [questionId]: answer }
    dbResults: null,    // 判分结果 { total, correct, wrong, details[] }
  }),

  getters: {
    questions: (state) => state.result?.structured?.questions || [],
    hasResult: (state) => !!state.result,
    hasDbQuestions: (state) => state.dbQuestions.length > 0,
    dbAnsweredCount: (state) => {
      return state.dbQuestions.filter(q => {
        const a = state.dbAnswers[q.id]
        return a != null && String(a).trim() !== ''
      }).length
    },
  },

  actions: {
    // ---- v3.1 原有：LLM 出题 ----
    async runPractice(input) {
      this.loading = true
      this.error = null
      this.mode = 'llm'
      try {
        const res = await callAgent('practice', input)
        this.result = {
          content: res.content || '',
          structured: res.structured || null
        }
        return this.result
      } catch (e) {
        this.error = e.message
        throw e
      } finally {
        this.loading = false
      }
    },

    // ---- W2 Step 3: DB 按薄弱知识点抽题 ----
    async sampleByWeakPoints(weakPoints = [], count = 5) {
      this.loading = true
      this.error = null
      this.mode = 'db'
      this.dbQuestions = []
      this.dbAnswers = {}
      this.dbResults = null

      try {
        if (!isSupabaseConfigured) {
          throw new Error('Supabase 未配置')
        }

        const kps = Array.isArray(weakPoints) ? weakPoints.slice(0, 10) : []
        if (kps.length === 0) {
          throw new Error('无薄弱知识点，请先完成诊断')
        }

        // 按知识点抽题（每个知识点最多 2 题）
        const all = []
        for (const kp of kps) {
          const kpStr = typeof kp === 'string' ? kp : (kp.knowledge_point || kp.topic || '')
          if (!kpStr) continue
          const { data, error } = await supabase
            .from('questions')
            .select('id, subject, knowledge_point, question_type, difficulty, content')
            .eq('status', 'published')
            .eq('knowledge_point', kpStr)
            .in('question_type', ['choice', 'fill'])
            .limit(5)
          if (error) {
            console.warn('[practice] sample ' + kpStr + ':', error.message)
            continue
          }
          if (data && data.length > 0) {
            const shuffled = data.sort(() => Math.random() - 0.5)
            all.push(...shuffled.slice(0, 2))
          }
        }

        // 如果按知识点精确匹配不足，降级模糊搜索
        if (all.length < count) {
          for (const kp of kps) {
            if (all.length >= count) break
            const kpStr = typeof kp === 'string' ? kp : (kp.knowledge_point || kp.topic || '')
            const { data } = await supabase
              .from('questions')
              .select('id, subject, knowledge_point, question_type, difficulty, content')
              .eq('status', 'published')
              .ilike('knowledge_point', `%${kpStr}%`)
              .in('question_type', ['choice', 'fill'])
              .limit(3)
            if (data) {
              const existing = new Set(all.map(q => q.id))
              for (const q of data) {
                if (!existing.has(q.id)) {
                  all.push(q)
                  if (all.length >= count) break
                }
              }
            }
          }
        }

        // 如果还不够，全表随机补充
        if (all.length < count) {
          const { data } = await supabase
            .from('questions')
            .select('id, subject, knowledge_point, question_type, difficulty, content')
            .eq('status', 'published')
            .in('question_type', ['choice', 'fill'])
            .limit(10)
          if (data) {
            const existing = new Set(all.map(q => q.id))
            for (const q of data) {
              if (!existing.has(q.id)) {
                all.push(q)
                if (all.length >= count) break
              }
            }
          }
        }

        // 标准化
        this.dbQuestions = all.slice(0, count).map(q => {
          const c = q.content || {}
          return {
            id: q.id,
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

        // 初始化答案
        for (const q of this.dbQuestions) {
          this.dbAnswers[q.id] = ''
        }

        return this.dbQuestions
      } catch (e) {
        this.error = e.message
        throw e
      } finally {
        this.loading = false
      }
    },

    setDbAnswer(questionId, answer) {
      this.dbAnswers[questionId] = answer
    },

    // ---- 自动判分 + 错题回写 ----
    async gradeAndPersist() {
      if (!isSupabaseConfigured || this.dbQuestions.length === 0) return null

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('未登录')

      const details = []
      const attempts = []
      const wrongQuestionIds = []

      for (const q of this.dbQuestions) {
        const userAnswer = this.dbAnswers[q.id] ?? ''
        const isCorrect = this.gradeObjective(q, userAnswer)
        details.push({
          question_id: q.id,
          knowledge_point: q.knowledge_point,
          subject: q.subject,
          question_type: q.question_type,
          difficulty: q.difficulty,
          is_correct: isCorrect,
          score: isCorrect ? q.difficulty : 0,
          user_answer: userAnswer,
          correct_answer: q.correct_answer,
          stem: q.stem,
        })
        if (!isCorrect) wrongQuestionIds.push(q.id)

        attempts.push({
          user_id: user.id,
          question_id: q.id,
          answer: { user_answer: userAnswer, is_correct: isCorrect },
          is_correct: isCorrect,
          score: isCorrect ? q.difficulty : 0,
          feedback: { knowledge_point: q.knowledge_point, difficulty: q.difficulty, subject: q.subject },
        })
      }

      // 写 question_attempts
      if (attempts.length > 0) {
        const { error: attError } = await supabase
          .from('question_attempts')
          .insert(attempts)
        if (attError) console.error('[practice] attempts insert:', attError)
      }

      // 写 wrong_book_entries（错题）
      const wbStore = useWrongBookStore()
      const insertedAttempts = await this.getRecentAttempts(user.id, wrongQuestionIds)

      for (const qId of wrongQuestionIds) {
        const q = this.dbQuestions.find(x => x.id === qId)
        if (!q) continue

        // upsert wrong_book_entries
        const { data: wbData, error: wbError } = await supabase
          .from('wrong_book_entries')
          .upsert({
            user_id: user.id,
            question_id: qId,
            attempt_id: insertedAttempts[qId] || null,
            wrong_count: 1,
            last_wrong_at: new Date().toISOString(),
          }, { onConflict: 'user_id,question_id' })
          .select('id')
          .maybeSingle()

        if (wbError) {
          console.error('[practice] wrong_book insert:', wbError)
        }

        // 同步到 localStorage wrongBookStore
        wbStore.addIfWeak(q.knowledge_point, 1, 'weak_point')
      }

      this.dbResults = {
        total: details.length,
        correct: details.filter(d => d.is_correct).length,
        wrong: wrongQuestionIds.length,
        details,
      }

      return this.dbResults
    },

    async getRecentAttempts(userId, questionIds) {
      if (questionIds.length === 0) return {}
      const { data, error } = await supabase
        .from('question_attempts')
        .select('id, question_id')
        .eq('user_id', userId)
        .in('question_id', questionIds)
        .order('created_at', { ascending: false })
        .limit(questionIds.length * 2)
      if (error || !data) return {}
      const map = {}
      for (const r of data) {
        if (!map[r.question_id]) map[r.question_id] = r.id
      }
      return map
    },

    gradeObjective(question, userAnswer) {
      if (!userAnswer || !question.correct_answer) return false
      const correct = String(question.correct_answer).trim()
      const user = String(userAnswer).trim()
      if (question.question_type === 'choice') {
        const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 1)
        return norm(correct) === norm(user)
      }
      const normText = (s) => s.toLowerCase().replace(/\s+/g, '').replace(/[，。、；：！？,.:;!?]/g, '')
      return normText(correct) === normText(user)
    },

    // ---- 错题重练 ----
    async loadWrongQuestions() {
      this.loading = true
      this.error = null
      this.mode = 'retry'
      this.dbQuestions = []
      this.dbAnswers = {}
      this.dbResults = null

      try {
        if (!isSupabaseConfigured) throw new Error('Supabase 未配置')
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('未登录')

        // 从 wrong_book_entries 加载错题
        const { data: wbData, error: wbError } = await supabase
          .from('wrong_book_entries')
          .select('question_id, wrong_count, last_wrong_at')
          .eq('user_id', user.id)
          .order('last_wrong_at', { ascending: false })
          .limit(10)

        if (wbError) throw wbError
        if (!wbData || wbData.length === 0) {
          this.error = '错题本为空，先去做练习吧'
          return []
        }

        // 拉取题目详情
        const qIds = wbData.map(w => w.question_id).filter(Boolean)
        if (qIds.length === 0) return []

        const { data: qData, error: qError } = await supabase
          .from('questions')
          .select('id, subject, knowledge_point, question_type, difficulty, content')
          .in('id', qIds)

        if (qError) throw qError

        this.dbQuestions = (qData || []).map(q => {
          const c = q.content || {}
          return {
            id: q.id,
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

        for (const q of this.dbQuestions) {
          this.dbAnswers[q.id] = ''
        }

        return this.dbQuestions
      } catch (e) {
        this.error = e.message
        throw e
      } finally {
        this.loading = false
      }
    },

    // ---- 错题掌握后移除 ----
    async resolveWrongQuestion(questionId) {
      if (!isSupabaseConfigured) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { error } = await supabase
        .from('wrong_book_entries')
        .delete()
        .eq('user_id', user.id)
        .eq('question_id', questionId)
      if (error) console.error('[practice] resolve wrong:', error)

      const wbStore = useWrongBookStore()
      const q = this.dbQuestions.find(x => x.id === questionId)
      if (q) wbStore.resolveByTopic(q.knowledge_point)
    },


    // ---- W3-3: AI 出题结果加入练习 ----
    addLLMToPractice(knowledgePoint, difficulty) {
      const llmQs = this.questions
      if (!llmQs.length) return

      this.dbQuestions = llmQs.map((q, idx) => {
        const qType = (q.type || q.question_type || '').includes('选择') ? 'choice' : 'fill'
        const opts = q.options
          ? (typeof q.options === 'object' && !Array.isArray(q.options)
            ? Object.entries(q.options).map(([k, v]) => k + '. ' + v)
            : (Array.isArray(q.options) ? q.options : []))
          : null
        return {
          id: 'ai_' + Date.now() + '_' + idx,
          subject: 'AI生成',
          knowledge_point: knowledgePoint || 'AI生成',
          question_type: qType,
          difficulty: difficulty || '中级',
          stem: q.stem || q.question || '',
          options: opts,
          correct_answer: q.answer ?? q.correct_answer ?? null,
          explanation: q.explanation || q.analysis || '',
        }
      })

      this.dbAnswers = {}
      for (const q of this.dbQuestions) {
        this.dbAnswers[q.id] = ''
      }
      this.dbResults = null
      this.mode = 'db'

      return this.dbQuestions
    },

    clear() {
      this.result = null
      this.error = null
      this.mode = 'idle'
      this.dbQuestions = []
      this.dbAnswers = {}
      this.dbResults = null
    }
  }
})
