// ============================================================
// Agent Trace 服务（B5 架构看板数据层）
// ============================================================
// 落库 agent_traces 表（RLS owner），记录每次 Agent 调用的真实 trace。
// 与 codebase 数据层约定一致：客户端 anon key 走 RLS 鉴权，user_id 由
// supabase.auth.getUser() 取（auth.uid()），前端不手传 user_id。
// ============================================================

import { supabase } from './supabase'

// 归一化摘要：截断过长内容，避免单行过大
function summarize(value, maxLen = 500) {
  if (value == null) return ''
  const s = typeof value === 'string' ? value : JSON.stringify(value)
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s
}

/**
 * 记录一次 Agent 调用 trace（落库 agent_traces，RLS owner）
 * fire-and-forget：内部吞掉所有错误，绝不阻塞 / 影响主调用流程。
 * @param {object} p
 * @param {string} p.agent_role - diagnose/tutor/plan/practice/career/research/peer
 * @param {string} [p.action]
 * @param {*} [p.input] - 原始输入（会被摘要）
 * @param {*} [p.output] - 响应体或 content（会被摘要）
 * @param {Array}  [p.tool_calls_trace] - 工具调用数组
 * @param {object} [p.usage] - token 用量
 * @param {string} [p.status] - done / error / running
 */
export async function recordAgentTrace({ agent_role, action, input, output, tool_calls_trace, usage, status = 'done' }) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return // 未登录不落库

    const input_summary = summarize(input)

    // output 摘要：优先取 content 文本；structured / error 兜底
    let output_summary = ''
    if (output != null) {
      if (typeof output === 'string') {
        output_summary = output
      } else {
        output_summary = output.content || output.error || (output.structured ? JSON.stringify(output.structured) : '')
      }
      output_summary = summarize(output_summary, 800)
    }

    const { error } = await supabase.from('agent_traces').insert({
      user_id: user.id,
      agent_role,
      action: action || agent_role,
      input_summary,
      output_summary,
      tool_calls_trace: Array.isArray(tool_calls_trace) ? tool_calls_trace : [],
      usage: usage || null,
      status,
    })
    if (error) console.warn('[agentTrace] insert failed:', error.message)
  } catch (e) {
    console.warn('[agentTrace] recordAgentTrace error:', e?.message || e)
  }
}

/**
 * 拉取当前用户的 Agent 调用记录（RLS 自动过滤到本人）
 * @param {number} [limit=50] - 默认 50，上限 200
 * @returns {Promise<{ traces: Array } | { error: string }>}
 */
export async function fetchAgentTraces(limit = 50) {
  const clamped = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const { data, error } = await supabase
    .from('agent_traces')
    .select('id, agent_role, action, input_summary, output_summary, tool_calls_trace, usage, status, created_at')
    .order('created_at', { ascending: false })
    .limit(clamped)
  if (error) {
    return { error: error.message }
  }
  return { traces: data || [] }
}
