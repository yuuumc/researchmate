// ============================================================
// 复习计划 store（v2 plan_version 迭代，v3.1 接入 Agent API，v4 数据库持久化）
// ============================================================
// 数据契约：
//   currentVersion: 当前生效版本号（整数）
//   versions: [{ version, created_at, based_on_diagnosis, weeks, adjustments, completion_rate }]
// v3.1: runPlan() → POST /api/agent { action: 'plan' }
// v4 (W3-2): Supabase 持久化 — plans 表 + plan_progress 表
// ============================================================

import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'
import { callAgent } from '@/api/agent'
import { supabase, isSupabaseConfigured } from '@/services/supabase'

const STORAGE_KEY = 'plan_version'

export const usePlanStore = defineStore('plan', {
  state: () => {
    const saved = storage.get(STORAGE_KEY)
    return {
      currentVersion: saved?.currentVersion || 0,
      versions: saved?.versions || [],
      loading: false,
      error: null,
      lastPlan: null,
      // W3-2: 数据库持久化
      dbPlanId: null,
      progress: {},
      progressLoading: false
    }
  },

  getters: {
    current: (state) => state.versions.find((v) => v.version === state.currentVersion) || null,
    count: (state) => state.versions.length,
    recent3: (state) => state.versions.slice(-3),
    // W3-2: 基于进度计算完成率
    completionRate(state) {
      const plan = state.versions.find((v) => v.version === state.currentVersion)
      if (!plan?.weeks?.length) return 0
      let total = 0
      let done = 0
      for (const week of plan.weeks) {
        const tasks = week.tasks || []
        total += tasks.length
        const wn = week.week || 0
        done += (state.progress[wn] || []).length
      }
      return total > 0 ? Math.round((done / total) * 100) : 0
    }
  },

  actions: {
    persist() {
      storage.set(STORAGE_KEY, {
        currentVersion: this.currentVersion,
        versions: this.versions
      })
    },

    addPlan(plan) {
      const version = this.currentVersion + 1
      const item = {
        version,
        created_at: new Date().toISOString(),
        based_on_diagnosis: plan.based_on_diagnosis || null,
        weeks: Array.isArray(plan.weeks) ? plan.weeks : [],
        adjustments: plan.adjustments || { keep: [], strengthen: [], drop: [] },
        completion_rate: null,
        raw_plan: plan.raw_plan || ''
      }
      this.versions.push(item)
      this.currentVersion = version
      this.persist()
      return item
    },

    updateCompletionRate(version, rate) {
      const item = this.versions.find((v) => v.version === version)
      if (item) {
        item.completion_rate = rate
        this.persist()
      }
    },

    rollback(version) {
      if (this.versions.find((v) => v.version === version)) {
        this.currentVersion = version
        this.persist()
      }
    },

    clear() {
      this.versions = []
      this.currentVersion = 0
      this.dbPlanId = null
      this.progress = {}
      this.persist()
    },

    // v3.1: 调用 Agent API 生成计划
    // P0 修复：LLM 输出有波动（偶发 JSON 截断/格式变体），
    // 失败后自动退避重试 1 次再报错，大幅提升感知成功率
    async runPlan(input) {
      this.loading = true
      this.error = null
      const MAX_ATTEMPTS = 2 // 首次 + 1 次自动重试
      let lastErr = null
      try {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            return await this._runPlanOnce(input, attempt)
          } catch (e) {
            lastErr = translatePlanError(e)
            console.warn(`[plan] 第 ${attempt}/${MAX_ATTEMPTS} 次生成失败:`, lastErr.message)
            if (attempt < MAX_ATTEMPTS) {
              await new Promise((r) => setTimeout(r, 1500))
            }
          }
        }
        this.error = lastErr?.message || '计划生成失败'
        throw lastErr
      } finally {
        this.loading = false
      }
    },

    // 单次生成尝试（被 runPlan 重试包装）
    async _runPlanOnce(input, attempt = 1) {
        const res = await callAgent('plan', input)
        let s = res.structured || {}

        // P0-diag: 打印 LLM 原始返回到 Console，方便 F12 排查
        console.info('[plan] LLM raw response:', {
          content_len: (res.content || '').length,
          content_head: (res.content || '').slice(0, 200),
          content_tail: (res.content || '').slice(-200),
          structured_keys: s && typeof s === 'object' ? Object.keys(s) : null,
          has_plan_field: !!s?.plan,
          plan_keys: s?.plan ? Object.keys(s.plan) : null,
        })

        // P0 兜底：后端 extractStructured 返回 null 时，前端从 content 再 parse
        if (!s && res.content) {
          s = parseStructuredFromContent(res.content)
          if (s) console.info('[plan] 前端 fallback extract 成功, keys:', Object.keys(s))
        }

        // P0 修复：plan prompt 输出的是 stages（含 weekly_plans）结构，
        // 前端 PlanCard 需要 weeks 数组——normalize 展开后再校验
        const normalized = normalizePlanStructured(s)

        console.info('[plan] normalize result:', {
          attempt,
          weeks_count: Array.isArray(normalized.weeks) ? normalized.weeks.length : 0,
          source: s?.plan?.stages ? 'plan.stages' : (s?.stages ? 'top.stages' : (s?.weeks ? 'top.weeks' : 'none')),
        })

        // 校验：normalize 后仍无 weeks = LLM 确实没返回有效计划
        if (!Array.isArray(normalized.weeks) || normalized.weeks.length === 0) {
          console.error('[plan] weeks 为空，LLM 返回无法解析。content 全文:', res.content)
          // P0 修复：区分 LLM 拒答（prompt 引导去诊断）vs 格式异常——不再用万能文案
          const refused = /请先完成知识诊断|无法生成个性化计划/.test(res.content || '')
          throw new Error(refused
            ? 'AI 建议先完成知识诊断再生成个性化计划（也可重试生成通用计划）'
            : 'AI 返回格式异常，请重试')
        }

        this.lastPlan = {
          content: res.content || '',
          structured: res.structured || null
        }

        const planItem = this.addPlan({
          based_on_diagnosis: input.diagnosis_result || null,
          weeks: normalized.weeks,
          adjustments: normalized.adjustments || s.adjustments || { keep: [], strengthen: [], drop: [] },
          raw_plan: res.content || ''
        })

        // W3-2: 持久化到数据库（非阻塞，失败不影响 UI）
        await this.savePlanToDB(planItem)

        return this.lastPlan
    },

    // W3-2: 保存计划到 Supabase plans 表
    async savePlanToDB(planItem) {
      if (!isSupabaseConfigured) return null
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.warn('[plan] 未登录，跳过 DB 持久化')
          return null
        }

        // 停用旧计划
        await supabase
          .from('plans')
          .update({ active: false })
          .eq('user_id', user.id)

        const { data, error } = await supabase
          .from('plans')
          .insert({
            user_id: user.id,
            structured: {
              weeks: planItem.weeks,
              adjustments: planItem.adjustments,
              based_on_diagnosis: planItem.based_on_diagnosis,
              raw_plan: planItem.raw_plan,
              version: planItem.version
            },
            active: true
          })
          .select('id')
          .single()

        if (error) {
          console.warn('[plan] DB 保存失败:', error.message)
          return null
        }

        this.dbPlanId = data.id
        console.info('[plan] 计划已保存到数据库, id=', data.id)
        return data.id
      } catch (e) {
        console.warn('[plan] DB 保存异常:', e.message)
        return null
      }
    },

    // W3-2: 从数据库加载活跃计划
    async fetchActivePlan() {
      if (!isSupabaseConfigured) return null
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return null

        const { data, error } = await supabase
          .from('plans')
          .select('*')
          .eq('user_id', user.id)
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (error || !data) return null

        this.dbPlanId = data.id
        const s = data.structured || {}

        // 如果 localStorage 已有同版本计划则不重复加载
        const existing = this.versions.find(
          (v) => v.version === s.version || (v.weeks?.length === s.weeks?.length && v.created_at?.slice(0, 10) === data.created_at?.slice(0, 10))
        )
        if (!existing && s.weeks?.length) {
          this.addPlan({
            weeks: s.weeks,
            adjustments: s.adjustments || { keep: [], strengthen: [], drop: [] },
            based_on_diagnosis: s.based_on_diagnosis || null,
            raw_plan: s.raw_plan || ''
          })
        }

        await this.fetchProgress(data.id)
        return data
      } catch (e) {
        console.warn('[plan] DB 加载异常:', e.message)
        return null
      }
    },

    // W3-2: 切换任务完成状态
    async toggleTask(weekNum, taskIndex) {
      const current = this.progress[weekNum] || []
      if (current.includes(taskIndex)) {
        this.progress[weekNum] = current.filter((i) => i !== taskIndex)
      } else {
        this.progress[weekNum] = [...current, taskIndex]
      }

      if (!this.dbPlanId || !isSupabaseConfigured) return

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const completedTasks = this.progress[weekNum] || []

        // 查询是否已有进度记录
        const { data: existing } = await supabase
          .from('plan_progress')
          .select('id')
          .eq('plan_id', this.dbPlanId)
          .eq('week_num', weekNum)
          .eq('user_id', user.id)
          .maybeSingle()

        if (existing) {
          await supabase
            .from('plan_progress')
            .update({
              completed_tasks: completedTasks,
              checked_at: new Date().toISOString()
            })
            .eq('id', existing.id)
        } else {
          await supabase
            .from('plan_progress')
            .insert({
              user_id: user.id,
              plan_id: this.dbPlanId,
              week_num: weekNum,
              completed_tasks: completedTasks,
              checked_at: new Date().toISOString()
            })
        }
      } catch (e) {
        console.warn('[plan] 进度保存异常:', e.message)
      }
    },

    // W3-2: 从数据库加载进度
    async fetchProgress(planId) {
      if (!isSupabaseConfigured || !planId) return
      this.progressLoading = true
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
          .from('plan_progress')
          .select('week_num, completed_tasks')
          .eq('plan_id', planId)
          .eq('user_id', user.id)

        if (error || !data) return

        const map = {}
        for (const row of data) {
          map[row.week_num] = row.completed_tasks || []
        }
        this.progress = map
      } catch (e) {
        console.warn('[plan] 进度加载异常:', e.message)
      } finally {
        this.progressLoading = false
      }
    },

    // P0 修复：清理历史遗留的空计划版本（weeks 为空），
    // 避免旧版本 bug 产生的空壳数据导致 CURRENT PLAN 渲染空白
    pruneEmptyVersions() {
      const valid = this.versions.filter((v) => Array.isArray(v.weeks) && v.weeks.length > 0)
      if (valid.length !== this.versions.length) {
        this.versions = valid
        if (!valid.find((v) => v.version === this.currentVersion)) {
          this.currentVersion = valid.length ? valid[valid.length - 1].version : 0
        }
        this.persist()
      }
    },

    isTaskDone(weekNum, taskIndex) {
      return (this.progress[weekNum] || []).includes(taskIndex)
    }
  }
})

// ============================================================
// P0 修复：错误透传——把 axios/上游错误翻译成人话，不再有「返回内容为空」万能文案
// ============================================================
function translatePlanError(e) {
  const code = e?.response?.data?.error_code
  const status = e?.response?.status
  const MAP = {
    insufficient_balance: 'AI 服务余额不足，请联系管理员充值后重试',
    auth_failed: 'AI 服务密钥失效或无权访问，请联系管理员检查配置',
    rate_limit: '请求太频繁，请 1 分钟后重试',
    upstream_5xx: 'AI 服务暂时不可用（上游 5xx），请稍后重试',
    upstream_error: 'AI 服务暂时不可用，请稍后重试',
    bad_request: '请求参数异常，请重试',
  }
  if (code && MAP[code]) return new Error(MAP[code])
  if (status === 502) return new Error('AI 服务暂时不可用，请稍后重试')
  if (status === 403) return new Error('请求被拒绝（403），请硬刷新页面后重试')
  if (status === 429) return new Error('请求太频繁，请 1 分钟后重试')
  if (!e?.response && e?.message && /Network Error|timeout/i.test(e.message)) {
    return new Error('网络连接失败，请检查网络后重试')
  }
  // 业务错误（message 已是人话）直接透传
  return e
}

// ============================================================
// P0 兜底：前端版 extractStructured（后端 parse 失败时用）
// 1. ```json 围栏 2. 裸 JSON 平衡括号提取
// ============================================================
function parseStructuredFromContent(content) {
  if (!content) return null
  const match = content.match(/```json\s*\n([\s\S]*?)\n```/)
  if (match) {
    try { return JSON.parse(match[1].trim()) } catch { /* fallthrough */ }
  }
  const lastClose = content.lastIndexOf('}')
  if (lastClose === -1) return null
  let depth = 0, start = -1
  for (let i = lastClose; i >= 0; i--) {
    const ch = content[i]
    if (ch === '}') depth++
    else if (ch === '{') { depth--; if (depth === 0) { start = i; break } }
  }
  if (start === -1) return null
  try { return JSON.parse(content.slice(start, lastClose + 1)) } catch { return null }
}

// ============================================================
// P0 修复：plan prompt 输出 stages 结构，PlanCard 需要 weeks——normalize
// LLM 输出结构有两种：① 顶层 stages ② 嵌套在 s.plan.stages
// stages[].weekly_plans[] → weeks[]，映射 PlanCard 所需字段
// ============================================================
function expandStagesToWeeks(stages) {
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

function normalizePlanStructured(s) {
  // ① 已有顶层 weeks 直接用
  if (Array.isArray(s.weeks) && s.weeks.length > 0) return s

  // ② 嵌套在 s.plan 里（LLM 常见输出：{student_name, target_major, plan:{stages,...}, plan_reason}）
  const pf = s.plan
  if (pf && typeof pf === 'object') {
    if (Array.isArray(pf.weeks) && pf.weeks.length > 0) {
      return { ...s, ...pf, weeks: pf.weeks }
    }
    if (Array.isArray(pf.stages) && pf.stages.length > 0) {
      const weeks = expandStagesToWeeks(pf.stages)
      return {
        ...s,
        ...pf,
        weeks,
        goal: pf.goal || s.goal || '',
        total_weeks: pf.total_weeks || weeks.length,
        adjustments: pf.adjustments || s.adjustments || { keep: [], strengthen: [], drop: [] }
      }
    }
  }

  // ③ 顶层 stages
  if (Array.isArray(s.stages) && s.stages.length > 0) {
    const weeks = expandStagesToWeeks(s.stages)
    return {
      ...s,
      weeks,
      goal: s.goal || '',
      total_weeks: s.total_weeks || weeks.length,
      adjustments: s.adjustments || { keep: [], strengthen: [], drop: [] }
    }
  }

  return s
}
