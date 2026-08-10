// ============================================================
// 端到端 Agent 调用测试（Node.js，跨平台）
// ============================================================
// 用法：node scripts/test-agent-e2e.mjs
// 验证项：
//   1. /api/chat middleware 链路
//   2. DeepSeek API 真实调用
//   3. 业务 Prompt 注入
//   4. 错误处理
// ============================================================

const API_URL = process.env.AGENT_API_URL || (process.env.AGENT_API_MOCK === '1' ? 'http://localhost:5175/api/chat' : 'http://localhost:5173/api/chat')

async function callChat({ prompt, userInput, options = {} }) {
  const body = JSON.stringify({ prompt, userInput, options })
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body
  })
  const data = await r.json()
  return { ok: r.ok, status: r.status, data }
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('='.repeat(60))
}

function ok(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`) }
function fail(msg) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`) }
function info(msg) { console.log(`  \x1b[36mℹ\x1b[0m ${msg}`) }

async function main() {
  console.log('\n🔬 研芯通端到端 Agent 测试')

  // ===== 测试 1：基础调用（deepseek-chat）=====
  section('测试 1：专业导师 Agent（deepseek-chat）')
  try {
    const r = await callChat({
      prompt: '你是研芯通的专业导师，负责回答工科专业课概念问题。请用一句话简短回答。',
      userInput: 'MOSFET 是什么？',
      options: { model: 'deepseek-chat', temperature: 0.5, max_tokens: 200 }
    })
    if (r.ok && r.data.content) {
      ok('调用成功')
      info(`模型: ${r.data.model}`)
      info(`回复: ${r.data.content.slice(0, 200)}`)
      info(`Token: prompt=${r.data.usage?.prompt_tokens} completion=${r.data.usage?.completion_tokens} total=${r.data.usage?.total_tokens}`)
    } else {
      fail(`调用失败: HTTP ${r.status}`)
      console.log(`  ${JSON.stringify(r.data).slice(0, 300)}`)
    }
  } catch (e) {
    fail(`异常: ${e.message}`)
  }

  // ===== 测试 2：reasoner 模型（4 层根因链用）=====
  section('测试 2：学习诊断 Agent（deepseek-reasoner）')
  try {
    const r = await callChat({
      prompt: '你是研芯通的学习诊断专家。分析学生错题，输出 JSON：{"score":55,"weak_points":["MOSFET 阈值电压"],"root_causes":["泊松方程没学过"]}',
      userInput: '我半导体物理考了 55 分，MOSFET 题错了 2 道，C-V 特性题错了 1 道',
      options: { model: 'deepseek-reasoner', temperature: 0.3, max_tokens: 800 }
    })
    if (r.ok && r.data.content) {
      ok('reasoner 调用成功')
      info(`模型: ${r.data.model}`)
      info(`回复（前 400 字）: ${r.data.content.slice(0, 400)}`)
    } else {
      fail(`调用失败: HTTP ${r.status}`)
      console.log(`  ${JSON.stringify(r.data).slice(0, 300)}`)
    }
  } catch (e) {
    fail(`异常: ${e.message}`)
  }

  // ===== 测试 3：错误处理（空 prompt）=====
  section('测试 3：错误处理（空 prompt）')
  try {
    const r = await callChat({ userInput: 'hello' })
    if (r.status === 400 && r.data.error === 'missing_prompt_or_userInput') {
      ok('正确返回 400 + missing_prompt_or_userInput')
    } else {
      fail(`预期 400，实际 ${r.status}: ${JSON.stringify(r.data)}`)
    }
  } catch (e) {
    fail(`异常: ${e.message}`)
  }

  // ===== 测试 4：错误处理（空 userInput）=====
  section('测试 4：错误处理（空 userInput）')
  try {
    const r = await callChat({ prompt: 'hi' })
    if (r.status === 400) {
      ok(`正确返回 400: ${r.data.error}`)
    } else {
      fail(`预期 400，实际 ${r.status}`)
    }
  } catch (e) {
    fail(`异常: ${e.message}`)
  }

  // ===== 测试 5：苏格拉底式教学（真实场景）=====
  section('测试 5：苏格拉底式教学（真实业务 Prompt）')
  try {
    const r = await callChat({
      prompt: `你是研芯通的专业导师，负责回答学生的专业课概念问题。
采用苏格拉底式教学法，不直接给答案，而是引导学生自己推导。
输出格式：Markdown，包含"前置知识检查"、"阶梯引导"、"关键提示"三部分。
严格基于知识库检索结果回答，不得编造。`,
      userInput: 'MOSFET 阈值电压怎么推导？',
      options: { model: 'deepseek-chat', temperature: 0.5, max_tokens: 1000 }
    })
    if (r.ok && r.data.content) {
      ok('苏格拉底式教学调用成功')
      info('回复片段：')
      console.log('\n' + r.data.content.split('\n').slice(0, 15).map(l => '    ' + l).join('\n') + '\n')
    } else {
      fail(`调用失败: HTTP ${r.status}`)
    }
  } catch (e) {
    fail(`异常: ${e.message}`)
  }

  section('全部测试完成')
  console.log('')
}

main().catch(console.error)
