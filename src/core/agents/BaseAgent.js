// ============================================================
// BaseAgent 基类 + trace 装饰器（v1.5 H3 评审保命）
// ============================================================
// 职责：抽象所有 Agent 的公共逻辑
//   1. runLLM() —— 统一 LLM 调用 + 计时 + 异常包装
//   2. parseStructured() —— 统一 JSON 抽取 + 兜底 schema
//   3. traceAgent() 装饰器 —— 记录 input/output/latency 到 console
//
// 设计：BaseAgent 是"逻辑容器"（不是 class），5 个 Agent 用函数形态
//       调 traceAgent(name, fn) 装饰，自动获得 trace 埋点
// ============================================================

import { AI_PROVIDER } from '@/api/custom'
import { safeParseJSON } from '@/utils/validator'

/**
 * 统一 LLM 调用（含计时 + 异常标准化）
 * @param {string} agentName - agent 标识（用于 trace）
 * @param {string} prompt - system prompt
 * @param {string} userInput - 学生原始输入
 * @param {object} options - 透传给 AI_PROVIDER
 * @param {boolean} useReasoner - 是否用 reasoner 模型
 * @returns {Promise<{content:string, latencyMs:number}>}
 */
export async function runLLM(agentName, prompt, userInput, options = {}, useReasoner = false) {
  const t0 = performance.now()
  let content
  try {
    content = useReasoner
      ? await AI_PROVIDER.callReasoner(prompt, userInput, options)
      : await AI_PROVIDER.call(prompt, userInput, options)
  } catch (e) {
    const latencyMs = Math.round(performance.now() - t0)
    console.error(`[${agentName}] LLM call failed after ${latencyMs}ms:`, e.message)
    const err = new Error(`[${agentName}] LLM call failed: ${e.message}`)
    err.agentName = agentName
    err.latencyMs = latencyMs
    err.cause = e
    throw err
  }
  const latencyMs = Math.round(performance.now() - t0)
  return { content, latencyMs }
}

/**
 * 统一结构化抽取
 * @param {string} raw - LLM 输出
 * @param {object} fallback - 兜底结构
 * @returns {object} parsed
 */
export function parseStructured(raw, fallback) {
  if (!raw || typeof raw !== 'string') return { ...fallback }
  const jsonMatch = raw.match(/```json\s*([\s\S]+?)```/) || raw.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    const parsed = safeParseJSON(jsonMatch[1] || jsonMatch[0], null)
    if (parsed) return parsed
  }
  return { ...fallback }
}

/**
 * traceAgent 装饰器：自动记录 input/output/latency 到 console
 *
 * 用法：
 *   export const tutorAgent = traceAgent('tutor', async (userInput, profile) => {
 *     // ... 业务逻辑
 *     return { intent, agent, content, structured }
 *   })
 *
 * 输出格式：
 *   [agent.tutor] input="MOSFET 阈值电压..." output_len=1832 latency=1240ms
 *
 * 设计要点：
 *   - 保留原函数签名（userInput, profile）不变，调用方零修改
 *   - 出错时记录 error，不吞异常
 *   - latency 用 performance.now() 精确到 ms
 */
export function traceAgent(agentName, fn) {
  return async function tracedAgent(userInput, profile) {
    const t0 = performance.now()
    const inputPreview = String(userInput || '').slice(0, 60).replace(/\s+/g, ' ')
    console.log(`[agent.${agentName}] input="${inputPreview}…"`)

    let result
    try {
      result = await fn(userInput, profile)
      const latencyMs = Math.round(performance.now() - t0)
      const outputLen = (result && result.content) ? String(result.content).length : 0
      console.log(`[agent.${agentName}] output_len=${outputLen} latency=${latencyMs}ms`)
    } catch (e) {
      const latencyMs = Math.round(performance.now() - t0)
      console.error(`[agent.${agentName}] error after ${latencyMs}ms:`, e.message)
      throw e
    }

    return result
  }
}

/**
 * BaseAgent 占位（兼容未来 class 化扩展）
 * 当前 5 Agent 仍以函数形态 + traceAgent 装饰器工作
 * 如需切到 class 形态，把这里的逻辑挪进 class，traceAgent 改成装饰方法即可
 */
export const BaseAgent = {
  runLLM,
  parseStructured,
  traceAgent
}

export default BaseAgent
