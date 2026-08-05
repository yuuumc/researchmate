// ============================================================
// 诊断混合模式 API 客户端（W2 Step 2）
// ============================================================
import axios from 'axios'

const client = axios.create({
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000
})

/**
 * 获取主观题（LLM 生成）
 * @param {{ target_major: string, weak_points: string[], knowledge_points: any[] }} payload
 * @returns {Promise<{ status, op, questions: Array, provider: object, usage: object }>}
 */
export async function fetchSubjectiveQuestions(payload = {}) {
  const { data } = await client.post('/api/diagnosis', { op: 'subjective', payload })
  if (data.error) throw new Error('DIAGNOSIS_ERROR: ' + data.error)
  return data
}

/**
 * 提交诊断（客观题结果 + 主观题作答 → LLM 评判 → weak_points）
 * @param {{ objective_results: Array, subjective_answers: Array, profile: object, knowledge_points: any[] }} payload
 * @returns {Promise<{ status, op, content: string, structured: object, objective_stats: object, provider: object, usage: object }>}
 */
export async function gradeDiagnosis(payload = {}) {
  const { data } = await client.post('/api/diagnosis', { op: 'grade', payload })
  if (data.error) throw new Error('DIAGNOSIS_ERROR: ' + data.error)
  return data
}
