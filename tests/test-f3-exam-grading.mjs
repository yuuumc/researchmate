// ============================================================
// test-f3-exam-grading.mjs — F3 契约测试
// ============================================================
// GWT#2: Rubric prompt 构建 + 3 锚点解析（满分/半对/错误）+ 容错
// GWT#4: createPendingReview + validateGradeResult
// 运行: node tests/test-f3-exam-grading.mjs
// ============================================================

import { buildRubricPrompt, parseGradeResponse, createPendingReview, validateGradeResult, classifyAnchor, GRADE_DIMENSIONS, MAX_SCORE_PER_DIMENSION, MAX_TOTAL_SCORE } from '../src/core/examGrader.js'

let totalPass = 0
let totalFail = 0

function check(label, cond) {
  if (cond) {
    totalPass++
  } else {
    totalFail++
    console.error('  FAIL:', label)
  }
}

// ---- GWT#2: Rubric Prompt 构建 ----
console.log('\n[GWT#2] Rubric Prompt 构建')

const prompt = buildRubricPrompt({
  question: '请解释 PN 结的形成原理。',
  student_answer: 'PN 结是由 P 型和 N 型半导体接触形成的。',
  knowledge_point: 'PN结',
  max_score: 10,
})

check('prompt.system 非空', prompt.system.length > 0)
check('prompt.user 非空', prompt.user.length > 0)
check('prompt.system 包含三维 Rubric', prompt.system.includes('correctness') && prompt.system.includes('completeness') && prompt.system.includes('logic'))
check('prompt.system 包含评分标准', prompt.system.includes('0-5'))
check('prompt.user 包含题干', prompt.user.includes('PN 结的形成原理'))
check('prompt.user 包含学生作答', prompt.user.includes('P 型和 N 型半导体'))
check('prompt.user 包含知识点', prompt.user.includes('PN结'))
check('prompt.user 包含满分', prompt.user.includes('10'))

// 空作答
const promptEmpty = buildRubricPrompt({ question: '测试', student_answer: '', knowledge_point: '测试' })
check('空作答 prompt 构建成功', promptEmpty.user.includes('空白作答'))

// ---- GWT#2: 满分锚点解析 ----
console.log('\n[GWT#2] 满分锚点解析')

const fullScoreResponse = `{
  "dimensions": {
    "correctness": { "score": 5, "comment": "核心概念全部正确，PN结形成原理阐述完整" },
    "completeness": { "score": 5, "comment": "扩散运动、内电场形成、动态平衡均覆盖" },
    "logic": { "score": 5, "comment": "推导链条清晰，因果关系准确" }
  },
  "total_score": 15,
  "overall_comment": "优秀作答，概念掌握扎实。"
}`

const fullResult = parseGradeResponse(fullScoreResponse)
check('满分结果非 null', fullResult !== null)
check('满分 correctness=5', fullResult.dimensions.correctness.score === 5)
check('满分 completeness=5', fullResult.dimensions.completeness.score === 5)
check('满分 logic=5', fullResult.dimensions.logic.score === 5)
check('满分 total_score=15', fullResult.total_score === 15)
check('满分 overall_comment 非空', fullResult.overall_comment.length > 0)
check('满分 classifyAnchor=full', classifyAnchor(fullResult) === 'full')

// ---- GWT#2: 半对锚点解析 ----
console.log('\n[GWT#2] 半对锚点解析')

const halfScoreResponse = `{
  "dimensions": {
    "correctness": { "score": 3, "comment": "基本概念正确，但内电场方向描述有误" },
    "completeness": { "score": 2, "comment": "缺少动态平衡过程的描述" },
    "logic": { "score": 2, "comment": "推导跳跃，缺少中间步骤" }
  },
  "total_score": 7,
  "overall_comment": "基础概念掌握一般，需加强动态平衡和内电场理解。"
}`

const halfResult = parseGradeResponse(halfScoreResponse)
check('半对结果非 null', halfResult !== null)
check('半对 correctness=3', halfResult.dimensions.correctness.score === 3)
check('半对 completeness=2', halfResult.dimensions.completeness.score === 2)
check('半对 logic=2', halfResult.dimensions.logic.score === 2)
check('半对 total_score=7', halfResult.total_score === 7)
check('半对 classifyAnchor=half', classifyAnchor(halfResult) === 'half')

// ---- GWT#2: 错误锚点解析 ----
console.log('\n[GWT#2] 错误锚点解析')

const wrongScoreResponse = `{
  "dimensions": {
    "correctness": { "score": 1, "comment": "PN结定义错误，混淆了P型和N型半导体的掺杂" },
    "completeness": { "score": 0, "comment": "未涉及扩散运动和内电场" },
    "logic": { "score": 1, "comment": "推理缺乏逻辑连贯性" }
  },
  "total_score": 2,
  "overall_comment": "概念理解存在较大偏差，建议重新学习PN结基础。"
}`

const wrongResult = parseGradeResponse(wrongScoreResponse)
check('错误结果非 null', wrongResult !== null)
check('错误 correctness=1', wrongResult.dimensions.correctness.score === 1)
check('错误 completeness=0', wrongResult.dimensions.completeness.score === 0)
check('错误 logic=1', wrongResult.dimensions.logic.score === 1)
check('错误 total_score=2', wrongResult.total_score === 2)
check('错误 classifyAnchor=wrong', classifyAnchor(wrongResult) === 'wrong')

// ---- 容错解析 ----
console.log('\n[容错] Markdown 围栏 + 非法 JSON')

const markdownWrapped = '```json\n{"dimensions":{"correctness":{"score":4,"comment":"good"},"completeness":{"score":3,"comment":"missing step"},"logic":{"score":4,"comment":"clear"}},"total_score":11,"overall_comment":"decent"}\n```'
const mdResult = parseGradeResponse(markdownWrapped)
check('markdown 围栏解析成功', mdResult !== null)
check('md total_score=11', mdResult.total_score === 11)

const garbageInput = 'this is not json at all'
const garbageResult = parseGradeResponse(garbageInput)
check('垃圾输入返回 null', garbageResult === null)

const emptyInput = ''
const emptyResult = parseGradeResponse(emptyInput)
check('空输入返回 null', emptyResult === null)

// 分数钳位
const overScoreResponse = `{"dimensions":{"correctness":{"score":8,"comment":"x"},"completeness":{"score":7,"comment":"y"},"logic":{"score":6,"comment":"z"}},"total_score":15,"overall_comment":"ok"}`
const overResult = parseGradeResponse(overScoreResponse)
check('分数钳位 correctness=5', overResult.dimensions.correctness.score === 5)
check('分数钳位 completeness=5', overResult.dimensions.completeness.score === 5)
check('分数钳位 logic=5', overResult.dimensions.logic.score === 5)

// 缺失维度
const missingDimResponse = `{"dimensions":{"correctness":{"score":3,"comment":"ok"}},"total_score":3,"overall_comment":"partial"}`
const missingResult = parseGradeResponse(missingDimResponse)
check('缺失维度 completeness=0', missingResult.dimensions.completeness.score === 0)
check('缺失维度 logic=0', missingResult.dimensions.logic.score === 0)

// total_score 与各维度之和不一致时用维度之和
const mismatchResponse = `{"dimensions":{"correctness":{"score":5,"comment":"a"},"completeness":{"score":5,"comment":"b"},"logic":{"score":5,"comment":"c"}},"total_score":10,"overall_comment":"mismatch"}`
const mismatchResult = parseGradeResponse(mismatchResponse)
check('total 不一致时用维度之和=15', mismatchResult.total_score === 15)

// ---- GWT#4: createPendingReview ----
console.log('\n[GWT#4] createPendingReview')

const pending = createPendingReview('测试题干', 'timeout')
check('pending_review=true', pending.pending_review === true)
check('pending_reason=timeout', pending.pending_reason === 'timeout')
check('pending total_score=0', pending.total_score === 0)
check('pending correctness.score=0', pending.dimensions.correctness.score === 0)
check('pending completeness.score=0', pending.dimensions.completeness.score === 0)
check('pending logic.score=0', pending.dimensions.logic.score === 0)
check('pending overall_comment 包含原因', pending.overall_comment.includes('timeout'))

const pendingNoReason = createPendingReview('题', null)
check('pending 无原因默认 unknown', pendingNoReason.pending_reason === 'unknown')

// ---- validateGradeResult ----
console.log('\n[校验] validateGradeResult')

const validResult = {
  dimensions: {
    correctness: { score: 4, comment: 'good' },
    completeness: { score: 3, comment: 'missing step' },
    logic: { score: 4, comment: 'clear' },
  },
  total_score: 11,
  overall_comment: 'decent attempt',
}
const validCheck = validateGradeResult(validResult)
check('valid result passes', validCheck.valid === true)
check('valid result no errors', validCheck.errors.length === 0)

const invalidResult = {
  dimensions: { correctness: { score: 4 } },
  total_score: 99,
}
const invalidCheck = validateGradeResult(invalidResult)
check('invalid result fails', invalidCheck.valid === false)
check('invalid result has errors', invalidCheck.errors.length > 0)

const nullCheck = validateGradeResult(null)
check('null result fails', nullCheck.valid === false)

// ---- 常量 ----
console.log('\n[常量] GRADE_DIMENSIONS / MAX_SCORE')

check('GRADE_DIMENSIONS 长度=3', GRADE_DIMENSIONS.length === 3)
check('GRADE_DIMENSIONS 包含 correctness', GRADE_DIMENSIONS.includes('correctness'))
check('GRADE_DIMENSIONS 包含 completeness', GRADE_DIMENSIONS.includes('completeness'))
check('GRADE_DIMENSIONS 包含 logic', GRADE_DIMENSIONS.includes('logic'))
check('MAX_SCORE_PER_DIMENSION=5', MAX_SCORE_PER_DIMENSION === 5)
check('MAX_TOTAL_SCORE=15', MAX_TOTAL_SCORE === 15)

// ---- classifyAnchor 边界 ----
console.log('\n[分类] classifyAnchor 边界')

check('score=14 → full', classifyAnchor({ total_score: 14 }) === 'full')
check('score=15 → full', classifyAnchor({ total_score: 15 }) === 'full')
check('score=7 → half', classifyAnchor({ total_score: 7 }) === 'half')
check('score=8 → half', classifyAnchor({ total_score: 8 }) === 'half')
check('score=9 → half', classifyAnchor({ total_score: 9 }) === 'half')
check('score=0 → wrong', classifyAnchor({ total_score: 0 }) === 'wrong')
check('score=3 → wrong', classifyAnchor({ total_score: 3 }) === 'wrong')
check('score=10 → middle', classifyAnchor({ total_score: 10 }) === 'middle')
check('score=5 → middle', classifyAnchor({ total_score: 5 }) === 'middle')
check('score=undefined → unknown', classifyAnchor({}) === 'unknown')

// ---- 总结 ----
console.log('\n========================================')
console.log(`F3 Exam Grading Tests: ${totalPass} passed, ${totalFail} failed`)
console.log('========================================')
if (totalFail > 0) {
  process.exit(1)
}
