// ============================================================
// test-mastery.mjs — A1 统一学情数据层契约测试
// 验证：weakPoints 诊断唯一源 / masteredSkills ≥4星 / 计数口径一致 /
//      rootCauseChain 持久化直读 / latestScore 从诊断记录
// ============================================================
import { createPinia, setActivePinia } from 'pinia'
import { useDiagnosisStore } from '../src/stores/diagnosis.js'
import { useProfileStore } from '../src/stores/profile.js'
import { useMasteryData } from '../src/composables/useMasteryData.js'

// --- stub storage（diagnosis/profile store 依赖 @/utils/storage，Node 下需兜底）---
// 简易内存 storage，挂到 globalThis.localStorage
const mem = {}
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v) },
  removeItem: (k) => { delete mem[k] },
}
// storage.js 读 localStorage，OK

let pass = 0, fail = 0
function ok(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗ FAIL:', name) }
}

setActivePinia(createPinia())

const diag = useDiagnosisStore()
const prof = useProfileStore()

// 重置干净
prof.reset()
diag.clear()

// === 场景1：诊断完成，weak_points 含「MOSFET 阈值电压」，ability_stars 该点 2 星 ===
diag.add({
  score: 58,
  subject: '微电子',
  weak_points: ['MOSFET 阈值电压推导', 'C-V 特性'],
  root_causes: ['半导体表面势理解不足'],
  structured: {
    score: 58,
    subject: '微电子',
    weak_points: ['MOSFET 阈值电压推导', 'C-V 特性'],
    direct_causes: [{ knowledge_point: 'MOSFET 阈值电压推导', reason: '表面势未掌握', score: 8 }],
    middle_causes: [{ reason: '强反型条件不熟', score: 12 }],
    root_causes: [{ reason: '半导体物理基础薄弱', score: 18 }],
    remediation_path: '从泊松方程重新梳理'
  }
})
// 模拟 diagnosis.runDiagnosis 的 profile 回写
prof.setAbilityStar('MOSFET 阈值电压推导', 2)   // 薄弱
prof.setAbilityStar('C-V 特性', 2)               // 薄弱
prof.setAbilityStar('PN结', 5)                    // 已掌握
prof.setAbilityStar('卡诺图', 4)                  // 已掌握
prof.setAbilityStar('放大电路', 3)                // 发展中

const m = useMasteryData()

// Bug1: weakPoints 只含诊断薄弱点（考纲内），零职业标签
ok('Bug1 weakPoints 来自诊断（2 条）', m.weakPoints.value.length === 2)
ok('Bug1 weakPoints 含 MOSFET 阈值电压推导', m.weakPoints.value.includes('MOSFET 阈值电压推导'))
ok('Bug1 weakPoints 不含职业标签（运放/Verilog）', !m.weakPoints.value.some(w => /运放|Verilog|UVM|Bandgap|SPC|DOE|ATE/.test(w)))

// A1-a: 诊断薄弱点不出现在已具备技能
ok('A1-a MOSFET 阈值电压不在 masteredSkills', !m.masteredSkills.value.includes('MOSFET 阈值电压推导'))
ok('A1-a PN结(5星)在 masteredSkills', m.masteredSkills.value.includes('PN结'))

// A1-c: 已掌握技能出现在技能清单（直读，≥4星）
ok('A1-c 卡诺图(4星)在 masteredSkills', m.masteredSkills.value.includes('卡诺图'))

// A1-b: 主页与星图口径一致
ok('A1-b strongCount=2（PN结+卡诺图）', m.strongCount.value === 2)
ok('A1-b weakStarCount=2（MOSFET+C-V）', m.weakStarCount.value === 2)
ok('A1-b developingCount=1（放大电路3星）', m.developingCount.value === 2 ? false : m.developingCount.value === 1)

// Bug3: 最近诊断分数与薄弱点数量直读诊断报告
ok('Bug3 latestScore=58（诊断记录）', m.latestScore.value === 58)
ok('Bug3 weakPointCount=2（诊断报告薄弱点数）', m.weakPointCount.value === 2)

// Bug2: 根因链从持久化 structured 直读（4 层非空）
const rc = m.rootCauseChain.value
ok('Bug2 rootCauseChain 非空', rc !== null)
ok('Bug2 score=58', rc.score === 58)
ok('Bug2 direct_causes 非空', Array.isArray(rc.direct_causes) && rc.direct_causes.length > 0)
ok('Bug2 middle_causes 非空', Array.isArray(rc.middle_causes) && rc.middle_causes.length > 0)
ok('Bug2 root_causes 非空', Array.isArray(rc.root_causes) && rc.root_causes.length > 0)

// === 场景2：模拟 profileStore.weak_topics 被职业标签污染（旧数据残留）===
// useMasteryData.weakPoints 仍只读诊断，不受污染
prof.profile.weak_topics.push('运放设计', 'Verilog')
prof.persist()
ok('Bug1 隔离: weak_topics 被污染后 weakPoints 仍只含诊断 2 条', m.weakPoints.value.length === 2)
ok('Bug1 隔离: 职业标签不出现在 weakPoints', !m.weakPoints.value.includes('运放设计'))

// === 场景3：练习中某知识点升到 5 星 → masteredSkills 即时反映（A1-c 无延迟）===
prof.setAbilityStar('放大电路', 5)  // 练习做对升级
ok('A1-c 练习升级后 放大电路进 masteredSkills', m.masteredSkills.value.includes('放大电路'))
ok('A1-c strongCount 更新为 3', m.strongCount.value === 3)

// === 场景4：新一轮诊断，分数/薄弱点更新，旧缓存不残留（Bug3）===
diag.add({
  score: 72,
  subject: '微电子',
  weak_points: ['C-V 特性'],  // MOSFET 已攻克，只剩 C-V
  structured: { score: 72, weak_points: ['C-V 特性'], direct_causes: [], middle_causes: [], root_causes: [] }
})
ok('Bug3 新诊断后 latestScore=72', m.latestScore.value === 72)
ok('Bug3 新诊断后 weakPointCount=1', m.weakPointCount.value === 1)
ok('Bug3 新诊断后 weakPoints 只含 C-V 特性', m.weakPoints.value.length === 1 && m.weakPoints.value[0] === 'C-V 特性')

// === 场景5（P1-1 契约）：主页「已掌握」== strongCount（>=4星），含 4星 知识点 ===
// HomeView 已切源 strongCount，不再读 profileStore.masteredCount（仅 5星）
// 当前态：PN结5星 + 卡诺图4星 + 放大电路5星 = strongCount 3；旧源 masteredCount=2（仅5星）
ok('P1-1 strongCount=3（含4星卡诺图，非仅5星）', m.strongCount.value === 3)
ok('P1-1 masteredSkills 与 strongCount 同源同长', m.strongCount.value === m.masteredSkills.value.length)
ok('P1-1 旧源 masteredCount(仅5星)=2 < strongCount=3（证明已切源）', prof.masteredCount === 2 && prof.masteredCount < m.strongCount.value)

// === 场景6（P2-2 契约）：rootCauseChain 与 latestScore 同源（latestDiagnosis 优先） ===
// 模拟 lastReport 残留上一会话非最新诊断：lastReport.structured.score=99，
// 但 latestDiagnosis.structured.score=72（场景4 新诊断）-> rootCauseChain 应取 72
diag.lastReport = { structured: { score: 99, subject: '旧会话', weak_points: [], direct_causes: [], middle_causes: [], root_causes: [] } }
{
  const rc2 = m.rootCauseChain.value
  ok('P2-2 rootCauseChain 取 latestDiagnosis(72) 非 lastReport(99)', rc2.score === 72)
  ok('P2-2 rootCauseChain 与 latestScore 同源', rc2.score === m.latestScore.value)
}
// 清理：移除 lastReport，rootCauseChain 仍从 latestDiagnosis 取值（持久化回退）
diag.lastReport = null
{
  const rc3 = m.rootCauseChain.value
  ok('P2-2 无 lastReport 时 rootCauseChain 仍非空（持久化回退）', rc3 !== null && rc3.score === 72)
}

console.log(`\n${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
