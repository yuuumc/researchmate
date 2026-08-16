// ============================================================
// A2-e 契约测试：诊断/练习去重 + P1-2 + P2-4
// ============================================================
import { gradeObjective, getCorrectedAnswer, isCorrectedQuestion, ANSWER_CORRECTIONS } from '../src/utils/grading.js'
import { calcOverlapRate, deduplicatePracticePool } from '../src/utils/practiceDedup.js'

let pass = 0, fail = 0
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅ ' + msg) }
  else { fail++; console.log('  ❌ ' + msg) }
}

// ---- P1-2: 合法选择题含「宽长比」不被 Bug4 正则误伤 ----
console.log('\n--- P1-2: 合法选择题不误伤 ---')

const legitChoiceQ = {
  id: 201,
  question_type: 'choice',
  stem: '某MOSFET的宽长比 W/L=10，沟道宽度比与跨导的关系是什么？',
  options: ['A. 宽长比越大跨导越大', 'B. 宽长比越大跨导越小', 'C. 无关', 'D. 无法确定'],
  correct_answer: 'A',
}
// P1-2: 题干含「宽长比」和「沟道宽度比」但不含 Wp/Wn → 正则不命中
const corr = ANSWER_CORRECTIONS.find(c => c.match.test(legitChoiceQ.stem))
assert(!corr, '含「宽长比」但不含 Wp/Wn 的选择题：正则不命中')
// 但这道题同时含 Wp/Wn → 会命中，检查守卫
const legitChoiceQ2 = {
  id: 202,
  question_type: 'choice',
  stem: '某MOSFET的宽长比 W/L=10，求 Wp/Wn',
  options: ['A. 1', 'B. 2.5', 'C. 3', 'D. 5'],
  correct_answer: 'A',
}
// P1-2: 命中 Wp/Wn 正则，但因为是 choice + 有 options → getCorrectedAnswer 回退到 DB 答案
const correctedAns = getCorrectedAnswer(legitChoiceQ2)
assert(correctedAns === 'A', 'choice + 有 options + 数字修正答案：getCorrectedAnswer 回退到 DB 答案 A')
assert(!isCorrectedQuestion(legitChoiceQ2), 'choice + 有 options + 数字修正答案：isCorrectedQuestion 返回 false')
// 判分正确
assert(gradeObjective(legitChoiceQ2, 'A') === true, '合法选择题作答正确选项 A → 判对')

// ---- P2-4: 单字母订正条目走选择题路径 ----
console.log('\n--- P2-4: 单字母订正走选择题路径 ---')

const cmosQ = {
  id: 301,
  question_type: 'choice',
  stem: 'CMOS反相器的阈值电压 Vth 是多少？',
  options: ['A. 1.65V', 'B. 1.75V', 'C. 2.5V', 'D. 3.3V'],
  correct_answer: 'B',  // DB 错误答案
}
// CMOS Vth 订正条目 correctAnswer='A'（单字母）
assert(!isCorrectedQuestion(cmosQ), 'CMOS Vth correctAnswer=A 单字母 → isCorrectedQuestion 返回 false')
// 走选择题路径：用户答 A → 判对（订正答案 A）
assert(gradeObjective(cmosQ, 'A') === true, 'CMOS Vth 用户答 A（订正答案）→ 判对')
// 用户答 B → 判错（DB 答案 B 是错的）
assert(gradeObjective(cmosQ, 'B') === false, 'CMOS Vth 用户答 B（DB 错误答案）→ 判错')

// ---- Bug4 回归：Wp/Wn 填空题仍走订正路径 ----
console.log('\n--- Bug4 回归：Wp/Wn 填空题 ---')

const wpWnFillQ = {
  id: 401,
  question_type: 'fill',
  stem: '已知 μn=2.5μp，求 Wp/Wn 的值',
  options: null,
  correct_answer: 'A',  // DB 误配
}
// 无 options + fill 类型 → 走订正路径
assert(isCorrectedQuestion(wpWnFillQ) === true, 'Wp/Wn 填空题无 options → isCorrectedQuestion 返回 true')
assert(getCorrectedAnswer(wpWnFillQ) === '2.5', 'Wp/Wn 填空题 → getCorrectedAnswer 返回 2.5')
assert(gradeObjective(wpWnFillQ, '2.5') === true, 'Wp/Wn 填空题作答 2.5 → 判对')
assert(gradeObjective(wpWnFillQ, 'A') === false, 'Wp/Wn 填空题作答 A → 判错')

// ---- A2-e: 重复率计算 + 去重 ----
console.log('\n--- A2-e: 去重逻辑 ---')

// 场景1: 诊断 10 题，练习 10 题全部重复 → 重复率 100%
const diagIds = Array.from({length: 10}, (_, i) => 1000 + i)
const practiceAllOverlap = diagIds.map(id => ({ id }))
assert(calcOverlapRate(practiceAllOverlap.map(q => q.id), diagIds) === 1.0, '10/10 重复 → 重复率 100%')

// 场景2: 诊断 10 题，练习 10 题中 2 题重复 → 重复率 20%
const practice2Overlap = [{id: 1000}, {id: 1001}, {id: 2000}, {id: 2001}, {id: 2002}, {id: 2003}, {id: 2004}, {id: 2005}, {id: 2006}, {id: 2007}]
assert(calcOverlapRate(practice2Overlap.map(q => q.id), diagIds) === 0.2, '2/10 重复 → 重复率 20%')

// 场景3: 去重后重复率 ≤20%
const pool = []
for (let i = 0; i < 5; i++) pool.push({ id: 1000 + i })  // 5 题与诊断重复
for (let i = 0; i < 10; i++) pool.push({ id: 5000 + i })  // 10 题不重复
const deduped = deduplicatePracticePool(pool, diagIds)
const rate = calcOverlapRate(deduped.map(q => q.id), diagIds)
assert(rate <= 0.2, '去重后重复率 ≤20%（实际: ' + (rate * 100).toFixed(0) + '%）')
assert(deduped.length >= 10, '去重后池子仍足够大（' + deduped.length + ' 题）')

// 场景4: 空诊断 → 不去重
assert(deduplicatePracticePool(pool, []).length === pool.length, '空诊断 ID → 不去重')

// 场景5: 边界 — 诊断 5 题，允许 1 题重复（floor(5*0.2)=1）
const smallDiag = [100, 101, 102, 103, 104]
const smallPool = [{id: 100}, {id: 101}, {id: 200}, {id: 201}, {id: 202}]
const smallDeduped = deduplicatePracticePool(smallPool, smallDiag)
const smallRate = calcOverlapRate(smallDeduped.map(q => q.id), smallDiag)
assert(smallRate <= 0.2, '诊断 5 题允许 1 题重复（实际重复: ' + smallDeduped.filter(q => smallDiag.includes(q.id)).length + '）')

console.log('\n========================================')
console.log(`A2-e 契约测试：${pass} pass / ${fail} fail`)
console.log('========================================')
if (fail > 0) process.exit(1)
