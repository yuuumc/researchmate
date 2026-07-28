// ============================================================
// 自定义 API 接入点（v1 占位，后期扩展）
// ============================================================
// 用途：后期接入自建模型 / 第三方 API（Qwen / Llama / 自训练模型）
// 切换策略：通过 AI_PROVIDER.current 字段控制
// ============================================================

import { callDeepSeek, callDeepSeekReasoner } from './deepseek'

/**
 * 后期接入自建 API（占位）
 */
export async function callCustomAPI(prompt, userInput, options = {}) {
  // TODO: 后期实现
  // 例如：调用本地部署的 Qwen / Llama / 自训练模型
  throw new Error('Custom API not implemented yet')
}

/**
 * AI Provider 路由
 * v1 用 DeepSeek；后期可通过修改 current 切换到 custom
 */
export const AI_PROVIDER = {
  current: 'deepseek', // 'deepseek' | 'custom'

  async call(prompt, userInput, options) {
    if (this.current === 'deepseek') {
      return await callDeepSeek(prompt, userInput, options)
    } else {
      return await callCustomAPI(prompt, userInput, options)
    }
  },

  async callReasoner(prompt, userInput, options) {
    if (this.current === 'deepseek') {
      return await callDeepSeekReasoner(prompt, userInput, options)
    } else {
      return await callCustomAPI(prompt, userInput, options)
    }
  }
}
