// ============================================================
// AI Provider 路由（v2.0 SSE 流式版）
// ============================================================
// 用途：统一所有 LLM 调用入口，支持流式 + 非流式切换
// 当前实现：DeepSeek；后期可扩展 custom（Qwen / Llama / 自训练模型）
//
// 切换策略：通过 AI_PROVIDER.current 字段控制
// ============================================================

import {
  callDeepSeek,
  callDeepSeekReasoner,
  callDeepSeekStream,
  callDeepSeekReasonerStream
} from './deepseek'

/**
 * 自定义 API 占位（后期实现）
 */
export async function callCustomAPI(prompt, userInput, options = {}) {
  throw new Error('Custom API not implemented yet')
}

/**
 * Provider 路由表
 * v1 用 DeepSeek；后期可通过修改 current 切换到 custom
 */
export const AI_PROVIDER = {
  current: 'deepseek', // 'deepseek' | 'custom'

  // 非流式调用
  async call(prompt, userInput, options) {
    if (this.current === 'deepseek') {
      return await callDeepSeek(prompt, userInput, options)
    }
    return await callCustomAPI(prompt, userInput, options)
  },

  async callReasoner(prompt, userInput, options) {
    if (this.current === 'deepseek') {
      return await callDeepSeekReasoner(prompt, userInput, options)
    }
    return await callCustomAPI(prompt, userInput, options)
  },

  // v2.0 新增：流式调用
  async callStream(prompt, userInput, options, onToken, signal) {
    if (this.current === 'deepseek') {
      return await callDeepSeekStream(prompt, userInput, options, onToken, signal)
    }
    return await callCustomAPI(prompt, userInput, options)
  },

  async callReasonerStream(prompt, userInput, options, onToken, signal) {
    if (this.current === 'deepseek') {
      return await callDeepSeekReasonerStream(prompt, userInput, options, onToken, signal)
    }
    return await callCustomAPI(prompt, userInput, options)
  }
}
