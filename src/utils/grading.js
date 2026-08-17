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
  // Bug4: Wp/Wn 填空题（μn=2.5μp 求 Wp/Wn）DB 误配为 choice+答案A，正确 2.5
  // P1-2 收紧：仅匹配 "Wp/Wn" 比值记号（移除裸关键词「宽长比/沟道宽度比/μn…μp」，避免误伤合法选择题）
  { match: /Wp\s*\/\s*Wn/, correctAnswer: '2.5' },
]

/**
 * 判断题目是否有非空选项（合法选择题标志）
 */
function hasOptions(question) {
  const opts = question.options
  return Array.isArray(opts) && opts.length > 0
}

/**
 * 查找命中的订正条目
 */
function findCorrection(question) {
  const stem = question.stem || question.question || ''
  for (const corr of ANSWER_CORRECTIONS) {
    if (corr.match.test(stem)) return corr
  }
  return null
}

/**
 * 获取订正后的正确答案（用于显示 + 判分）
 * P1-2: 数字订正对带选项的合法选择题不覆盖（避免误伤）
 */
export function getCorrectedAnswer(question) {
  const corr = findCorrection(question)
  if (corr) {
    // P1-2: 数字订正（如 '2.5'）对带选项的选择题不覆盖——合法选择题用 DB 原始答案
    if (/^\d/.test(corr.correctAnswer) && question.question_type === 'choice' && hasOptions(question)) {
      // skip, fall through to DB answer
    } else {
      return corr.correctAnswer
    }
  }
  return question.correct_answer != null ? String(question.correct_answer) : ''
}

/**
 * 判断题干是否命中答案订正表（命中后强制走填空判定）
 * P2-4: 单字母订正（如 'A'）不强制填空，走选择题路径
 * P1-2: 数字订正对带选项的选择题不强制填空
 */
export function isCorrectedQuestion(question) {
  const corr = findCorrection(question)
  if (!corr) return false
  // P2-4: 单字母订正不强制填空，走选择题路径
  if (/^[A-Z]$/.test(corr.correctAnswer)) return false
  // P1-2: 数字订正对带选项的合法选择题不强制填空
  if (/^\d/.test(corr.correctAnswer) && question.question_type === 'choice' && hasOptions(question)) return false
  return true
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
  // P2-4: 单字母订正条目不强制填空，仍走选择题路径
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
