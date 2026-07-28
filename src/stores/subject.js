// ============================================================
// 学科 Pinia store（v2.0 学科路由）
// ============================================================
// 职责：
//   1. 暴露当前学科给所有视图（不直接耦合 main.js）
//   2. 提供运行时切换能力
//   3. 监听 URL 变化自动切换
//
// 注意：
//   - 此 store 只在 main.js bootstrap 完成后才填充数据
//   - 切换学科是异步的（需重新拉教材/院校）
//   - views 不要直接调 setSubject，应通过 router push 改 URL
// ============================================================

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  loadSubjectsRegistry,
  loadSubject,
  persistSubjectChoice,
  bootstrapSubject
} from '@/utils/subjectLoader'

export const useSubjectStore = defineStore('subject', () => {
  const registry = ref([])         // 全部学科配置
  const current = ref(null)         // 当前学科完整配置
  const currentId = ref(null)       // 当前学科 id
  const loading = ref(false)        // 切换中的 loading
  const error = ref(null)           // 错误信息
  const lastSource = ref(null)      // 上次选择的来源（url/storage/env/default）

  // 是否已 bootstrap
  const isReady = computed(() => !!current.value && !!currentId.value)

  // 学科选项（用于 UI 切换器）
  const options = computed(() =>
    registry.value.map((s) => ({ id: s.id, name: s.name, description: s.description }))
  )

  /**
   * 启动期初始化（main.js 调用一次）
   */
  async function init(urlHint = null) {
    loading.value = true
    error.value = null
    try {
      registry.value = await loadSubjectsRegistry()
      const { subject, source } = await bootstrapSubject(urlHint)
      current.value = subject
      currentId.value = subject.id
      lastSource.value = source
    } catch (e) {
      error.value = e.message
      console.error('[subjectStore] init failed:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * 运行时切换学科（异步）
   * @param {string} subjectId
   * @returns {Promise<boolean>} 是否切换成功
   */
  async function switchSubject(subjectId) {
    if (!subjectId) return false
    if (subjectId === currentId.value) return true // no-op

    loading.value = true
    error.value = null
    try {
      const { subject } = await loadSubject(subjectId)
      current.value = subject
      currentId.value = subject.id
      lastSource.value = 'url' // 手动切换也视作用户显式选择
      persistSubjectChoice(subjectId)
      return true
    } catch (e) {
      error.value = e.message
      console.error('[subjectStore] switchSubject failed:', e)
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    // state
    registry,
    current,
    currentId,
    loading,
    error,
    lastSource,
    // getters
    isReady,
    options,
    // actions
    init,
    switchSubject
  }
})
