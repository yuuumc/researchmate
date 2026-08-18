// ============================================================
// Agent 工具定义 + 执行器（v1.0）
// ============================================================
// 工具：
//   1. search_papers(keywords) → OpenAlex 学术论文检索
//   2. search_questions(knowledge_point) → Supabase 题库检索
// ============================================================

import { createClient } from '@supabase/supabase-js'

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_papers',
      description: 'Search real academic papers from OpenAlex database. Returns papers with title, authors, year, venue, DOI, and citation count. Use this to find real papers for the student research direction.',
      parameters: {
        type: 'object',
        properties: {
          keywords: {
            type: 'string',
            description: 'Search keywords for academic papers, e.g. "neuromorphic computing" or "MEMS accelerometer"'
          },
          limit: {
            type: 'number',
            description: 'Max number of papers to return (default 10, max 15)'
          }
        },
        required: ['keywords']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_questions',
      description: 'Search exam questions from the question bank by knowledge point. Returns real questions with answers and explanations.',
      parameters: {
        type: 'object',
        properties: {
          knowledge_point: {
            type: 'string',
            description: 'Knowledge point to search, e.g. "MOSFET" or "PN结"'
          },
          limit: {
            type: 'number',
            description: 'Max number of questions to return (default 5)'
          }
        },
        required: ['knowledge_point']
      }
    }
  }
]

/**
 * Execute a tool call
 * @returns {Promise<object>} tool result (with _latency_ms)
 */
export async function executeTool(name, args) {
  const t0 = Date.now()
  try {
    let result
    switch (name) {
      case 'search_papers':
        result = await searchPapers(args.keywords, args.limit)
        break
      case 'search_questions':
        result = await searchQuestions(args.knowledge_point, args.limit)
        break
      default:
        result = { error: `Unknown tool: ${name}` }
    }
    return { ...result, _latency_ms: Date.now() - t0 }
  } catch (e) {
    return { error: e.message, _latency_ms: Date.now() - t0 }
  }
}

/**
 * Search papers via OpenAlex API
 * Returns: { papers: [{title, authors, year, venue, doi, citations}], count, source }
 */
async function searchPapers(keywords, limit = 10) {
  const maxLimit = Math.min(limit || 10, 15)
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(keywords)}&per_page=${maxLimit}&sort=cited_by_count:desc`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'yxt-research-agent/2.0' }
    })
    clearTimeout(timer)
    if (!r.ok) return { error: `OpenAlex HTTP ${r.status}`, papers: [] }
    const data = await r.json()
    const papers = (data.results || []).map(w => ({
      title: w.title || w.display_name || '',
      authors: (w.authorships || [])
        .slice(0, 3)
        .map(a => a.author?.display_name || '')
        .filter(Boolean)
        .join(', '),
      year: w.publication_year || null,
      venue: w.host_venue?.display_name || w.primary_location?.source?.display_name || '',
      doi: w.doi || null,
      citations: w.cited_by_count || 0
    })).filter(p => p.title)
    return { papers, count: papers.length, source: 'openalex' }
  } catch (e) {
    clearTimeout(timer)
    return { error: e.message, papers: [] }
  }
}

/**
 * Search questions from Supabase question bank
 * Returns: { questions: [...], count, source }
 */
async function searchQuestions(knowledgePoint, limit = 5) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return { error: 'Supabase not configured', questions: [] }
  }
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase
    .from('questions')
    .select('id, subject, knowledge_point, question_type, difficulty, content')
    .eq('status', 'published')
    .ilike('knowledge_point', `%${knowledgePoint}%`)
    .limit(limit || 5)
  if (error) return { error: error.message, questions: [] }
  return { questions: data || [], count: data?.length || 0, source: 'supabase' }
}
