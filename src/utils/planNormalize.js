// ============================================================
// T1-9 后端绑定收口 — plan 结构 normalize 纯函数
// 从 src/stores/plan.js 抽出，无 @/ 别名依赖，可独立 Node 直测；
// 供 T1-7 useMasteryData 统一学情数据层直接 import 复用。
// ============================================================

// LLM 输出 stages 结构 → PlanCard 所需 weeks[]
// stages[].weekly_plans[] → weeks[]，映射 PlanCard 所需字段
export function expandStagesToWeeks(stages) {
  const weeks = []
  for (const stage of stages) {
    const plans = Array.isArray(stage.weekly_plans) ? stage.weekly_plans : []
    for (const wp of plans) {
      weeks.push({
        week: wp.week || weeks.length + 1,
        theme: stage.stage_name || stage.name || wp.goal || '',
        tasks: Array.isArray(wp.knowledge_points)
          ? wp.knowledge_points.map((k) =>
              typeof k === 'string' ? k : (k?.name || k?.topic || String(k))
            )
          : [],
        focus: stage.focus || '',
        goal: wp.goal || '',
        estimated_hours: wp.estimated_hours || null,
        exercise_count: wp.exercise_count || null,
        stage: stage.stage_name || stage.stage_id || ''
      })
    }
  }
  return weeks
}

// ============================================================
// T1-9 后端绑定收口：派生字段确定性重算（纯函数）
// weak_point_coverage[].covered_in_weeks / task_count 是派生统计，
// 不收 LLM 输出——扫描 weeks[].task_bindings 确定性重算
// （同 target_stage/stage_entry_criteria/stage_timeline 三字段的纯函数覆盖路径）
// ============================================================
export function recomputeWeakPointCoverage(weeks, weakPointCoverage) {
  if (!Array.isArray(weakPointCoverage) || weakPointCoverage.length === 0) {
    return Array.isArray(weakPointCoverage) ? weakPointCoverage : []
  }
  const wps = Array.isArray(weeks) ? weeks : []
  const acc = Object.create(null) // wp_id -> { weeks:Set, count:number }
  for (const w of wps) {
    const weekNo = Number(w?.week)
    const bindings = Array.isArray(w?.task_bindings) ? w.task_bindings : []
    for (const b of bindings) {
      const id = b?.source_weak_point_id || b?.wp_id
      if (!id) continue
      if (!acc[id]) acc[id] = { weeks: new Set(), count: 0 }
      if (Number.isFinite(weekNo)) acc[id].weeks.add(weekNo)
      acc[id].count += 1
    }
  }
  return weakPointCoverage.map((wp) => {
    const id = wp?.wp_id || wp?.id
    const stat = acc[id] || { weeks: new Set(), count: 0 }
    const coveredInWeeks = Array.from(stat.weeks).sort((a, b) => a - b)
    const taskCount = stat.count
    return {
      ...wp,
      covered_in_weeks: coveredInWeeks,
      task_count: taskCount,
      // coverage_status 同为派生字段：有 task_bindings 即 covered，否则 uncovered
      // （与 covered_in_weeks/task_count 口径一致，不收 LLM 输出避免自相矛盾）
      coverage_status: taskCount > 0 ? 'covered' : 'uncovered'
    }
  })
}

// ============================================================
// normalize：plan prompt 输出结构有两种：① 顶层 stages ② 嵌套在 s.plan.stages
// stages[].weekly_plans[] → weeks[]，映射 PlanCard 所需字段
// Bug5: 透传 target_stage（LLM 参考值，权威指针由 addPlan 计算）
// T1-9: 派生字段 covered_in_weeks / task_count 确定性重算（不收 LLM 输出）
// ============================================================
export function normalizePlanStructured(s) {
  let n = s

  // ① 已有顶层 weeks 直接用
  if (!(Array.isArray(s.weeks) && s.weeks.length > 0)) {
    // ② 嵌套在 s.plan 里（LLM 常见输出：{student_name, target_major, plan:{stages,...}, plan_reason}）
    const pf = s.plan
    if (pf && typeof pf === 'object') {
      if (Array.isArray(pf.weeks) && pf.weeks.length > 0) {
        n = { ...s, ...pf, weeks: pf.weeks }
      } else if (Array.isArray(pf.stages) && pf.stages.length > 0) {
        const weeks = expandStagesToWeeks(pf.stages)
        n = {
          ...s,
          ...pf,
          weeks,
          goal: pf.goal || s.goal || '',
          total_weeks: pf.total_weeks || weeks.length,
          adjustments: pf.adjustments || s.adjustments || { keep: [], strengthen: [], drop: [] }
        }
      }
    } else if (Array.isArray(s.stages) && s.stages.length > 0) {
      // ③ 顶层 stages
      const weeks = expandStagesToWeeks(s.stages)
      n = {
        ...s,
        weeks,
        goal: s.goal || '',
        total_weeks: s.total_weeks || weeks.length,
        adjustments: s.adjustments || { keep: [], strengthen: [], drop: [] }
      }
    }
  }

  // T1-9：派生字段确定性重算（不收 LLM 输出）
  if (Array.isArray(n.weeks) && n.weeks.length > 0 && Array.isArray(n.weak_point_coverage)) {
    n = { ...n, weak_point_coverage: recomputeWeakPointCoverage(n.weeks, n.weak_point_coverage) }
  }
  return n
}
