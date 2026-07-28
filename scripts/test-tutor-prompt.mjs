// ============================================================
// Prompt A/B 测试：验证新 tutor.md 是否修复了 3 个问题
// ============================================================
// 用同一问题测旧 vs 新 prompt（这里直接测新 prompt，旧 prompt 行为已知错误）
// ============================================================

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_URL = 'http://localhost:5173/api/chat'

// 读取新版 prompt
const newPrompt = readFileSync(resolve(__dirname, '../src/prompts/tutor.md'), 'utf-8')

// 模拟知识库检索结果（与前端 RAG 行为一致）
const mockRagContext = `[1] 来源：半导体物理-第5章-MOSFET
MOSFET（金属-氧化物-半导体场效应晶体管）是现代集成电路的核心器件。阈值电压 V_th 是 MOSFET 的关键参数，定义为强反型层形成时的栅源电压。阈值电压的推导涉及表面势 ψ_s、费米势 φ_F、氧化层电容 C_ox 等参数。

---

[2] 来源：半导体物理-第5章-MOSFET
强反型判据：当表面势 ψ_s = 2φ_F 时，反型层载流子浓度等于体多数载流子浓度，此时栅压定义为阈值电压 V_th。V_th = V_FB + 2φ_F + Q_d/C_ox，其中 V_FB 是平带电压，Q_d 是耗尽层电荷，C_ox 是单位面积氧化层电容。`

const fullPrompt = `${newPrompt}

# 学生画像
（首次访问，无历史画像）

# 知识库检索结果（Top-2）
${mockRagContext}
`

async function callChat({ prompt, userInput, options = {} }) {
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ prompt, userInput, options })
  })
  return { ok: r.ok, status: r.status, data: await r.json() }
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('='.repeat(60))
}

async function test(question, label) {
  console.log(`\n🧪 ${label}`)
  console.log(`   问：${question}`)
  console.log('')
  try {
    const r = await callChat({
      prompt: fullPrompt,
      userInput: question,
      options: { model: 'deepseek-chat', temperature: 0.5, max_tokens: 1500 }
    })
    if (r.ok && r.data.content) {
      console.log(r.data.content)
    } else {
      console.log(`❌ 失败 HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`)
    }
  } catch (e) {
    console.log(`❌ 异常: ${e.message}`)
  }
}

async function main() {
  console.log('\n🔬 新版 tutor.md Prompt A/B 测试')

  // ===== 测试 1：定义性问题（之前翻车的类型）=====
  await test('什么是 MOS 管？', '测试 1：定义性问题（修复重点）')

  // ===== 测试 2：推导性问题（应该走纯苏格拉底式）=====
  await test('MOSFET 阈值电压怎么推导？', '测试 2：推导性问题')

  // ===== 测试 3：比较性问题 =====
  await test('MOS 管和三极管的区别？', '测试 3：比较性问题')

  section('测试完成')
  console.log('\n检查清单：')
  console.log('  1. 定义性问题是否直接给出定义？（不应拒绝）')
  console.log('  2. 是否有自问自答？（不应有）')
  console.log('  3. 是否编造知识库外的内容？（不应编造）')
  console.log('  4. 是否分阶段引导？（不应一次输出全部阶梯）')
  console.log('  5. 检索结果为空时是否明确告知？\n')
}

main().catch(console.error)
