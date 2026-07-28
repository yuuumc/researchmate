// ============================================================
// DeepSeek API 前端封装（v1 改造版）
// ============================================================
// 安全：前端只调 /api/chat 同源代理，不持有 API Key
// 详见 v1 §5.3 / v3 §翻车点 11
// ============================================================

import axios from 'axios'

const client = axios.create({
  // 空字符串 = 同源（推荐生产用）；本地 dev 通过 vite proxy 转发到 vercel dev
  baseURL: import.meta.env.VITE_API_BASE || '',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000 // 30s，DeepSeek 偶尔较慢
})

/**
 * 调用 DeepSeek（通过 /api/chat 代理）
 * @param {string} prompt - system prompt
 * @param {string} userInput - 用户输入
 * @param {object} options - { model, temperature, max_tokens }
 * @returns {Promise<string>} 模型回复内容
 */
export async function callDeepSeek(prompt, userInput, options = {}) {
  const {
    model = 'deepseek-chat',
    temperature = 0.7,
    max_tokens = 2000
  } = options

  try {
    const { data } = await client.post('/api/chat', {
      prompt,
      userInput,
      options: { model, temperature, max_tokens }
    })
    return data.content
  } catch (e) {
    // 统一错误格式
    const msg = e.response?.data?.error || e.message || 'unknown_error'
    console.error('[deepseek] call failed:', msg)
    throw new Error(`AI_SERVICE_ERROR: ${msg}`)
  }
}

/**
 * 调用 deepseek-reasoner（推理模型，v3 用于 4 层根因链诊断）
 */
export async function callDeepSeekReasoner(prompt, userInput, options = {}) {
  return callDeepSeek(prompt, userInput, {
    ...options,
    model: 'deepseek-reasoner'
  })
}
