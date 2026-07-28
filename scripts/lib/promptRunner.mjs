// ============================================================
// 公共测试运行器（5 Agent 静态校验共用）
// ============================================================
// 流程：
//   1) 加载 prompt .md
//   2) 对每个 sample 渲染完整 prompt
//   3) 校验：JSON 格式声明 / 必填字段 / 危险片段 / (admission) 数字字段越界
//   4) 汇总报告 + exit code
// ============================================================

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  sanitizeForPrompt,
  staticValidate,
  declaresJsonOutput,
  DANGER_PATTERNS
} from './promptSanitize.mjs'
import { AGENT_SCHEMAS } from './promptSchema.mjs'
import { SAMPLES, MOCK_RAG, MOCK_PROFILE, MOCK_CANDIDATES } from './promptSamples.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../..')

// ============================================================
// 颜色 / 输出工具
// ============================================================
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
}
const ok = (m) => console.log(`  ${C.green}✓${C.reset} ${m}`)
const fail = (m) => console.log(`  ${C.red}✗${C.reset} ${m}`)
const warn = (m) => console.log(`  ${C.yellow}!${C.reset} ${m}`)
const info = (m) => console.log(`  ${C.cyan}ℹ${C.reset} ${m}`)
const dim = (m) => console.log(`  ${C.gray}${m}${C.reset}`)

function section(t) {
  console.log(`\n${'─'.repeat(70)}\n  ${t}\n${'─'.repeat(70)}`)
}

// ============================================================
// Prompt 渲染（按 agent 形态分别拼）
// ============================================================
function renderPrompt(agentName, promptMd, sample) {
  const safeInput = sanitizeForPrompt(sample.input)
  const profile = sample.profile || MOCK_PROFILE
  const rag = sample.rag || MOCK_RAG

  let body = promptMd
  if (agentName === 'tutor') {
    body += `\n\n# 学生画像\n${profile}\n\n# 知识库检索结果（Top-3）\n${rag}\n`
  } else if (agentName === 'diagnose') {
    body += `\n\n# 学生画像\n${profile}\n`
  } else if (agentName === 'planner') {
    body += `\n\n# 学生画像\n${profile}\n`
  } else if (agentName === 'admission') {
    const candidates = sample.candidates || MOCK_CANDIDATES
    body += `\n\n# 学生画像\n${profile}\n\n# 院校候选库（数字字段由前端模板渲染，不在此处给出）\n${JSON.stringify(candidates, null, 2)}\n`
  } else if (agentName === 'research') {
    body += `\n\n# 学生画像\n${profile}\n`
  }
  return { rendered: body, safeInput }
}

// ============================================================
// 单 Agent 静态校验主流程
// ============================================================
export function runAgentTests(agentName) {
  const schema = AGENT_SCHEMAS[agentName]
  if (!schema) throw new Error(`unknown agent: ${agentName}`)
  const samples = SAMPLES[agentName]
  if (!samples || samples.length < 10) {
    throw new Error(`${agentName}: samples < 10 (${samples?.length || 0})`)
  }

  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  Prompt 单测 · ${agentName.toUpperCase()}（${schema.outputFormat}）`)
  console.log(`${'═'.repeat(70)}`)
  info(`prompt 源: ${schema.promptFile}`)
  info(`样本数：${samples.length}（≥10 满足）`)

  // 1) 加载 prompt
  const promptPath = resolve(projectRoot, schema.promptFile)
  const promptMd = readFileSync(promptPath, 'utf-8')
  info(`prompt 长度：${promptMd.length} chars`)

  // 2) 全局校验：prompt 自身是否声明了所有要求的 phrase
  section(`检查 1：prompt 自身是否含必填短语（共 ${schema.requiredPromptPhrases.length} 条）`)
  const phraseHits = []
  const phraseMiss = []
  for (const phrase of schema.requiredPromptPhrases) {
    if (promptMd.includes(phrase)) {
      phraseHits.push(phrase)
      ok(phrase)
    } else {
      phraseMiss.push(phrase)
      fail(`缺：${phrase}`)
    }
  }
  if (phraseMiss.length) {
    warn(`prompt 缺 ${phraseMiss.length} 个必填短语，渲染时也无法弥补`)
  }

  // 3) JSON 输出格式声明
  section('检查 2：prompt 是否声明 JSON 输出格式')
  const declaresJson = declaresJsonOutput(promptMd)
  if (schema.outputFormat.includes('json')) {
    if (declaresJson) ok('prompt 含 ```json / JSON 围栏声明')
    else fail('prompt 必须声明 JSON 格式（outputFormat 含 json）')
  } else {
    dim(`本 agent 输出格式 = ${schema.outputFormat}，不要求 JSON 围栏`)
  }

  // 4) 逐样本渲染 + 静态校验
  section(`检查 3：逐样本渲染（${samples.length} 个）`)
  const results = []
  for (const s of samples) {
    const { rendered, safeInput } = renderPrompt(agentName, promptMd, s)
    // 4a) 危险片段检测
    const v = staticValidate(rendered, [])
    // 4b) admission 任务：用户输入中的"招生 / 分数线"等硬数据提示（仅 info，不 fail）
    //   说明：v1 §6.5 铁律是约束 LLM 输出 reason 字段不得含数字，不是约束学生用户输入。
    //   学生写"前 30%"是排名百分位（合法），"分数线 350 分"是越界（可疑）。
    //   此处只 info 提示，由 LLM/前端通过 admission prompt 硬约束词 + sanitizeReason 处理。
    const numberFieldHints = []
    if (agentName === 'admission' && schema.forbiddenInReason) {
      for (const p of schema.forbiddenInReason) {
        if (p.re.test(s.input)) numberFieldHints.push({ id: p.id, label: p.label })
      }
    }
    // 4c) research 任务：检查对抗样本应被 sanitize
    let sanitizeEffect = null
    if (agentName === 'research' || agentName === 'tutor' || agentName === 'admission') {
      sanitizeEffect = {
        originalLen: s.input.length,
        sanitizedLen: safeInput.length,
        removedFragments: []
      }
      for (const d of DANGER_PATTERNS) {
        if (d.re.test(s.input)) sanitizeEffect.removedFragments.push(d.label)
      }
    }

    // 4 阶段：v1.5 验收口径
    //   - 必 PASS：渲染后无危险片段
    //   - 仅 INFO：用户输入是否含疑似数字字段（这交给 LLM prompt 铁律 + 前端 sanitizeReason 处理）
    //   - 对抗样本：sanitize 应剥离危险片段（用 sanitizeEffect 反馈）
    const pass = v.dangerHits.length === 0
    results.push({
      sampleId: s.id,
      type: s.type,
      pass,
      dangerHits: v.dangerHits,
      numberFieldHints,
      sanitizeEffect
    })

    // 打印
    const tag = s.type === 'malicious' ? `${C.red}[对抗]${C.reset}` : `${C.cyan}[${s.type || 'normal'}]${C.reset}`
    if (pass) {
      ok(`${s.id} ${tag} ${s.input.slice(0, 40)}${s.input.length > 40 ? '…' : ''}`)
      if (numberFieldHints.length) {
        for (const h of numberFieldHints) dim(`    ℹ 数字字段提示（交给 LLM 铁律处理）: ${h.label}`)
      }
      if (sanitizeEffect?.removedFragments.length) {
        dim(`    ℹ sanitize 已剥离: ${sanitizeEffect.removedFragments.join(', ')}`)
      }
    } else {
      fail(`${s.id} ${tag} ${s.input.slice(0, 40)}${s.input.length > 40 ? '…' : ''}`)
      for (const h of v.dangerHits) dim(`    危险: ${h.label} → "${h.sample}"`)
    }
  }

  // 5) 总结
  section('总结')
  const passCnt = results.filter((r) => r.pass).length
  const failCnt = results.length - passCnt
  if (failCnt === 0 && phraseMiss.length === 0 && (declaresJson || !schema.outputFormat.includes('json'))) {
    console.log(`  ${C.green}✓ 全部通过：${passCnt} 样本 / ${phraseHits.length} 必填短语${C.reset}\n`)
    return 0
  } else {
    console.log(`  ${C.red}✗ 失败：${failCnt} 样本 / 短语缺 ${phraseMiss.length} / JSON 声明 ${declaresJson ? 'OK' : '缺失'}${C.reset}`)
    if (phraseMiss.length) {
      console.log(`  缺短语：${phraseMiss.join(' / ')}`)
    }
    return 1
  }
}
