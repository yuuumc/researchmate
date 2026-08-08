// ============================================================
// Prompt Loader (v3.1) — 加载 prompt 文件 + placeholder 替换 + 数据注入
// ============================================================
// 用法：
//   import { loadPrompt, substitute, getSchoolProfile } from './prompt-loader.js'
//   const template = loadPrompt('student-employment', { compact: true })
//   const prompt = substitute(template, { target_school: '东南大学', ... })
//
// 目录结构：
//   prompts/student-employment.md        — 就业 Agent Prompt v3.1
//   prompts/student-employment.compact.md — Groq 精简版（可选，自动回退）
//   prompts/student-taoyan.md             — 教研 Agent Prompt v3.1
//   src/data/employment/school-profiles.json — 5 校 × 3 路径画像数据
// ============================================================

import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const PROMPTS_DIR = resolve(process.cwd(), 'prompts')
const DATA_DIR = resolve(process.cwd(), 'src', 'data')

const cache = new Map()
let schoolDataCache = null

/**
 * 加载 prompt 文件
 * @param {string} name — 文件名（不含 .md 后缀）
 * @param {{ compact?: boolean }} opts — compact=true 加载 .compact.md 版本
 * @returns {string|null} — prompt 内容，文件不存在返回 null
 */
export function loadPrompt(name, { compact = false } = {}) {
  const cacheKey = `${name}:${compact}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const fileName = compact ? `${name}.compact.md` : `${name}.md`
  const filePath = join(PROMPTS_DIR, fileName)

  let content = null
  if (existsSync(filePath)) {
    content = readFileSync(filePath, 'utf-8')
  } else if (compact) {
    // compact 版不存在 → 回退到标准版
    const fallbackPath = join(PROMPTS_DIR, `${name}.md`)
    if (existsSync(fallbackPath)) {
      content = readFileSync(fallbackPath, 'utf-8')
    }
  }

  if (content) cache.set(cacheKey, content)
  return content
}

/**
 * 替换 {{placeholder}} 占位符
 * 未匹配的 placeholder 替换为空字符串，避免 LLM 看到原始 {{xxx}}
 * @param {string} template — prompt 模板
 * @param {Record<string, string|number>} data — 替换数据
 * @returns {string} — 替换后的 prompt
 */
export function substitute(template, data = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (data[key] !== undefined) {
      const val = data[key]
      return Array.isArray(val) ? val.join(', ') : String(val)
    }
    return '' // 未匹配的 placeholder 替换为空字符串
  })
}

/**
 * 加载 school-profiles.json（带缓存）
 * @returns {object|null}
 */
function loadSchoolData() {
  if (schoolDataCache) return schoolDataCache
  const profilesPath = join(DATA_DIR, 'employment', 'school-profiles.json')
  if (!existsSync(profilesPath)) return null
  try {
    schoolDataCache = JSON.parse(readFileSync(profilesPath, 'utf-8'))
    return schoolDataCache
  } catch {
    return null
  }
}

/**
 * 按校名（全称或别名）获取院校就业画像
 * @param {string} schoolName — 如 "东南大学" 或 "东南"
 * @returns {object|null} — 院校画像对象
 */
export function getSchoolProfile(schoolName) {
  const data = loadSchoolData()
  if (!data) return null
  const school = data.schools?.find(
    (s) => s.school === schoolName || s.alias === schoolName
  )
  return school || null
}

/**
 * 获取 3 条就业路径元数据
 * @returns {array} — career_paths 数组
 */
export function getCareerPaths() {
  const data = loadSchoolData()
  if (!data) return []
  return data.career_paths || []
}

/**
 * 判断当前 provider 是否需要 compact 版 prompt
 * Groq 的 system prompt 上限 4K，需要精简版
 * @returns {boolean}
 */
export function shouldUseCompact() {
  const provider = (process.env.LLM_PROVIDER || 'deepseek').toLowerCase()
  return provider === 'groq'
}

/**
 * 从 LLM 输出中提取 ```json 围栏内的结构化数据
 * @param {string} content — LLM 返回的完整文本
 * @returns {object|null} — 解析出的 JSON 对象，无则 null
 */
export function extractStructured(content) {
  if (!content) return null
  // 1. ```json 围栏（优先，最可靠）
  const match = content.match(/```json\s*\n([\s\S]*?)\n```/)
  if (match) {
    try {
      return JSON.parse(match[1].trim())
    } catch {
      /* fallthrough to裸 JSON 提取 */
    }
  }
  // 2. 裸 JSON 对象提取：LLM 有时不输出围栏，直接在文本末尾输出 JSON。
  //    用平衡括号从最后一个 } 往前找匹配的 {，避免 O(n²) 逐字符缩减。
  const lastClose = content.lastIndexOf('}')
  if (lastClose === -1) return null
  let depth = 0
  let start = -1
  for (let i = lastClose; i >= 0; i--) {
    const ch = content[i]
    if (ch === '}') depth++
    else if (ch === '{') {
      depth--
      if (depth === 0) { start = i; break }
    }
  }
  if (start === -1) return null
  try {
    return JSON.parse(content.slice(start, lastClose + 1))
  } catch {
    return null
  }
}
