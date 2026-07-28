// ============================================================
// Prompt 加载器 v2 (Vite ?raw 后缀导入 .md 文件)
// ============================================================
// 职责：
//   1. 从 prompts-manifest.json 读取版本与灰度配置
//   2. 加载对应 agent × audience × version 的 .md 文件
//   3. 渲染模板变量（{{student_id}} {{class_id}} 等）
//   4. 返回最终 prompt 字符串 + 元数据（audience / version / sha）
// ============================================================
//
// 用法：
//   import { getPrompt } from '@/prompts/loader'
//
//   const { prompt, meta } = await getPrompt('tutor', {
//     audience: 'student',
//     version: '2.0.0',  // 可选，省略则用 manifest.active
//     vars: { student_id: 'stu_abc', profile_context: '...' }
//   })
// ============================================================

import manifest from './prompts-manifest.json'
import tutorStudentV1 from './tutor.md?raw'
import diagnoseStudentV1 from './diagnose.md?raw'
import plannerStudentV1 from './planner.md?raw'
import admissionStudentV1 from './admission.md?raw'
import researchStudentV1 from './research.md?raw'

// v2.0 prompts (5 agents × 2 audiences = 10 files)
import tutorStudentV2 from './v2/tutor/student.md?raw'
import tutorTeacherV2 from './v2/tutor/teacher.md?raw'
import diagnoseStudentV2 from './v2/diagnose/student.md?raw'
import diagnoseTeacherV2 from './v2/diagnose/teacher.md?raw'
import plannerStudentV2 from './v2/planner/student.md?raw'
import plannerTeacherV2 from './v2/planner/teacher.md?raw'
import admissionStudentV2 from './v2/admission/student.md?raw'
import admissionTeacherV2 from './v2/admission/teacher.md?raw'
import researchStudentV2 from './v2/research/student.md?raw'
import researchTeacherV2 from './v2/research/teacher.md?raw'

// 内置 prompt registry (file path → raw content)
const REGISTRY = {
  // v1 baseline
  'src/prompts/tutor.md': tutorStudentV1,
  'src/prompts/diagnose.md': diagnoseStudentV1,
  'src/prompts/planner.md': plannerStudentV1,
  'src/prompts/admission.md': admissionStudentV1,
  'src/prompts/research.md': researchStudentV1,
  // v2 multi-user
  'src/prompts/v2/tutor/student.md': tutorStudentV2,
  'src/prompts/v2/tutor/teacher.md': tutorTeacherV2,
  'src/prompts/v2/diagnose/student.md': diagnoseStudentV2,
  'src/prompts/v2/diagnose/teacher.md': diagnoseTeacherV2,
  'src/prompts/v2/planner/student.md': plannerStudentV2,
  'src/prompts/v2/planner/teacher.md': plannerTeacherV2,
  'src/prompts/v2/admission/student.md': admissionStudentV2,
  'src/prompts/v2/admission/teacher.md': admissionTeacherV2,
  'src/prompts/v2/research/student.md': researchStudentV2,
  'src/prompts/v2/research/teacher.md': researchTeacherV2
}

const VALID_AGENTS = ['tutor', 'diagnose', 'planner', 'admission', 'research']
const VALID_AUDIENCES = ['student', 'teacher']

/**
 * 计算 prompt 的 sha256（用于审计追溯 + v1.5 promptSanitize 复用）
 */
async function sha256(text) {
  const enc = new TextEncoder().encode(text)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 渲染模板变量（{{varName}} → 实际值）
 * 缺失变量 → 保留原占位符 + 输出 warn（不抛错）
 */
function renderVars(template, vars = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in vars) return vars[key]
    console.warn(`[prompt-loader] missing var: ${key}`)
    return match
  })
}

/**
 * 灰度切流：基于 hash(student_id + agent) 决定是否走新版本
 * traffic=1.0 → 100% 走 active 版本
 * traffic=0.5 → 50% 走 active，50% 走 v1 baseline
 */
function pickVersion(agent, audience, traffic, salt) {
  // traffic=0 → 全部走 v1 baseline
  if (traffic <= 0) {
    return manifest.agents[agent].v1_baseline
  }
  // traffic=1 → 全部走 active
  if (traffic >= 1) {
    return manifest.agents[agent].v2[audience].active
  }
  // 灰度：基于 salt 哈希
  let hash = 0
  for (let i = 0; i < salt.length; i++) {
    hash = (hash << 5) - hash + salt.charCodeAt(i)
    hash |= 0
  }
  const bucket = Math.abs(hash) % 1000 / 1000 // 0-1
  if (bucket < traffic) {
    return manifest.agents[agent].v2[audience].active
  }
  return manifest.agents[agent].v1_baseline
}

/**
 * 加载并渲染 Prompt
 * @param {string} agent - 'tutor' | 'diagnose' | 'planner' | 'admission' | 'research'
 * @param {object} options
 * @param {'student'|'teacher'} [options.audience='student']
 * @param {string} [options.version] - 显式指定版本（绕过灰度）
 * @param {string} [options.salt] - 灰度切流的 salt（默认用 student_id 或 teacher_id）
 * @param {object} [options.vars={}] - 模板变量
 * @returns {Promise<{prompt: string, meta: object}>}
 */
export async function getPrompt(agent, options = {}) {
  if (!VALID_AGENTS.includes(agent)) {
    throw new Error(`[prompt-loader] invalid agent: ${agent}`)
  }

  const audience = options.audience || manifest.default_audience || 'student'
  if (!VALID_AUDIENCES.includes(audience)) {
    throw new Error(`[prompt-loader] invalid audience: ${audience}`)
  }

  const agentCfg = manifest.agents[agent]
  if (!agentCfg) {
    throw new Error(`[prompt-loader] agent not in manifest: ${agent}`)
  }

  // 1. 确定使用哪个版本
  let version
  if (options.version) {
    // 显式指定：必须存在于 manifest
    if (options.version === agentCfg.v1_baseline) {
      version = agentCfg.v1_baseline
    } else if (
      agentCfg.v2[audience] &&
      agentCfg.v2[audience].versions[options.version]
    ) {
      version = options.version
    } else {
      throw new Error(
        `[prompt-loader] version not found: ${agent}/${audience}/${options.version}`
      )
    }
  } else {
    // 自动选：按 traffic 灰度
    const activeV2 = agentCfg.v2[audience]?.active
    if (!activeV2) {
      throw new Error(`[prompt-loader] no v2 active for ${agent}/${audience}`)
    }
    const traffic = agentCfg.v2[audience].versions[activeV2]?.traffic ?? 1
    const salt = options.salt || options.vars?.student_id || options.vars?.teacher_id || 'default'
    version = pickVersion(agent, audience, traffic, salt)
  }

  // 2. 查 file path
  let filePath
  if (version === agentCfg.v1_baseline) {
    filePath = `src/prompts/${agent}.md`
  } else {
    filePath = agentCfg.v2[audience].versions[version]?.file
    if (!filePath) {
      throw new Error(`[prompt-loader] file path missing for ${agent}/${audience}/${version}`)
    }
  }

  // 3. 加载并渲染
  const raw = REGISTRY[filePath]
  if (!raw) {
    throw new Error(`[prompt-loader] file not in REGISTRY: ${filePath}`)
  }
  const prompt = renderVars(raw, options.vars || {})
  const sha = await sha256(raw)

  return {
    prompt,
    meta: {
      agent,
      audience,
      version,
      file: filePath,
      sha,
      traffic:
        version === agentCfg.v1_baseline
          ? 0
          : agentCfg.v2[audience].versions[version]?.traffic ?? 1,
      rendered_at: new Date().toISOString(),
      vars_used: Object.keys(options.vars || {})
    }
  }
}

/**
 * 批量加载 5 Agent 的当前 active 版本（用于回归测试 / 启动时校验）
 * @param {object} options - 透传给 getPrompt
 * @returns {Promise<{[agent: string]: {prompt: string, meta: object}}>}
 */
export async function getAllActivePrompts(options = {}) {
  const results = {}
  for (const agent of VALID_AGENTS) {
    results[agent] = {}
    for (const audience of VALID_AUDIENCES) {
      try {
        results[agent][audience] = await getPrompt(agent, { ...options, audience })
      } catch (e) {
        results[agent][audience] = { error: e.message }
      }
    }
  }
  return results
}

/**
 * 列出 manifest 中所有可用版本（用于版本管理 UI / 灰度面板）
 */
export function listAvailableVersions() {
  const list = []
  for (const agent of VALID_AGENTS) {
    const agentCfg = manifest.agents[agent]
    list.push({
      agent,
      audience: 'baseline',
      version: agentCfg.v1_baseline,
      file: `src/prompts/${agent}.md`
    })
    for (const audience of VALID_AUDIENCES) {
      const versions = agentCfg.v2?.[audience]?.versions || {}
      for (const [v, info] of Object.entries(versions)) {
        list.push({
          agent,
          audience,
          version: v,
          file: info.file,
          traffic: info.traffic,
          active: agentCfg.v2[audience].active === v,
          changelog: info.changelog,
          created_at: info.created_at
        })
      }
    }
  }
  return list
}

export { manifest }
export default getPrompt
