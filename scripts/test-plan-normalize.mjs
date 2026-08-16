// T1-9 后端绑定收口 — planNormalize + stagePlanner 纯函数单测
// 独立 Node 脚本，不依赖 vitest / vite 别名，直接 import 源文件
// 运行：node scripts/test-plan-normalize.mjs
import {
  normalizePlanStructured,
  recomputeWeakPointCoverage,
  expandStagesToWeeks
} from '../src/utils/planNormalize.js'
import {
  computeCurrentStage,
  computeRemainingWeeks,
  buildStageTimeline,
  explainStageDecision,
  PLAN_STAGES
} from '../src/utils/stagePlanner.js'

let pass = 0, fail = 0, warn = 0
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, '\n    expected:', e, '\n    actual:  ', a) }
}
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, detail) }
}
function warn_(name, detail) { warn++; console.log('  ⚠', name, detail) }

// ============================================================
// xueba fixture（v2.2 实跑输出，score=82, cycles=1, exam 2026-12-21）
// ============================================================
const xueba = {
  target_stage: 'intensive',
  stage_entry_criteria: '诊断分 82；备考剩余约 18 周；已完成 1 个冲刺周期',
  stage_timeline: [
    { id: 'foundation', name: '基础巩固', status: 'done', index: 0 },
    { id: 'intensive', name: '专题强化', status: 'active', index: 1 },
    { id: 'sprint', name: '真题冲刺', status: 'upcoming', index: 2 },
    { id: 'mock', name: '模拟模考', status: 'upcoming', index: 3 }
  ],
  exam_date: '2026-12-21',
  total_weeks: 4,
  weak_point_coverage: [
    { wp_id: 'wp_01', knowledge_point: 'MOSFET 阈值电压推导', root_cause_chain: ['泊松方程', '表面势', '强反型判据', '阈值电压推导'], chain_depth: 4, priority: 'P0', covered_in_weeks: [1, 2], task_count: 6, coverage_status: 'covered' },
    { wp_id: 'wp_02', knowledge_point: 'C-V 特性', root_cause_chain: ['MOS电容结构', '积累/耗尽/反型', 'C-V特性曲线'], chain_depth: 3, priority: 'P0', covered_in_weeks: [2], task_count: 3, coverage_status: 'covered' }
  ],
  weeks: [
    { week: 1, stage: 'intensive', theme: 'P0 根因链底层补强（wp_01 泊松方程→表面势）', source_weak_point_ids: ['wp_01'], tasks: ['刘恩科 3.1-3.2 节泊松方程复习', '手绘泊松方程推导并标注边界条件', '第 3 章习题 3.1-3.5'], task_bindings: [{ task_index: 0, source_weak_point_id: 'wp_01', priority: 'P0' }, { task_index: 1, source_weak_point_id: 'wp_01', priority: 'P0' }, { task_index: 2, source_weak_point_id: 'wp_01', priority: 'P0' }], daily: ['19:00-21:00 教材', '21:00-23:00 习题'], estimated_hours: 14, exercise_count: 5 },
    { week: 2, stage: 'intensive', theme: 'P0 根因链上层 + 第二薄弱点（wp_01 强反型→阈值电压, wp_02 C-V）', source_weak_point_ids: ['wp_01', 'wp_02'], tasks: ['表面势与强反型判据推导练习', '阈值电压完整推导（含工艺参数）', 'MOS电容 C-V 特性曲线绘制与分区标注'], task_bindings: [{ task_index: 0, source_weak_point_id: 'wp_01', priority: 'P0' }, { task_index: 1, source_weak_point_id: 'wp_01', priority: 'P0' }, { task_index: 2, source_weak_point_id: 'wp_02', priority: 'P0' }], daily: ['19:00-21:00 推导', '21:00-23:00 习题'], estimated_hours: 12, exercise_count: 4 },
    { week: 3, stage: 'intensive', theme: 'P0 薄弱点综合应用 + 跨章节串联', source_weak_point_ids: ['wp_01', 'wp_02'], tasks: ['MOS结构综合题：由C-V曲线反推阈值电压', '刘恩科 5.3 节 MOSFET I-V 特性复习', 'MOSFET 跨章节综合题（C-V + I-V 联动）'], task_bindings: [{ task_index: 0, source_weak_point_id: 'wp_02', priority: 'P0' }, { task_index: 1, source_weak_point_id: 'wp_01', priority: 'P0' }, { task_index: 2, source_weak_point_id: 'wp_01', priority: 'P0' }], estimated_hours: 12, exercise_count: 4 },
    { week: 4, stage: 'intensive', theme: 'P0 薄弱点巩固 + 小结检测', source_weak_point_ids: ['wp_01', 'wp_02'], tasks: ['MOSFET 阈值电压 + C-V 特性 综合自测（限时 60 分钟）', '错题归因分析：对照根因链定位薄弱环节', '整理 MOS 结构知识点思维导图（含 4 层根因链）'], task_bindings: [{ task_index: 0, source_weak_point_id: 'wp_01', priority: 'P0' }, { task_index: 1, source_weak_point_id: 'wp_01', priority: 'P0' }, { task_index: 2, source_weak_point_id: 'wp_02', priority: 'P0' }], estimated_hours: 10, exercise_count: 3 }
  ],
  version: '2.2.0'
}

console.log('\n=== 1. recomputeWeakPointCoverage（派生字段确定性重算）===')
{
  const recomputed = recomputeWeakPointCoverage(xueba.weeks, xueba.weak_point_coverage)
  const wp01 = recomputed.find(w => w.wp_id === 'wp_01')
  const wp02 = recomputed.find(w => w.wp_id === 'wp_02')
  // 验收报告 bindings 实算：wp_01 = [1,2,3,4]/9, wp_02 = [2,3,4]/3
  eq('wp_01 covered_in_weeks 重算', wp01.covered_in_weeks, [1, 2, 3, 4])
  eq('wp_01 task_count 重算', wp01.task_count, 9)
  eq('wp_01 coverage_status', wp01.coverage_status, 'covered')
  eq('wp_02 covered_in_weeks 重算', wp02.covered_in_weeks, [2, 3, 4])
  eq('wp_02 task_count 重算', wp02.task_count, 3)
  // 非派生字段保留（knowledge_point / root_cause_chain / priority 不动）
  eq('wp_01 knowledge_point 保留', wp01.knowledge_point, 'MOSFET 阈值电压推导')
  eq('wp_01 root_cause_chain 保留', wp01.root_cause_chain, ['泊松方程', '表面势', '强反型判据', '阈值电压推导'])
  eq('wp_01 priority 保留', wp01.priority, 'P0')
  eq('wp_02 knowledge_point 保留', wp02.knowledge_point, 'C-V 特性')
}

console.log('\n=== 2. recomputeWeakPointCoverage 边界（空 / 无 bindings）===')
{
  eq('空 wpc 数组', recomputeWeakPointCoverage(xueba.weeks, []), [])
  eq('wpc 非数组', recomputeWeakPointCoverage(xueba.weeks, null), [])
  const noBind = recomputeWeakPointCoverage([], [{ wp_id: 'wp_x', priority: 'P1', coverage_status: 'covered' }])
  eq('无 bindings 的 wp task_count=0', noBind[0].task_count, 0)
  eq('无 bindings 的 wp covered_in_weeks=[]', noBind[0].covered_in_weeks, [])
  eq('无 bindings 的 wp coverage_status→uncovered', noBind[0].coverage_status, 'uncovered')
}

console.log('\n=== 3. normalizePlanStructured 路径①（顶层 weeks）+ 派生重算 ===')
{
  const n = normalizePlanStructured(xueba)
  // 路径①：weeks 直接用
  eq('weeks 保留数量', n.weeks.length, 4)
  eq('week[0].task_bindings 保留', n.weeks[0].task_bindings.length, 3)
  // 派生字段被重算（覆盖 LLM 的错误统计）
  const wp01 = n.weak_point_coverage.find(w => w.wp_id === 'wp_01')
  eq('normalize 后 wp_01 covered_in_weeks', wp01.covered_in_weeks, [1, 2, 3, 4])
  eq('normalize 后 wp_01 task_count', wp01.task_count, 9)
  // 非派生字段透传
  eq('normalize 后 version', n.version, '2.2.0')
  eq('normalize 后 target_stage 透传（LLM 参考值）', n.target_stage, 'intensive')
}

console.log('\n=== 4. normalizePlanStructured 路径③（顶层 stages 展开）===')
{
  const sStages = {
    target_stage: 'foundation',
    stages: [
      { stage_name: '基础巩固', stage_id: 'foundation', focus: '根因链底层', weekly_plans: [
        { week: 1, goal: '泊松方程', knowledge_points: ['复习3.1', '习题3.1'], estimated_hours: 10, exercise_count: 3 }
      ] }
    ],
    weak_point_coverage: [{ wp_id: 'wp_01', priority: 'P0', covered_in_weeks: [], task_count: 0, coverage_status: 'uncovered' }]
  }
  const n = normalizePlanStructured(sStages)
  eq('stages→weeks 展开数量', n.weeks.length, 1)
  eq('stages→weeks[0].tasks', n.weeks[0].tasks, ['复习3.1', '习题3.1'])
  eq('stages→weeks[0].stage', n.weeks[0].stage, '基础巩固')
  // 无 task_bindings → 派生统计保持 0
  eq('stages 路径 wpc task_count=0（无 bindings）', n.weak_point_coverage[0].task_count, 0)
}

console.log('\n=== 5. stagePlanner 纯函数（后端权威覆盖）===')
{
  const rw = computeRemainingWeeks('2026-12-21')
  ok('remainingWeeks 为正数', Number.isFinite(rw) && rw > 0, String(rw))
  // xueba: score=82, cycles=1 → intensive（#6 高分+时间充裕）
  eq('computeCurrentStage(82,1)', computeCurrentStage({ score: 82, completedCycles: 1, remainingWeeks: rw }), 'intensive')
  // zhongdeng: score=58, cycles=0 → intensive（#5 中分段）
  eq('computeCurrentStage(58,0)', computeCurrentStage({ score: 58, completedCycles: 0, remainingWeeks: rw }), 'intensive')
  // chasheng: score=35, cycles=0 → foundation（#3 低分+cycles<3）
  eq('computeCurrentStage(35,0)', computeCurrentStage({ score: 35, completedCycles: 0, remainingWeeks: rw }), 'foundation')
  // #3' 交叉：score<50 && cycles≥3 → intensive（低分兜底，先于 #4 sprint）
  eq('computeCurrentStage(40,3,≤8周)→intensive（#3先于#4）', computeCurrentStage({ score: 40, completedCycles: 3, remainingWeeks: 5 }), 'intensive')
  // #4: score≥50 && remainingWeeks≤8 → sprint
  eq('computeCurrentStage(60,0,≤8周)→sprint', computeCurrentStage({ score: 60, completedCycles: 0, remainingWeeks: 5 }), 'sprint')
  // #1: remainingWeeks≤3 → mock（时间最高优先级）
  eq('computeCurrentStage(90,5,≤3周)→mock', computeCurrentStage({ score: 90, completedCycles: 5, remainingWeeks: 2 }), 'mock')
}

console.log('\n=== 6. buildStageTimeline + explainStageDecision ===')
{
  const tl = buildStageTimeline('intensive')
  eq('timeline 长度', tl.length, 4)
  eq('foundation=done', tl[0].status, 'done')
  eq('intensive=active', tl[1].status, 'active')
  eq('sprint=upcoming', tl[2].status, 'upcoming')
  eq('mock=upcoming', tl[3].status, 'upcoming')
  eq('timeline index', tl.map(s => s.index), [0, 1, 2, 3])
  eq('timeline id 顺序', tl.map(s => s.id), ['foundation', 'intensive', 'sprint', 'mock'])
  // PLAN_STAGES 原文无漂移（milestone/entry）
  eq('foundation milestone', tl[0].milestone, '基础知识点系统梳理，薄弱根因链底层逐层补齐')
  eq('intensive entry', tl[1].entry, '诊断分 50–74，基础已过一遍')

  const d = explainStageDecision({ score: 82, completedCycles: 1, examDate: '2026-12-21' })
  eq('explain current_stage', d.current_stage, 'intensive')
  ok('explain criteria 含诊断分82', d.stage_entry_criteria.includes('诊断分 82'), d.stage_entry_criteria)
  ok('explain criteria 含已完成1个冲刺周期', d.stage_entry_criteria.includes('已完成 1 个冲刺周期'), d.stage_entry_criteria)
}

console.log('\n=== 7. week 3/4 缺 daily 字段（normalize 白名单不含，不阻塞，记录）===')
{
  const n = normalizePlanStructured(xueba)
  ok('week3 无 daily（LLM 小瑕疵，白名单不含）', !n.weeks[2].daily, '有 daily 字段则非瑕疵')
  ok('week4 无 daily', !n.weeks[3].daily)
  warn_('week3/4 缺 daily 字段', 'LLM 偶发未输出；normalize 不强制补默认值，前端按可选字段处理')
}

console.log(`\n────────\n结果：${pass} pass / ${fail} fail / ${warn} warn`)
process.exit(fail > 0 ? 1 : 0)
