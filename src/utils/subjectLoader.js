// ============================================================
// 学科运行时加载器（v2.0 学科路由）
// ============================================================
// 职责：
//   1. 运行时拉取 /knowledge/subjects.json 学科注册表
//   2. 加载指定学科的教材 / 图谱 / 院校数据
//   3. 注入到对应 Agent（tutor / admission）
//   4. 持久化用户选择到 localStorage
//
// 优先级（决定当前学科）：
//   1. URL 参数 ?subject=cs（一次性，覆盖后写 localStorage）
//   2. localStorage 持久化的用户偏好
//   3. import.meta.env.VITE_SUBJECT（构建期默认，向后兼容）
//   4. 注册表第一项
//
// 切换成本（v2 验收）：
//   - 新增学科：上传 JSON + 在 subjects.json 加一条 + ?subject=xxx
//   - 不再需要：改 .env / 重新 build
// ============================================================

import { setKnowledgeBase, setKnowledgeGraph } from '@/core/agents/tutor'
import { setUniversityData } from '@/core/agents/admission'
import { storage } from '@/utils/storage'

const SUBJECTS_REGISTRY_URL = '/knowledge/subjects.json'
const STORAGE_KEY = 'subject_current'

// 内存缓存（避免重复拉注册表）
let _registryCache = null
let _registryPromise = null

// 当前已加载的学科 id（防止重复注入）
let _currentSubjectId = null

/**
 * 读取学科注册表（带内存缓存）
 * @returns {Promise<Array>} subjects
 */
export async function loadSubjectsRegistry() {
  if (_registryCache) return _registryCache
  if (_registryPromise) return _registryPromise
  _registryPromise = fetch(SUBJECTS_REGISTRY_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`subjects.json HTTP ${r.status}`)
      return r.json()
    })
    .then((arr) => {
      if (!Array.isArray(arr) || arr.length === 0) {
        throw new Error('subjects.json 必须是非空数组')
      }
      _registryCache = arr
      return arr
    })
    .catch((e) => {
      console.error('[subjectLoader] 注册表拉取失败:', e.message)
      _registryPromise = null // 允许重试
      throw e
    })
  return _registryPromise
}

/**
 * 决定当前应使用的学科 id（按优先级）
 * @param {string|null} urlSubjectHint - 调用方传入的 URL 参数（可选）
 * @returns {{id: string, source: 'url'|'storage'|'env'|'default'}}
 */
export function resolveSubjectId(urlSubjectHint = null) {
  // 1. URL 参数（最高优先级）
  if (urlSubjectHint && typeof urlSubjectHint === 'string') {
    return { id: urlSubjectHint.toLowerCase(), source: 'url' }
  }
  // 2. localStorage 持久化
  const stored = storage.get(STORAGE_KEY)
  if (stored && typeof stored === 'string') {
    return { id: stored, source: 'storage' }
  }
  // 3. 构建期默认（向后兼容）
  const envDefault = import.meta.env.VITE_SUBJECT
  if (envDefault && typeof envDefault === 'string') {
    return { id: envDefault.toLowerCase(), source: 'env' }
  }
  // 4. 兜底（注册表第一项，调用方负责校验存在性）
  return { id: null, source: 'default' }
}

/**
 * 校验学科 id 是否在注册表中
 */
export async function isValidSubject(id) {
  if (!id) return false
  const registry = await loadSubjectsRegistry()
  return registry.some((s) => s.id === id)
}

/**
 * 加载指定学科的全部数据 + 注入 Agent
 * @param {string} subjectId
 * @returns {Promise<{subject: object, stats: object}>}
 */
export async function loadSubject(subjectId) {
  const registry = await loadSubjectsRegistry()
  const config = registry.find((s) => s.id === subjectId)
  if (!config) {
    throw new Error(`[subjectLoader] 学科 "${subjectId}" 不在注册表中（${registry.length} 个候选）`)
  }

  const stats = { textbook: 0, university: 0, graph: 0 }

  // 教材（必填）
  try {
    const r = await fetch(config.textbookPath)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const textbook = await r.json()
    setKnowledgeBase(textbook)
    stats.textbook = textbook.length
  } catch (e) {
    console.error(`[subjectLoader] 教材加载失败 (${config.textbookPath}):`, e.message)
    setKnowledgeBase([])
  }

  // 院校（必填）
  try {
    const r = await fetch(config.universityPath)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const univ = await r.json()
    setUniversityData(univ)
    stats.university = univ.length
  } catch (e) {
    console.error(`[subjectLoader] 院校加载失败 (${config.universityPath}):`, e.message)
    setUniversityData([])
  }

  // 知识图谱（可选，缺失降级为纯 RAG）
  if (config.graphPath) {
    try {
      const r = await fetch(config.graphPath)
      if (r.ok) {
        const graphData = await r.json()
        setKnowledgeGraph(config.graphSubject, graphData)
        stats.graph = graphData.nodes?.length || 0
      } else {
        console.warn(`[subjectLoader] 图谱 HTTP ${r.status}，降级为纯 RAG`)
        setKnowledgeGraph(config.graphSubject, null)
      }
    } catch (e) {
      console.warn(`[subjectLoader] 图谱加载失败，降级为纯 RAG：`, e.message)
      setKnowledgeGraph(config.graphSubject, null)
    }
  } else {
    setKnowledgeGraph(config.graphSubject, null)
  }

  _currentSubjectId = subjectId
  return { subject: config, stats }
}

/**
 * 获取当前已加载的学科 id（用于 onMounted 检查）
 */
export function getCurrentSubjectId() {
  return _currentSubjectId
}

/**
 * 持久化用户学科选择
 */
export function persistSubjectChoice(subjectId) {
  if (!subjectId) return
  storage.set(STORAGE_KEY, subjectId)
}

/**
 * 启动期：决定 + 加载 + 持久化（一体化入口）
 * @param {string|null} urlSubjectHint - URL query 传入的 subject
 * @returns {Promise<{subject: object, stats: object, source: string}>}
 */
export async function bootstrapSubject(urlSubjectHint = null) {
  const { id: candidateId, source } = resolveSubjectId(urlSubjectHint)

  // 加载注册表（若 ID 来自 url/storage/env，需校验其存在性）
  const registry = await loadSubjectsRegistry()
  let finalId = candidateId
  if (!finalId || !registry.some((s) => s.id === finalId)) {
    // 降级到注册表第一项
    finalId = registry[0].id
    console.warn(
      `[subjectLoader] 候选学科 "${candidateId}" 不存在，fallback 到 "${finalId}"`
    )
  }

  // URL 传入 → 持久化（仅当 URL 是显式来源时覆盖 storage）
  if (source === 'url') {
    persistSubjectChoice(finalId)
  } else if (source === 'default') {
    // 默认来源不写 storage（避免污染用户偏好）
  } else if (source === 'env' || source === 'storage') {
    // 环境变量/已有 storage → 持久化（保证下次启动一致）
    persistSubjectChoice(finalId)
  }

  const result = await loadSubject(finalId)
  return { ...result, source }
}
