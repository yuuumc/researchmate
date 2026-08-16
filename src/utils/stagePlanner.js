// ============================================================
// Bug5 方案 A·分层+滚动 — 全周期四阶段视图 + 当前阶段指针
// 阶段指针由「诊断分区间 + 已完成周期数 + 备考剩余时间」确定性判定（后端权威）
// prompt 侧 target_stage 仅作参考，最终指针以此模块为准
// ============================================================

export const PLAN_STAGES = [
  {
    id: 'foundation',
    name: '基础巩固',
    en: 'Foundation',
    milestone: '基础知识点系统梳理，薄弱根因链底层逐层补齐',
    entry: '诊断分 < 50 或首次备考'
  },
  {
    id: 'intensive',
    name: '专题强化',
    en: 'Intensive',
    milestone: 'P0 薄弱点全面覆盖，能独立完成中等难度综合题',
    entry: '诊断分 50–74，基础已过一遍'
  },
  {
    id: 'sprint',
    name: '真题冲刺',
    en: 'Sprint',
    milestone: '真题套卷训练，时间管理与高频考点突破',
    entry: '诊断分 ≥ 75 或备考剩余 ≤ 8 周'
  },
  {
    id: 'mock',
    name: '模拟模考',
    en: 'Mock',
    milestone: '全真模拟考试，查漏补缺与心态调整',
    entry: '备考剩余 ≤ 3 周'
  }
]

const STAGE_ORDER = ['foundation', 'intensive', 'sprint', 'mock']

// 计算备考剩余周数（examDate 到 now 的整周数）
export function computeRemainingWeeks(examDate, now = new Date()) {
  if (!examDate) return null
  const d = new Date(examDate)
  if (Number.isNaN(d.getTime())) return null
  const ms = d.getTime() - now.getTime()
  if (ms < 0) return 0
  return Math.round(ms / (7 * 24 * 60 * 60 * 1000))
}

// 阶段指针判定（GWT #1：诊断分区间 + 已完成周期数 + 备孕剩余时间）
export function computeCurrentStage({ score, completedCycles = 0, remainingWeeks = null } = {}) {
  // 模考阶段：剩余 ≤ 3 周强制进入（时间最高优先级）
  if (remainingWeeks != null && remainingWeeks <= 3) return 'mock'
  // 无诊断：基础巩固
  if (score == null || typeof score !== 'number' || Number.isNaN(score)) return 'foundation'
  // 低分：基础巩固（完成 ≥3 周期仍低分则提到专题强化兜底，避免卡死）
  if (score < 50) return completedCycles >= 3 ? 'intensive' : 'foundation'
  // 时间紧迫：真题冲刺
  if (remainingWeeks != null && remainingWeeks <= 8) return 'sprint'
  // 中分段：专题强化
  if (score < 75) return 'intensive'
  // 高分 + 时间充裕：专题强化（待时间收紧自然进入冲刺）
  return 'intensive'
}

// 构建四阶段时间线（含每阶段状态：done / active / upcoming）
// 未来阶段（upcoming）仅占位：名称 + 里程碑 + 进入条件，不排周任务（GWT #4）
export function buildStageTimeline(currentStageId) {
  const idx = Math.max(0, STAGE_ORDER.indexOf(currentStageId))
  return PLAN_STAGES.map((s, i) => ({
    ...s,
    status: i < idx ? 'done' : i === idx ? 'active' : 'upcoming',
    index: i
  }))
}

// 阶段进入条件判定依据（记录到 plan.stage_entry_criteria，可追溯）
export function explainStageDecision({ score, completedCycles = 0, examDate = null } = {}) {
  const remainingWeeks = computeRemainingWeeks(examDate)
  const stage = computeCurrentStage({ score, completedCycles, remainingWeeks })
  const reasons = []
  if (score != null) reasons.push(`诊断分 ${score}`)
  else reasons.push('暂无诊断分')
  reasons.push(remainingWeeks != null ? `备考剩余约 ${remainingWeeks} 周` : '备考剩余时间未知')
  reasons.push(`已完成 ${completedCycles} 个冲刺周期`)
  return { current_stage: stage, stage_entry_criteria: reasons.join('；') }
}
