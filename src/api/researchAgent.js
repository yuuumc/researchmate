// ============================================================
// Research Agent API Wrapper (v3.0 tool-calling)
// ============================================================
// Calls /api/research-agent which orchestrates:
//   LLM + tools → tool_calls → OpenAlex search → LLM organize → return
// ============================================================

import { profileToContext } from '@/core/profileLoader'

/**
 * Call research agent with tool calling
 * @param {Object} params
 * @param {string} params.userInput - Student's question
 * @param {Object} params.profile - Student profile from profileStore
 * @param {AbortSignal} [params.signal] - Abort signal
 * @returns {Promise<{content, structured, tool_calls_trace, fallback}>}
 */
export async function callResearchAgent({ userInput, profile, signal }) {
  const response = await fetch('/api/research-agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: {
        userInput,
        target_major: profile?.target_major || profile?.major || '集成电路',
        profile_context: profileToContext(profile),
      },
    }),
    signal,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'unknown' }))
    throw new Error(`Research agent failed: ${err.error || response.status}`)
  }

  return response.json()
}
