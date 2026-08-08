// ============================================================
// Research Agent with Tool Calling (v3.0 RAG-style)
// ============================================================
// Flow: LLM + tools → tool_calls → execute → LLM organize → return
// Tools: search_papers (OpenAlex), search_questions (Supabase)
// Fallback: if tools fail, fall back to direct LLM generation
// ============================================================

import { getProviderConfig, validateProviderConfig, buildHeaders } from './llm-provider.js'
import { loadPrompt, substitute, shouldUseCompact, extractStructured } from './prompt-loader.js'
import { applyCors, getClientIp, checkRateLimit, RATE_LIMIT_WINDOW_MS } from './_middleware.js'
import { TOOL_DEFINITIONS, executeTool } from './tools.js'

const AGENT_TIMEOUT_MS = 55000
const MAX_TOOL_ITERATIONS = 3

export default async function handler(req, res) {
  if (!applyCors(req, res, '[api/research-agent]')) return

  const clientIp = getClientIp(req)
  if (!checkRateLimit(clientIp)) {
    res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)))
    return res.status(429).json({ error: 'rate_limited' })
  }

  const { input = {} } = req.body
  const config = getProviderConfig()
  const { valid } = validateProviderConfig(config)
  if (!valid) {
    return res.status(500).json({ error: 'provider_not_configured' })
  }

  // Build system prompt
  const compact = shouldUseCompact()
  const promptTemplate = loadPrompt('research', { compact })
  if (!promptTemplate) {
    return res.status(500).json({ error: 'prompt_not_found' })
  }

  let systemPrompt = substitute(promptTemplate, input)

  // Inject profile context
  if (input.profile_context) {
    systemPrompt += `\n\n# 学生画像\n${input.profile_context}\n`
  }
  if (input.plan_result && typeof input.plan_result === 'object') {
    systemPrompt += `\n\n# 规划结果（注入数据）\n\n\`\`\`json\n${JSON.stringify(input.plan_result, null, 2)}\n\`\`\`\n`
  }

  // Tool calling instruction
  systemPrompt += `\n\n# 论文检索工作流（必须遵守）
你必须先使用 search_papers 工具检索真实学术论文，然后基于检索结果为学生推荐论文。
不要凭记忆生成论文标题——所有推荐的论文必须来自 search_papers 的返回结果。
从检索结果中筛选最适合学生的 3-5 篇，为每篇写一句推荐理由（value 字段）。
如果检索结果不足，可以多次调用 search_papers 使用不同关键词。`

  const userInput = input.userInput || input.question ||
    `请根据我的专业（${input.target_major || '集成电路'}）生成科研成长路线。`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userInput }
  ]

  const tool_calls_trace = []
  let lastError = null

  try {
    // === Tool calling loop ===
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS)

      const requestBody = {
        model: config.model,
        messages,
        temperature: 0.6,
        max_tokens: iteration === 0 ? 1500 : 3000,
        stream: false,
      }

      // Only add tools on first iteration
      if (iteration === 0) {
        requestBody.tools = TOOL_DEFINITIONS
        requestBody.tool_choice = 'auto'
      }

      const response = await fetch(config.chatUrl, {
        method: 'POST',
        headers: buildHeaders(config),
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const errText = await response.text()
        console.error(`[research-agent] upstream ${response.status}:`, errText.slice(0, 200))
        lastError = `upstream_${response.status}`
        break
      }

      const data = await response.json()
      const message = data.choices?.[0]?.message

      if (!message) {
        lastError = 'no_message_in_response'
        break
      }

      // Check for tool calls
      if (message.tool_calls && message.tool_calls.length > 0 && iteration < MAX_TOOL_ITERATIONS - 1) {
        // Add assistant message with tool_calls to conversation
        messages.push({
          role: 'assistant',
          content: message.content || '',
          tool_calls: message.tool_calls
        })

        // Execute each tool call
        for (const tc of message.tool_calls) {
          let args = {}
          try { args = JSON.parse(tc.function.arguments || '{}') } catch (_) {}

          console.log(`[research-agent] tool_call: ${tc.function.name}(${JSON.stringify(args)})`)
          const result = await executeTool(tc.function.name, args)

          tool_calls_trace.push({
            tool: tc.function.name,
            args,
            result_summary: {
              count: result.count || 0,
              source: result.source || null,
              error: result.error || null
            },
            latency_ms: result._latency_ms || 0
          })

          // Add tool result to messages
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result)
          })
        }

        // Continue loop for next LLM call
        continue
      }

      // No tool calls (or max iterations reached) → final response
      const content = message.content || ''
      const structured = extractStructured(content)

      return res.status(200).json({
        status: 'active',
        agent: 'research',
        content,
        structured,
        tool_calls_trace,
        provider: { name: config.provider, model: config.model },
        usage: data.usage || null,
      })
    }

    // Exhausted iterations without final response
    lastError = lastError || 'max_iterations_exceeded'

  } catch (e) {
    console.error('[research-agent] tool loop failed:', e.message)
    lastError = e.message
  }

  // === Fallback: direct LLM call without tools ===
  console.warn('[research-agent] falling back to direct generation:', lastError)
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS)

    // Remove tool instruction for fallback
    const fallbackPrompt = systemPrompt.replace(/# 论文检索工作流[\s\S]*$/, '')

    const fallbackMessages = [
      { role: 'system', content: fallbackPrompt },
      { role: 'user', content: userInput }
    ]

    const response = await fetch(config.chatUrl, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        model: config.model,
        messages: fallbackMessages,
        temperature: 0.6,
        max_tokens: 3000,
        stream: false,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      return res.status(502).json({
        error: 'upstream_error',
        status: response.status,
        tool_calls_trace,
      })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    const structured = extractStructured(content)

    return res.status(200).json({
      status: 'fallback',
      agent: 'research',
      content,
      structured,
      tool_calls_trace,
      fallback: true,
      fallback_reason: lastError,
      provider: { name: config.provider, model: config.model },
      usage: data.usage || null,
    })
  } catch (e) {
    return res.status(502).json({
      error: 'research_agent_failed',
      detail: e.message,
      tool_calls_trace,
    })
  }
}
