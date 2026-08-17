// ============================================================
// examGrader — 主观题 LLM-as-Judge Rubric 评分纯函数模块
// ============================================================
// 被 api/exam-grade.js（serverless）和 tests/test-f3-exam-grading.mjs 共用
// 纯函数：无 IO，不调用 LLM，只负责 prompt 构建 + 响应解析 + 校验
// ============================================================

export const GRADE_DIMENSIONS = ['correctness', 'completeness', 'logic']
export const MAX_SCORE_PER_DIMENSION = 5
export const MAX_TOTAL_SCORE = MAX_SCORE_PER_DIMENSION * GRADE_DIMENSIONS.length

const DIM_LABELS = {
  correctness: '正确性',
  completeness: '完整性',
  logic: '逻辑性',
}

/**
 * 构建 Rubric prompt（system + user）
 * @param {object} params
 * @param {string} params.question - 题干
 * @param {string} params.student_answer - 学生作答
 * @param {string} params.knowledge_point - 知识点
 * @param {number} params.max_score - 该题满分（用于换算百分比，不影响维度评分）
 * @returns {{system: string, user: string}}
 */
export function buildRubricPrompt({ question, student_answer, knowledge_point, max_score = 10 }) {
  const system = `你是一位资深集成电路考研阅卷专家。请按以下三维 Rubric 对学生主观题作答逐维评分。

# 评分维度（每维 0-5 分）

| 维度 | 满分 | 判定标准 |
|------|------|----------|
| correctness（正确性） | 5 | 核心概念、公式、结论是否正确 |
| completeness（完整性） | 5 | 关键步骤是否完整、有无遗漏关键推导 |
| logic（逻辑性） | 5 | 推理链条是否连贯、因果是否清晰 |

# 评语要求
- 每个维度给一条具体评语（指出具体缺失步骤或亮点，禁止"回答不错"类空话）
- 总评语 1-2 句，指明最大改进方向

# 输出格式（严格 JSON，禁止 markdown 代码块）
{
  "dimensions": {
    "correctness": { "score": 0-5, "comment": "具体评语" },
    "completeness": { "score": 0-5, "comment": "具体评语" },
    "logic": { "score": 0-5, "comment": "具体评语" }
  },
  "total_score": 0-15,
  "overall_comment": "总评语"
}`

  const user = `# 题目信息
知识点：${knowledge_point || '未指定'}
满分：${max_score} 分

# 题干
${question || '（无题干）'}

# 学生作答
${student_answer || '（空白作答）'}

请按 Rubric 评分。只输出 JSON。`

  return { system, user }
}

/**
 * 从 LLM 返回文本中解析评分结果
 * 容错：剥离 markdown 围栏、提取 JSON 对象、维度分数钳位 0-5
 * @param {string} content - LLM 返回的原始文本
 * @returns {object|null} 解析后的评分结果
 */
export function parseGradeResponse(content) {
  if (!content) return null
  let text = String(content).trim()

  // 剥离 markdown 代码块
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')

  // 尝试直接解析
  let obj = null
  try {
    obj = JSON.parse(text)
  } catch (_) {
    // 尝试提取第一个 JSON 对象
    const m = text.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        obj = JSON.parse(m[0])
      } catch (__) { /* fallthrough */ }
    }
  }

  if (!obj || typeof obj !== 'object') return null
  if (!obj.dimensions || typeof obj.dimensions !== 'object') return null

  // 钳位维度分数到 0-5
  const dimensions = {}
  let totalScore = 0
  for (const dim of GRADE_DIMENSIONS) {
    const d = obj.dimensions[dim]
    if (d && typeof d.score === 'number') {
      const score = Math.max(0, Math.min(MAX_SCORE_PER_DIMENSION, Math.round(d.score)))
      dimensions[dim] = {
        score,
        comment: String(d.comment || '').slice(0, 500),
      }
      totalScore += score
    } else {
      dimensions[dim] = { score: 0, comment: '维度评分缺失' }
    }
  }

  // total_score 优先用 LLM 返回值，但校验是否等于各维度之和
  const reportedTotal = typeof obj.total_score === 'number' ? obj.total_score : totalScore
  const finalTotal = reportedTotal === totalScore ? totalScore : totalScore

  return {
    dimensions,
    total_score: finalTotal,
    max_total_score: MAX_TOTAL_SCORE,
    overall_comment: String(obj.overall_comment || '').slice(0, 1000),
  }
}

/**
 * 创建"待复评"结果（GWT#4：LLM 评分超时/失败时）
 * @param {string} question - 题干（用于日志）
 * @param {string} reason - 失败原因
 * @returns {object} 标准化的待复评结果
 */
export function createPendingReview(question, reason) {
  const dimensions = {}
  for (const dim of GRADE_DIMENSIONS) {
    dimensions[dim] = { score: 0, comment: '待复评' }
  }
  return {
    dimensions,
    total_score: 0,
    max_total_score: MAX_TOTAL_SCORE,
    overall_comment: '待复评：' + (reason || 'LLM 评分超时或失败'),
    pending_review: true,
    pending_reason: reason || 'unknown',
  }
}

/**
 * 校验评分结果完整性
 * @param {object} result - parseGradeResponse 返回值
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateGradeResult(result) {
  const errors = []
  if (!result || typeof result !== 'object') {
    return { valid: false, errors: ['result is not an object'] }
  }
  if (!result.dimensions) {
    errors.push('missing dimensions')
  } else {
    for (const dim of GRADE_DIMENSIONS) {
      const d = result.dimensions[dim]
      if (!d) {
        errors.push(`missing dimension: ${dim}`)
      } else {
        if (typeof d.score !== 'number' || d.score < 0 || d.score > MAX_SCORE_PER_DIMENSION) {
          errors.push(`${dim}.score out of range: ${d.score}`)
        }
        if (!d.comment || typeof d.comment !== 'string') {
          errors.push(`${dim}.comment missing or not string`)
        }
      }
    }
  }
  if (typeof result.total_score !== 'number' || result.total_score < 0 || result.total_score > MAX_TOTAL_SCORE) {
    errors.push(`total_score out of range: ${result.total_score}`)
  }
  if (!result.overall_comment || typeof result.overall_comment !== 'string') {
    errors.push('overall_comment missing')
  }
  return { valid: errors.length === 0, errors }
}

/**
 * 锚点分类（用于契约测试）
 * @param {object} result - parseGradeResponse 返回值
 * @returns {'full'|'half'|'wrong'|'middle'|'unknown'}
 */
export function classifyAnchor(result) {
  if (!result || typeof result.total_score !== 'number') return 'unknown'
  const t = result.total_score
  if (t >= 14) return 'full'      // 满分锚点 (14-15)
  if (t >= 7 && t <= 9) return 'half'   // 半对锚点 (7-9)
  if (t <= 3) return 'wrong'      // 错误锚点 (0-3)
  return 'middle'                 // 中间区域
}
