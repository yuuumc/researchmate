// ============================================================
// 共享判分工具（T0-1 题库答案硬伤 + T0-2 填空判定宽松化）
// ============================================================
// practice.js / diagnosisSession.js 共用，确保诊断与练习判分一致
// ============================================================

// #5 题库答案订正：已知的错误题（客户端覆盖，待 DB 修正后移除）
// T0-1 新增第 3 条：CMOS 反相器开关阈值电压（DB 答案 B=1.75V 错误，正确 A=1.65V）
export const ANSWER_CORRECTIONS = [
  { match: /金刚石.*倒格矢|倒格矢.*金刚石/, correctAnswer: 'C' },
  { match: /BCS.*(Tc|临界温度|超导转变|能隙|德拜)|超导.*(Tc|临界温度).*BCS/, correctAnswer: '24.2' },
  { match: /CMOS.*反相器.*(Vth|阈值|开关阈值|阈值电压)|(Vth|阈值|开关阈值).*CMOS.*反相器/, correctAnswer: 'A' },
  // Bug4 热修：CMOS Wp/Wn 填空题（μn=2.5μp 求 Wp/Wn）DB 误配为 choice+答案A，正确 2.5
  { match: /Wp\s*\/\s*Wn|μn[\s\S]{0,15}μp|μp[\s\S]{0,15}μn|沟道宽度比|宽长比/, correctAnswer: '2.5' },
]

/**
 * 获取订正后的正确答案（用于显示 + 判分）
 */
export function getCorrectedAnswer(question) {
  const stem = question.stem || question.question || ''
  for (const corr of ANSWER_CORRECTIONS) {
    if (corr.match.test(stem)) {
      return corr.correctAnswer
    }
  }
  return question.correct_answer != null ? String(question.correct_answer) : ''
}

/**
 * 判断题干是否命中答案订正表
 */
export function isCorrectedQuestion(question) {
  const stem = question.stem || question.question || ''
  return ANSWER_CORRECTIONS.some((c) => c.match.test(stem))
}

/**
 * 填空题文本归一化（T0-2）
 */
export function normalizeFillText(s) {
  let r = String(s).toLowerCase().replace(/\s+/g, '')
  r = r.replace(/[，。、；：！？,:;!?]/g, '')
  r = r.replace(/[·×∙⋅✕⨯]/g, '*')
  r = r.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  r = r.replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  return r
}

/**
 * 客观题判分（选择题 + 填空题）
 */
export function gradeObjective(question, userAnswer) {
  if (!userAnswer || !question.correct_answer) return false

  const correct = getCorrectedAnswer(question)
  const user = String(userAnswer).trim()

  // Bug4 热修：命中答案订正的题目一律走填空判定，避免 DB 题型/答案配置错配
  // （如 Wp/Wn 填空题被配成 choice+答案A，走字母比对会把 2.5 判错）
  if (!isCorrectedQuestion(question) && question.question_type === 'choice') {
    const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 1)
    return norm(correct) === norm(user)
  }

  const nc = normalizeFillText(correct)
  const nu = normalizeFillText(user)
  if (nc === nu) return true

  const numC = parseFloat(nc.replace(/[^0-9.\-]/g, ''))
  const numU = parseFloat(nu.replace(/[^0-9.\-]/g, ''))
  if (!isNaN(numC) && !isNaN(numU)) {
    if (Math.abs(numC - numU) <= 1) return true
    if (Math.round(numC) === Math.round(numU)) return true
  }
  return false
}
