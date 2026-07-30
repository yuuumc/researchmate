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
 * @param {string} template — prompt 模板
 * @param {Record<string, string|number>} data — 替换数据
 * @returns {string} — 替换后的 prompt
 */
export function substitute(template, data = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? String(data[key]) : match
  })
}

/**
 * 按校名（全称或别名）获取院校就业画像
 * @param {string} schoolName — 如 "东南大学" 或 "东南"
 * @returns {object|null} — 院校画像对象
 */
export function getSchoolProfile(schoolName) {
  const profilesPath = join(DATA_DIR, 'employment', 'school-profiles.json')
  if (!existsSync(profilesPath)) return null

  try {
    const data = JSON.parse(readFileSync(profilesPath, 'utf-8'))
    const school = data.schools?.find(
      (s) => s.school === schoolName || s.alias === schoolName
    )
    return school || null
  } catch {
    return null
  }
}

/**
 * 获取 3 条就业路径元数据
 * @returns {array} — career_paths 数组
 */
export function getCareerPaths() {
  const profilesPath = join(DATA_DIR, 'employment', 'school-profiles.json')
  if (!existsSync(profilesPath)) return []

  try {
    const data = JSON.parse(readFileSync(profilesPath, 'utf-8'))
    return data.career_paths || []
  } catch {
    return []
  }
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
  const match = content.match(/```json\s*\n([\s\S]*?)\n```/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim())
  } catch {
    return null
  }
}
