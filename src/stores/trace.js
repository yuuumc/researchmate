// ============================================================
// Agent 工作过程追踪 Store
// ============================================================
// 用途：记录 Router → Profile → Agent → Profile Update 全过程
// 对应 v1正式版.txt §六「智能体工作过程展示」
// P0-3 新增：memory_recall 步骤（向量记忆召回）
// ============================================================

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// Agent 元信息（与 ChatWindow/TopBar 同源）
const STEP_META = {
  router: { label: 'Router 识别', en: 'Intent', color: '#1e3a5f', icon: 'R' },
  profile: { label: 'Profile 读取', en: 'Profile', color: '#7a8ba3', icon: 'P' },
  // P0-3: 记忆召回（紫色，与其他步骤区分）
  memory_recall: { label: '记忆召回', en: 'Memory', color: '#e056fd', icon: 'M' },
  tutor: { label: 'Tutor 导师', en: 'Tutor', color: '#00d4aa', icon: 'T' },
  diagnose: { label: 'Diagnose 诊断', en: 'Diagnose', color: '#4d9de0', icon: 'D' },
  planner: { label: 'Planner 规划', en: 'Planner', color: '#ffd166', icon: 'L' },
  admission: { label: 'Admission 择校', en: 'Admission', color: '#ff6b6b', icon: 'A' },
  cascade: { label: 'Cascade 级联', en: 'Cascade', color: '#9b59b6', icon: 'C' },
  research: { label: 'Research 科研', en: 'Research', color: '#e67e22', icon: 'X' },
  rag: { label: 'RAG 检索', en: 'RAG', color: '#16a085', icon: 'K' },
  profile_update: { label: 'Profile 更新', en: 'Update', color: '#7a8ba3', icon: 'U' }
}

export const useTraceStore = defineStore('trace', () => {
  // 当前会话的 trace 列表（每次 route 调用前清空）
  const traces = ref([])
  // 是否正在运行
  const running = ref(false)
  // 当前请求的概要（用于头部展示）
  const currentQuery = ref('')

  // 当前活跃的 trace（最后一个 running 状态）
  const activeTrace = computed(() => traces.value.find(t => t.status === 'running') || null)

  // 是否有 trace 数据
  const hasTraces = computed(() => traces.value.length > 0)

  // 总耗时（所有 done 状态 trace 的 duration 之和）
  const totalDuration = computed(() => {
    return traces.value
      .filter(t => t.status === 'done' && typeof t.duration === 'number')
      .reduce((sum, t) => sum + t.duration, 0)
  })

  /**
   * 开始一次新的 trace 会话
   * @param {string} query - 用户原始输入
   */
  function startSession(query) {
    traces.value = []
    currentQuery.value = query || ''
    running.value = true
  }

  /**
   * 添加一个 trace 步骤
   * @param {string} step - 步骤类型（router/profile/memory_recall/tutor/diagnose/planner/admission/cascade/research/rag/profile_update）
   * @param {string} detail - 详细信息（如「科研规划」「微电子/大二」）
   * @param {string} [status=running] - 初始状态
   * @returns {number} trace 索引，用于后续更新
   */
  function addStep(step, detail, status = 'running') {
    const meta = STEP_META[step] || { label: step, en: '', color: '#7a8ba3', icon: '?' }
    const trace = {
      id: `${step}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      step,
      label: meta.label,
      en: meta.en,
      color: meta.color,
      icon: meta.icon,
      detail: detail || '',
      status, // pending | running | done | error
      timestamp: Date.now(),
      duration: null,
      error: null
    }
    traces.value.push(trace)
    return traces.value.length - 1
  }

  /**
   * 更新某个 trace 步骤的状态
   * @param {number} index - addStep 返回的索引
   * @param {string} status - done | error | running
   * @param {object} [extra] - 额外字段（detail/error/duration）
   */
  function updateStep(index, status, extra = {}) {
    if (index < 0 || index >= traces.value.length) return
    const trace = traces.value[index]
    const now = Date.now()
    trace.status = status
    if (extra.detail !== undefined) trace.detail = extra.detail
    if (extra.error !== undefined) trace.error = extra.error
    if (status === 'done' || status === 'error') {
      trace.duration = now - trace.timestamp
    }
  }

  /**
   * 结束当前会话
   */
  function endSession() {
    running.value = false
    // 把所有 running 状态的标记为 done（兜底）
    traces.value.forEach(t => {
      if (t.status === 'running') {
        t.status = 'done'
        t.duration = t.duration || (Date.now() - t.timestamp)
      }
    })
  }

  /**
   * 清空所有 trace
   */
  function clear() {
    traces.value = []
    currentQuery.value = ''
    running.value = false
  }

  return {
    traces,
    running,
    currentQuery,
    activeTrace,
    hasTraces,
    totalDuration,
    startSession,
    addStep,
    updateStep,
    endSession,
    clear
  }
})

export { STEP_META }
