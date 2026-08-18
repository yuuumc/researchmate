// ============================================================
// feynman store — F4 费曼模式会话状态（前端维护）
// ============================================================
// 闭环：选知识点 → 学生复述 → AI 追问（SSE 流式）→ 满 3 轮或主动结束
//       → 理解深度评分 → 经 F1 profileBus mastery-snapshot 写回 knowledge_state
//       → 评分 <60 推荐白板推导/变式题
// 会话状态全部在前端维护，每轮 ask 是独立 LLM 调用（无状态 API）。
// ============================================================

import { defineStore } from 'pinia'
import { profileBus, EVT } from '@/core/profileBus'

const MAX_AUTO_ROUNDS = 3 // 满 3 轮学生复述自动结束评估

export const useFeynmanStore = defineStore('feynman', {
  state: () => ({
    // idle | active | asking | evaluating | done | error
    status: 'idle',
    topic: '',
    // 对话记录：[{ role:'student'|'assistant', content }]
    history: [],
    // 当前流式 token 累积
    streamingContent: '',
    // 评估结果
    evaluation: null,
    errorMsg: '',
    // 学生复述轮数
    studentTurnCount: 0,
  }),

  getters: {
    isActive: (s) => s.status === 'active' || s.status === 'asking' || s.status === 'evaluating',
    canEnd: (s) => s.studentTurnCount >= 1 && s.status !== 'evaluating' && s.status !== 'done',
    shouldAutoEnd: (s) => s.studentTurnCount >= MAX_AUTO_ROUNDS,
  },

  actions: {
    startSession(topic) {
      this.topic = topic
      this.history = []
      this.streamingContent = ''
      this.evaluation = null
      this.errorMsg = ''
      this.studentTurnCount = 0
      this.status = 'active'
    },

    /**
     * 发起一轮费曼追问（SSE 流式）
     * @param {string} studentText 学生复述文本
     * @returns {Promise<string>} AI 完整回复
     */
    async askRound(studentText) {
      if (!studentText || !this.topic) return ''
      // 追加学生消息
      this.history.push({ role: 'student', content: studentText })
      this.studentTurnCount += 1
      this.status = 'asking'
      this.streamingContent = ''
      this.errorMsg = ''

      try {
        const reply = await this._streamAsk(this.history)
        // 追加 AI 回复
        this.history.push({ role: 'assistant', content: reply })
        this.streamingContent = ''
        // 满 3 轮自动结束评估
        if (this.shouldAutoEnd) {
          await this.endSession()
        } else {
          this.status = 'active'
        }
        return reply
      } catch (e) {
        console.error('[feynman] askRound failed:', e)
        this.errorMsg = e?.message || '追问请求失败'
        this.status = 'active' // 允许重试
        // 移除已追加但失败的学生消息，避免历史污染
        if (this.history.length && this.history[this.history.length - 1].role === 'student') {
          this.history.pop()
          this.studentTurnCount = Math.max(0, this.studentTurnCount - 1)
        }
        throw e
      }
    },

    /**
     * SSE 流式消费 /api/feynman stage=ask
     */
    async _streamAsk(history) {
      const resp = await fetch('/api/feynman', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'ask', topic: this.topic, history }),
      })
      if (!resp.ok || !resp.body) {
        const errText = await resp.text().catch(() => '')
        throw new Error(`ask HTTP ${resp.status}: ${errText.slice(0, 120)}`)
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let total = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const evt of events) {
          for (const line of evt.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data:')) continue
            const payload = trimmed.slice(5).trim()
            if (payload === '[DONE]') return total
            try {
              const parsed = JSON.parse(payload)
              if (parsed.error) {
                throw new Error(parsed.message || parsed.error)
              }
              const delta = parsed.choices?.[0]?.delta?.content || ''
              if (delta) {
                total += delta
                this.streamingContent = total
              }
            } catch (e) {
              if (e.message && !e.message.includes('JSON')) throw e
              // 非 JSON 心跳行忽略
            }
          }
        }
      }
      return total
    },

    /**
     * 结束会话并生成理解深度评估
     * 评估完成后经 F1 profileBus mastery-snapshot 写回 knowledge_state
     */
    async endSession() {
      if (this.history.length === 0) {
        this.status = 'idle'
        return
      }
      this.status = 'evaluating'
      this.errorMsg = ''

      try {
        const resp = await fetch('/api/feynman', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: 'evaluate', topic: this.topic, history: this.history }),
        })
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '')
          throw new Error(`evaluate HTTP ${resp.status}: ${errText.slice(0, 120)}`)
        }
        const result = await resp.json()

        this.evaluation = {
          score: result.score,
          errors: result.errors || [],
          strengths: result.strengths || [],
          recommendation: result.recommendation || 'practice',
          summary: result.summary || '',
        }

        // === F1 写画像：理解深度评分作为绝对掌握度快照写回 knowledge_state ===
        profileBus.emit(EVT.MASTERY_SNAPSHOT, {
          items: [{ topic: this.topic, mastery: result.score / 100, source: 'feynman' }],
          timestamp: new Date().toISOString(),
        })

        this.status = 'done'
      } catch (e) {
        console.error('[feynman] endSession failed:', e)
        this.errorMsg = e?.message || '评估请求失败'
        this.status = 'error'
        throw e
      }
    },

    reset() {
      this.status = 'idle'
      this.topic = ''
      this.history = []
      this.streamingContent = ''
      this.evaluation = null
      this.errorMsg = ''
      this.studentTurnCount = 0
    },
  },
})
