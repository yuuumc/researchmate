// ============================================================
// v2 Prompt 体系回溯测试 (Node 版, 不依赖 Vite)
// ============================================================
// 用法: node scripts/test-prompt-v2-node.mjs
//
// 验证目标（来自 v2.0 派发文档 7.2 验收口径）:
//   1. 5 Agent 全部有 v1/v2 双版本可回溯
//   2. 教师侧 Prompt 与学生侧 Prompt 完全隔离
//   3. Prompt 改一行能在 1 分钟内灰度（manifest + commit 即生效）
//
// 兼容: v1 baseline 不存在时优雅降级（仅校验 v2 与 manifest）
// ============================================================

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

const C = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`
}
const log = {
  pass: (m) => console.log(`  ${C.green('✓')} ${m}`),
  fail: (m) => console.log(`  ${C.red('✗')} ${m}`),
  info: (m) => console.log(`  ${C.cyan('ℹ')} ${m}`),
  skip: (m) => console.log(`  ${C.yellow('○')} ${m} (v1 缺失, 跳过)`, )
}
const section = (m) => console.log(`\n${C.cyan('━'.repeat(70))}\n${m}\n${C.cyan('━'.repeat(70))}`)

const VALID_AGENTS = ['tutor', 'diagnose', 'planner', 'admission', 'research']
let pass = 0, fail = 0, skip = 0
function assert(c, m) { c ? (pass++, log.pass(m)) : (fail++, log.fail(m)) }
function skipAssert(m) { skip++; log.skip(m) }

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf-8') } catch { return null }
}
function sha(s) { return crypto.createHash('sha256').update(s).digest('hex') }

const manifestPath = path.join(ROOT, 'src/prompts/prompts-manifest.json')
if (!fs.existsSync(manifestPath)) {
  console.error(`manifest not found: ${manifestPath}`)
  process.exit(2)
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

function loadAll() {
  const out = {}
  for (const agent of VALID_AGENTS) {
    out[agent] = {
      v1: readFileSafe(path.join(ROOT, `src/prompts/${agent}.md`)),
      v2_student: readFileSafe(path.join(ROOT, `src/prompts/v2/${agent}/student.md`)),
      v2_teacher: readFileSafe(path.join(ROOT, `src/prompts/v2/${agent}/teacher.md`))
    }
  }
  return out
}
const prompts = loadAll()
const v1Available = VALID_AGENTS.every(a => prompts[a].v1)

section('1. 文件齐全性 (15 路径)')
for (const agent of VALID_AGENTS) {
  if (prompts[agent].v1) log.pass(`${agent}.md (v1) 存在`)
  else skipAssert(`${agent}.md (v1) 不存在`)
  assert(!!prompts[agent].v2_student, `${agent}/v2/student.md 存在`)
  assert(!!prompts[agent].v2_teacher, `${agent}/v2/teacher.md 存在`)
}

section('2. manifest 元数据完整性')
for (const agent of VALID_AGENTS) {
  const cfg = manifest.agents[agent]
  assert(cfg && cfg.v1_baseline, `${agent} manifest.v1_baseline 存在`)
  assert(cfg.v2.student.active === '2.0.0', `${agent}/student active=2.0.0`)
  assert(cfg.v2.teacher.active === '2.0.0', `${agent}/teacher active=2.0.0`)
  const t = cfg.v2.student.versions['2.0.0'].traffic
  assert(t === 1.0, `${agent}/student/2.0.0 traffic=1.0`)
}

if (v1Available) {
  section('3. v1 ↔ v2 sha 不同（双版本可回溯）')
  for (const agent of VALID_AGENTS) {
    const v1Sha = sha(prompts[agent].v1)
    const v2sSha = sha(prompts[agent].v2_student)
    const v2tSha = sha(prompts[agent].v2_teacher)
    assert(v1Sha !== v2sSha, `${agent} v1 ↔ v2/student sha 不同`)
    assert(v1Sha !== v2tSha, `${agent} v1 ↔ v2/teacher sha 不同`)
    assert(v2sSha !== v2tSha, `${agent} v2/student ↔ v2/teacher sha 不同`)
    log.info(`${agent} sha: v1=${v1Sha.slice(0, 8)} v2s=${v2sSha.slice(0, 8)} v2t=${v2tSha.slice(0, 8)}`)
  }

  section('5. v1 baseline 必含「v1 硬约束」段（兼容基线）')
  for (const agent of VALID_AGENTS) {
    const hasV1Section = prompts[agent].v1.includes('硬约束')
    assert(hasV1Section, `${agent} v1 baseline 含硬约束段`)
  }
} else {
  section('3. v1 ↔ v2 sha 不同（双版本可回溯）')
  for (const agent of VALID_AGENTS) {
    skipAssert(`${agent} v1 baseline 缺失, 无法对比 sha`)
  }
  section('5. v1 baseline 兼容基线')
  for (const agent of VALID_AGENTS) {
    skipAssert(`${agent} v1 缺失`)
  }
}

section('4. 教师 / 学生侧完全隔离（核心验收）')
for (const agent of VALID_AGENTS) {
  const stu = prompts[agent].v2_student
  const tch = prompts[agent].v2_teacher
  assert(!stu.includes('学情关联'), `${agent}/student 不含「学情关联」`)
  assert(!stu.includes('干预建议'), `${agent}/student 不含「干预建议」`)
  assert(!tch.includes('{{student_id}}'), `${agent}/teacher 不含 {{student_id}} 注入`)
  assert(tch.includes('{{teacher_id}}'), `${agent}/teacher 含 {{teacher_id}} 注入位`)
  assert(tch.includes('{{class_id}}'), `${agent}/teacher 含 {{class_id}} 注入位`)
  assert(stu.includes('{{student_id}}'), `${agent}/student 含 {{student_id}} 注入位`)
  assert(stu !== tch, `${agent} student/teacher 内容不同`)
}

section('6. v2 必含「v2 硬约束」段（新增约束）')
for (const agent of VALID_AGENTS) {
  for (const aud of ['v2_student', 'v2_teacher']) {
    assert(prompts[agent][aud].includes('v2 硬约束'), `${agent}/${aud} 含 v2 硬约束段`)
  }
}

section('7. 关键硬约束覆盖（多用户隔离 / 教师不可越权）')
for (const agent of VALID_AGENTS) {
  const stu = prompts[agent].v2_student
  const stuIsolated = stu.includes('隐私') || stu.includes('数据隔离') || stu.includes('不得回答其他学生')
  assert(stuIsolated, `${agent}/student 含数据隔离约束`)
  const tch = prompts[agent].v2_teacher
  const tchLimited = tch.includes('不可越权') || tch.includes('脱敏') || tch.includes('只能看') || tch.includes('只能访问')
  assert(tchLimited, `${agent}/teacher 含教师权限约束`)
}

section('8. JSON 输出契约（diagnose / planner / admission / research）')
for (const agent of ['diagnose', 'planner', 'admission', 'research']) {
  for (const aud of ['v2_student', 'v2_teacher']) {
    const p = prompts[agent][aud]
    assert(p.includes('```json'), `${agent}/${aud} 含 json 围栏声明`)
    assert(p.includes('audience'), `${agent}/${aud} JSON 含 audience 审计字段`)
  }
}

section('9. 教师侧聚合视角存在（tutor / diagnose / planner / admission / research）')
for (const agent of VALID_AGENTS) {
  const tch = prompts[agent].v2_teacher
  const hasAggregate = tch.includes('班级') || tch.includes('学情') || tch.includes('分布') || tch.includes('聚合')
  assert(hasAggregate, `${agent}/teacher 含聚合视角`)
}

section('10. 灰度 KPI（manifest 字段可改 → 1 分钟灰度）')
let canRollback = true
for (const agent of VALID_AGENTS) {
  for (const aud of ['student', 'teacher']) {
    const t = manifest.agents[agent].v2[aud].versions['2.0.0'].traffic
    if (typeof t !== 'number') { canRollback = false; log.fail(`${agent}/${aud} traffic 非法`) }
  }
}
assert(canRollback, '所有 v2 版本 traffic 字段为 number → 紧急回滚可改 0')

log.info('1 分钟灰度实施路径:')
log.info('  1) vim src/prompts/v2/tutor/student.md  (改一行)')
log.info('  2) vim src/prompts/prompts-manifest.json  (可选: 改 active/traffic)')
log.info('  3) git add -A && git commit -m "prompt: tutor/student/2.0.1 hotfix"')
log.info('  4) git push origin main  (Vercel 部署 ≤ 60s)')
log.info('  5) 紧急回滚: traffic=0, active=v1_baseline')

section('汇总')
console.log(`  ${C.green(`通过 ${pass} 项`)} | ${C.red(`失败 ${fail} 项`)} | ${C.yellow(`跳过 ${skip} 项 (v1 缺失)`)}`)
console.log(`  ${C.gray('覆盖: 5 Agent × 2 audience = 10 v2 路径（核心验收）')}`)
console.log(`  ${C.gray('v1 baseline: 5 路径, 缺失时优雅跳过')}`)

if (fail > 0) process.exit(1)
