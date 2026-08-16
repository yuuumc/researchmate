// ============================================================
// A2-e: 练习/诊断去重工具
// ============================================================
// 确保练习卷与诊断卷题目重复率 ≤20%（按题目 ID 集合交集 / 诊断卷题数计）
// ============================================================

/**
 * 计算练习卷与诊断卷的重复率
 * @param {Array} practiceQuestionIds - 练习题 ID 数组
 * @param {Array} diagnosisQuestionIds - 诊断题 ID 数组
 * @returns {number} 重复率 (0~1)
 */
export function calcOverlapRate(practiceQuestionIds, diagnosisQuestionIds) {
  if (!diagnosisQuestionIds || diagnosisQuestionIds.length === 0) return 0
  if (!practiceQuestionIds || practiceQuestionIds.length === 0) return 0
  const diagSet = new Set(diagnosisQuestionIds)
  const overlap = practiceQuestionIds.filter((id) => diagSet.has(id))
  return overlap.length / diagnosisQuestionIds.length
}

/**
 * 从练习题池中去除诊断题，保证重复率 ≤ maxOverlapRate
 * @param {Array} pool - 练习题池（对象数组，含 id 字段）
 * @param {Array} diagnosisQuestionIds - 诊断题 ID 数组
 * @param {number} maxOverlapRate - 最大允许重复率（默认 0.2 = 20%）
 * @returns {Array} 去重后的练习题池
 */
export function deduplicatePracticePool(pool, diagnosisQuestionIds, maxOverlapRate = 0.2) {
  if (!diagnosisQuestionIds || diagnosisQuestionIds.length === 0) return pool
  if (!pool || pool.length === 0) return pool
  const diagSet = new Set(diagnosisQuestionIds)
  const maxOverlap = Math.floor(diagnosisQuestionIds.length * maxOverlapRate)
  let overlapCount = 0
  return pool.filter((q) => {
    if (diagSet.has(q.id)) {
      if (overlapCount < maxOverlap) {
        overlapCount++
        return true
      }
      return false
    }
    return true
  })
}
