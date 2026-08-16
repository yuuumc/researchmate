// ============================================================
// Research Agent API Wrapper (v3.0 tool-calling + B5 trace 落库)
// ============================================================
// Calls /api/research-agent which orchestrates:
//   LLM + tools → tool_calls → OpenAlex search → LLM organize → return
// B5：返回后落 trace（含 tool_calls_trace 工具链），供架构看板展示。
// ============================================================

import { profileToContext } from '@/core/profileLoader'
import { recordAgentTrace } from '@/services/agentTrace'

/**
 * Call research agent with tool calling
 * @param {Object} params
 * @param {string} params.userInput - Student's question
 * @param {Object} params.profile - Student profile from profileStore
 * @param {AbortSignal} [params.signal] - Abort signal
 * @returns {Promise<{content, structured, tool_calls_trace, fallback}>}
 */
export async function callResearchAgent({ userInput, profile, signal }) {
  const input = {
    userInput,
    target_major: profile?.target_major || profile?.major || '集成电路',
    profile_context: profileToContext(profile),
  }

  try {
    const response = await fetch('/api/research-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
      signal,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'unknown' }))
      recordAgentTrace({
        agent_role: 'research', action: 'research',
        input: { userInput }, output: { error: err.error || String(response.status) },
        status: 'error',
      })
      throw new Error(`Research agent failed: ${err.error || response.status}`)
    }

    const data = await response.json()

    // 落 trace（fire-and-forget）：research-agent 的 tool_calls_trace 是核心展示项
    recordAgentTrace({
      agent_role: 'research',
      action: 'research',
      input: { userInput },
      output: { content: data.content, structured: data.structured },
      tool_calls_trace: data.tool_calls_trace || [],
      usage: data.usage,
      status: data.fallback ? 'done' : 'done',
    })

    return data
  } catch (e) {
    // 网络/中断错误落一条 error trace（非业务错误才落，避免重复）
    if (e?.message && !e.message.startsWith('Research agent failed')) {
      recordAgentTrace({
        agent_role: 'research', action: 'research',
        input: { userInput }, output: { error: e.message },
        status: 'error',
      })
    }
    throw e
  }
}
