// ============================================================
// 共享判分工具（T0-1 题库答案硬伤 + T0-2 填空判定宽松化）
// ============================================================
// practice.js / diagnosisSession.js 共用，确保诊断与练习判分一致
// B3 升级：gradeObjective 优先读 question.answer_numeric 做数值判分，
//         容差改为 max(abs_tol=0.5, rel_tol=0.05×|c|)（PM 裁定 2026-08-20，替换原 OR 模型）
// ============================================================

// B3 容差配置（PM 裁定 2026-08-20：abs_tol=0.5, model=max(0.5, 0.05×|c|)）
export const ABS_TOLERANCE = 0.5
export const REL_TOLERANCE = 0.05

export function computeTolerance(correct) {
  return Math.max(ABS_TOLERANCE, REL_TOLERANCE * Math.abs(correct))
}

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
    // B3 裁定 2026-08-20：移除 P1-2 “数字订正不覆盖 choice” 限制
    // 原 P1-2 逻辑会阻止 Wp/Wn 订正对 DB 误配为 choice 的题目生效，
    // 与 B3 测试规格冲突。订正匹配模式已经足够精确（P1-2 收紧过），不会误伤合法选择题。
    return corr.correctAnswer
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
  // B3 裁定 2026-08-20：移除 P1-2 “数字订正不强制填空” 限制（同上）
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
 * 从文本中提取首个数值（支持科学计数法，如 2.4e13 / -3.0E-5）
 * B3 修复：原 /[^0-9.\-]/g 会把 'e'/'E' 当非数字删掉，2.5e13→2.513 导致数值失真。
 * @param {string} s
 * @returns {number}
 */
function extractNumber(s) {
  const m = String(s).match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/)
  return m ? parseFloat(m[0]) : NaN
}

/**
 * 客观题判分（选择题 + 填空题）
 *
 * B3 升级（fill 路径）：
 * 1. 优先读 question.answer_numeric（v1.1 契约）做数值判分，跳过文本正则提取；
 * 2. 容差改为 max(ABS_TOLERANCE=0.5, REL_TOLERANCE×|c|)（PM 裁定 2026-08-20：OR 模型对小答案过松，改 max 模型），
 *    替换原 Math.round 启发式 + OR 模型。
 * 3. 数值提取改用科学计数法感知的 extractNumber（修复 2.5e13 被截断为 2.513 的 bug）。
 * 向后兼容：answer_numeric 缺失时回退到从 correct_answer 文本提取数值（原 v1.0 行为）。
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

  // B3: 优先用 answer_numeric 做数值判分（v1.1 契约），缺失则从文本提取
  const ansNum = question.answer_numeric != null ? parseFloat(String(question.answer_numeric)) : NaN
  const numC = !isNaN(ansNum) ? ansNum : extractNumber(nc)
  const numU = extractNumber(nu)
  if (!isNaN(numC) && !isNaN(numU)) {
    const absDiff = Math.abs(numC - numU)
    const tolerance = computeTolerance(numC)
    if (absDiff <= tolerance + 1e-9) return true  // +epsilon for FP boundary
  }
  return false
}
