// ============================================================
// test-difficulty-adapt.mjs — 难度自适应注入层单测
// 覆盖：computeMasteryLevel §1 判定 / buildWeakTopicsStr B3 /
//      buildTierBlock §2 / injectDifficultyAdaptation §3 位置 + 会话缓存 B2 /
//      三档账号映射（xueba→advanced / zhongdeng→intermediate / chasheng→foundational）
// 仅依赖 ../src/core/difficultyAdapt.js（纯 JS，无 @/ 别名），node 直跑。
// ============================================================
import {
  computeMasteryLevel,
  buildWeakTopicsStr,
  buildTierBlock,
  buildAdaptationBlock,
  injectDifficultyAdaptation,
  resetDifficultySession,
} from '../src/core/difficultyAdapt.js'
import { migrateMasteryScale } from '../src/core/masteryEngine.js'

let pass = 0, fail = 0
function ok(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗ FAIL:', name) }
}

// 模拟 TUTOR_PROMPT（含 # 角色 + # 核心原则 边界）
const FAKE_TUTOR_PROMPT = `> **版本**: 1.0.0

# 角色
你是研芯通的专业导师，负责回答学生的专业课概念问题。

# 核心原则

## 1. 区分问题类型
- 定义性问题：先给定义
- 推导性问题：苏格拉底式

# 输出格式
回答格式...`

console.log('\n=== §1 computeMasteryLevel 分档判定 ===')

// B1: 未初始化（无认知数据）→ intermediate
ok('B1 空画像 → intermediate', computeMasteryLevel({}) === 'intermediate')
ok('B1 null 画像 → intermediate', computeMasteryLevel(null) === 'intermediate')
ok('B1 仅 user_id 无认知数据 → intermediate', computeMasteryLevel({ user_id: 'u1', ability_stars: {}, knowledge_state: {}, last_diagnosis_score: null }) === 'intermediate')

// foundational：mastery<0.5 || meanStar<2.5
ok('chasheng-like 低 mastery+低星 → foundational', computeMasteryLevel({
  ability_stars: { 'MOSFET I-V': 1, 'PN结': 2, '放大电路': 1, 'CMOS反相器': 2 },
  knowledge_state: { 'MOSFET I-V': { mastery: 0.2 }, 'PN结': { mastery: 0.3 } },
  last_diagnosis_score: 25,
}) === 'foundational')
// OR 逻辑：mastery 不低但 meanStar 低 → foundational
ok('mastery=0.6 但 meanStar=2.0 → foundational（OR）', computeMasteryLevel({
  ability_stars: { a: 1, b: 2, c: 3 }, // mean=2.0 <2.5
  knowledge_state: { a: { mastery: 0.6 } }, // mastery>=0.5
  last_diagnosis_score: 50,
}) === 'foundational')
// OR 逻辑：meanStar 不低但 mastery 低 → foundational
ok('meanStar=3.5 但 mastery=0.3 → foundational（OR）', computeMasteryLevel({
  ability_stars: { a: 3, b: 4 }, // mean=3.5
  knowledge_state: { a: { mastery: 0.3 } }, // <0.5
  last_diagnosis_score: 40,
}) === 'foundational')

// advanced：mastery>=0.8 || meanStar>=4
ok('xueba-like 高 mastery+高星 → advanced', computeMasteryLevel({
  ability_stars: { 'MOSFET I-V': 5, 'PN结': 5, '放大电路': 4, 'CMOS反相器': 5 },
  knowledge_state: { 'MOSFET I-V': { mastery: 0.95 }, 'PN结': { mastery: 0.9 } },
  last_diagnosis_score: 88,
}) === 'advanced')
// OR 逻辑：meanStar<4 但 mastery>=0.8 → advanced
ok('meanStar=3.5 但 mastery=0.85 → advanced（OR）', computeMasteryLevel({
  ability_stars: { a: 3, b: 4 }, // mean=3.5 <4
  knowledge_state: { a: { mastery: 0.85 } }, // >=0.8
  last_diagnosis_score: 70,
}) === 'advanced')

// intermediate：既不命中 foundational 也不 advanced
ok('zhongdeng-like 中等 → intermediate', computeMasteryLevel({
  ability_stars: { 'MOSFET I-V': 2, 'PN结': 4, '放大电路': 3, 'CMOS反相器': 3 }, // mean=3.0
  knowledge_state: { 'MOSFET I-V': { mastery: 0.4 }, 'PN结': { mastery: 0.8 }, '放大电路': { mastery: 0.6 } }, // mean=0.6
  last_diagnosis_score: 57,
}) === 'intermediate')
ok('边界 mastery=0.5 meanStar=2.5 → intermediate（严格 < / >=）', computeMasteryLevel({
  ability_stars: { a: 2, b: 3 }, // mean=2.5 不<2.5
  knowledge_state: { a: { mastery: 0.5 } }, // 不<0.5
  last_diagnosis_score: 50,
}) === 'intermediate')
ok('边界 mastery=0.8 meanStar=4 → advanced（>=）', computeMasteryLevel({
  ability_stars: { a: 4, b: 4 }, // mean=4 >=4
  knowledge_state: { a: { mastery: 0.8 } }, // >=0.8
  last_diagnosis_score: 80,
}) === 'advanced')

// ① 防御兜底：空 ks → mastery = undefined（NaN 比较 → 仅 meanStar 生效）
//   覆盖从未诊断的老账号（ks 为空但 ability_stars 可能有值）
console.log('\n=== ① 防御兜底：空 ks → mastery 跳过，仅 meanStar 判定 ===')
ok('空 ks + meanStar=5 → advanced（仅 meanStar≥4）', computeMasteryLevel({
  ability_stars: { 'MOSFET I-V': 5, 'PN结': 5 },
  knowledge_state: {},
  last_diagnosis_score: 80,
}) === 'advanced')
ok('空 ks + meanStar=1.5 → foundational（仅 meanStar<2.5）', computeMasteryLevel({
  ability_stars: { 'MOSFET I-V': 1, 'PN结': 2 },
  knowledge_state: {},
  last_diagnosis_score: 25,
}) === 'foundational')
ok('空 ks + meanStar=3.0 → intermediate（仅 meanStar）', computeMasteryLevel({
  ability_stars: { 'MOSFET I-V': 3, 'PN结': 3 },
  knowledge_state: {},
  last_diagnosis_score: 50,
}) === 'intermediate')
ok('空 ks + meanStar=2.5 → intermediate（边界：不<2.5 不≥4）', computeMasteryLevel({
  ability_stars: { 'MOSFET I-V': 2, 'PN结': 3 },
  knowledge_state: {},
  last_diagnosis_score: 50,
}) === 'intermediate')
ok('空 ks + meanStar=4 → advanced（边界：≥4）', computeMasteryLevel({
  ability_stars: { 'MOSFET I-V': 4, 'PN结': 4 },
  knowledge_state: {},
  last_diagnosis_score: 70,
}) === 'advanced')

// ① 刻度统一：mastery 全仓 0-1，_normMastery 防御归一化已移除；
//   0-100 残留由 migrateMasteryScale（profile.migrateProfile 加载时调用）一次性迁移。
console.log('\n=== ① 刻度统一：_normMastery 移除 + migrateMasteryScale 迁移 ===')
// _normMastery 已移除：未迁移的 0-100 残留值不再被归一（暴露而非掩盖）
ok('_normMastery 已移除：mastery=30 (0-100 残留) 直接读 → 30≥0.8 → advanced（不再 /100）', computeMasteryLevel({
  ability_stars: { a: 3, b: 3 }, // mean=3.0（intermediate 范围，隔离 mastery 条件）
  knowledge_state: { a: { mastery: 30 } }, // 0-100 残留 → 不再归一 → 30 ≥ 0.8 → advanced
  last_diagnosis_score: 40,
}) === 'advanced')
// migrateMasteryScale：0-100 → 0-1 一次性迁移（幂等）
const legacyKS = {
  'MOSFET': { mastery: 80, attempts: 3, confidence: 0.5 },
  'PN结': { mastery: 30, attempts: 1 },
  '放大电路': { mastery: 0.6, attempts: 2 },
}
const migrated = migrateMasteryScale(legacyKS)
ok('migrate: 80 → 0.8', migrated['MOSFET'].mastery === 0.8)
ok('migrate: 30 → 0.3', migrated['PN结'].mastery === 0.3)
ok('migrate: 0.6 不动（已 0-1）', migrated['放大电路'].mastery === 0.6)
ok('migrate: 保留 attempts/confidence 等字段', migrated['MOSFET'].attempts === 3 && migrated['MOSFET'].confidence === 0.5)
ok('migrate: 迁移后 0.3 → foundational（computeMasteryLevel 正确判定）', computeMasteryLevel({
  ability_stars: { a: 3, b: 3 }, knowledge_state: { 'PN结': migrated['PN结'] }, last_diagnosis_score: 40,
}) === 'foundational')
ok('migrate: 幂等（再迁移 0.8 不变）', migrateMasteryScale(migrated)['MOSFET'].mastery === 0.8)
ok('migrate: 空对象/null 兜底', Object.keys(migrateMasteryScale({})).length === 0 && JSON.stringify(migrateMasteryScale(null)) === '{}')

// ② mastery=star/5 写入验证：persistToDB 写的 0-1 mastery 被 computeMasteryLevel 正确读取
console.log('\n=== ② mastery=star/5 写入 → 正确读取 ===')
ok('star/5: star=4 → mastery=0.8 → advanced（mastery≥0.8 单独命中）', computeMasteryLevel({
  ability_stars: { a: 3, b: 3 }, // mean=3.0（intermediate 范围，隔离 mastery 条件）
  knowledge_state: { a: { mastery: 0.8 } }, // 4/5=0.8 ≥ 0.8 → advanced
  last_diagnosis_score: 70,
}) === 'advanced')
ok('star/5: star=2 → mastery=0.4 → foundational（mastery<0.5 单独命中）', computeMasteryLevel({
  ability_stars: { a: 3, b: 3 }, // mean=3.0
  knowledge_state: { a: { mastery: 0.4 } }, // 2/5=0.4 < 0.5 → foundational
  last_diagnosis_score: 40,
}) === 'foundational')
ok('star/5: star=3 → mastery=0.6 → intermediate（0.5≤m<0.8）', computeMasteryLevel({
  ability_stars: { a: 3, b: 3 }, // mean=3.0
  knowledge_state: { a: { mastery: 0.6 } }, // 3/5=0.6 → intermediate
  last_diagnosis_score: 55,
}) === 'intermediate')
ok('star/5: star=5 → mastery=1.0 → advanced（≥0.8）', computeMasteryLevel({
  ability_stars: { a: 3, b: 3 }, // mean=3.0
  knowledge_state: { a: { mastery: 1.0 } }, // 5/5=1.0 ≥ 0.8 → advanced
  last_diagnosis_score: 90,
}) === 'advanced')
ok('star/5: star=1 → mastery=0.2 → foundational（<0.5）', computeMasteryLevel({
  ability_stars: { a: 3, b: 3 }, // mean=3.0
  knowledge_state: { a: { mastery: 0.2 } }, // 1/5=0.2 < 0.5 → foundational
  last_diagnosis_score: 30,
}) === 'foundational')

console.log('\n=== 三档账号映射（集成验收口径）===')
const xuebaProfile = {
  ability_stars: { 'MOSFET I-V': 5, 'PN结': 5, '放大电路': 5, 'CMOS反相器': 5, '光学性质': 4, '超导BCS': 5, '晶体学': 5, '单级放大器': 5, 'CMOS时序逻辑': 4 },
  knowledge_state: Object.fromEntries(['MOSFET I-V', 'PN结', '放大电路', 'CMOS反相器', '超导BCS', '晶体学', '单级放大器'].map(t => [t, { mastery: 0.92 }])),
  weak_topics: [], mastered_topics: ['MOSFET I-V', 'PN结', '放大电路', 'CMOS反相器', '超导BCS', '晶体学', '单级放大器'],
  last_diagnosis_score: 80,
}
const zhongdengProfile = {
  ability_stars: { 'MOSFET I-V': 2, 'PN结': 4, '放大电路': 3, 'CMOS时序逻辑': 2, '光学性质': 4, '超导BCS': 3, '晶体学': 3 },
  knowledge_state: Object.fromEntries(['MOSFET I-V', 'PN结', '放大电路', 'CMOS时序逻辑', '光学性质', '超导BCS', '晶体学'].map(t => [t, { mastery: 0.6 }])),
  weak_topics: ['MOSFET I-V', 'CMOS时序逻辑'], mastered_topics: ['PN结', '光学性质'],
  last_diagnosis_score: 57,
}
const chashengProfile = {
  ability_stars: { 'MOSFET I-V': 1, 'PN结': 2, '放大电路': 1, 'CMOS反相器': 2, '光学性质': 1, '超导BCS': 2, '晶体学': 1, '单级放大器': 2, 'CMOS时序逻辑': 1 },
  knowledge_state: Object.fromEntries(['MOSFET I-V', 'PN结', '放大电路', 'CMOS反相器', '光学性质', '超导BCS', '晶体学', '单级放大器', 'CMOS时序逻辑'].map(t => [t, { mastery: 0.2 }])),
  weak_topics: ['MOSFET I-V', 'PN结', '放大电路', 'CMOS反相器', '光学性质', '超导BCS', '晶体学', '单级放大器', 'CMOS时序逻辑'], mastered_topics: [],
  last_diagnosis_score: 15,
}
ok('xueba → advanced', computeMasteryLevel(xuebaProfile) === 'advanced')
ok('zhongdeng → intermediate', computeMasteryLevel(zhongdengProfile) === 'intermediate')
ok('chasheng → foundational', computeMasteryLevel(chashengProfile) === 'foundational')

console.log('\n=== buildWeakTopicsStr (B3) ===')
ok('空数组 → 暂无', buildWeakTopicsStr({ weak_topics: [] }) === '暂无')
ok('未初始化无 weak_topics → 暂无', buildWeakTopicsStr({}) === '暂无')
ok('非空 → 顿号 join', buildWeakTopicsStr({ weak_topics: ['MOSFET I-V', 'CMOS反相器'] }) === 'MOSFET I-V、CMOS反相器')
const s = buildWeakTopicsStr({ weak_topics: [] })
ok('B3 不出现 []/undefined/null 字面量', !['[]', 'undefined', 'null'].includes(s))

console.log('\n=== buildTierBlock (§2) ===')
ok('foundational 块含基础档标题', buildTierBlock('foundational').includes('【讲解策略 · 基础档】'))
ok('intermediate 块含巩固档标题', buildTierBlock('intermediate').includes('【讲解策略 · 巩固档】'))
ok('advanced 块含进阶档标题', buildTierBlock('advanced').includes('【讲解策略 · 进阶档】'))
for (const lv of ['foundational', 'intermediate', 'advanced']) {
  ok(`${lv} 块含通用约束`, buildTierBlock(lv).includes('【通用约束】'))
  ok(`${lv} 块含「不中途切换」约束`, buildTierBlock(lv).includes('不中途切换'))
  ok(`${lv} 块含「不向学生提及机制」约束`, buildTierBlock(lv).includes('不要向学生提及'))
}

console.log('\n=== buildAdaptationBlock (§3) ===')
const block = buildAdaptationBlock(chashengProfile)
ok('含水平档行', block.includes('学生当前水平档：foundational'))
ok('含薄弱知识点行', block.includes('学生当前薄弱知识点：'))
ok('含 tier_block 基础档', block.includes('【讲解策略 · 基础档】'))
ok('含通用约束', block.includes('【通用约束】'))
ok('含「请勿向学生展示」', block.includes('请勿向学生展示'))
ok('首行 --- 分隔', block.startsWith('---'))
ok('末行 --- 分隔', block.trimEnd().endsWith('---'))

console.log('\n=== injectDifficultyAdaptation (§3 位置 + B2 会话缓存) ===')
// 注入位置：角色定义在前、适配块居中、任务指令在后
resetDifficultySession()
const injected1 = injectDifficultyAdaptation(FAKE_TUTOR_PROMPT, chashengProfile, [])
ok('角色定义在适配块之前', injected1.indexOf('# 角色') < injected1.indexOf('学生适配上下文'))
ok('适配块在「# 核心原则」之前', injected1.indexOf('学生适配上下文') < injected1.indexOf('# 核心原则'))
ok('任务指令「# 核心原则」保留', injected1.includes('# 核心原则'))
ok('角色定义原文未被改写（你是研芯通的专业导师）', injected1.includes('你是研芯通的专业导师，负责回答学生的专业课概念问题。'))
ok('任务指令原文未被改写（区分问题类型）', injected1.includes('区分问题类型'))
ok('chasheng 注入 foundational', injected1.includes('学生当前水平档：foundational'))
ok('chasheng 注入 9 项薄弱点', injected1.includes('MOSFET I-V'))

// B2 会话缓存：首轮 foundational，后续轮改 profile 为 advanced 但档位不变
const injected2 = injectDifficultyAdaptation(FAKE_TUTOR_PROMPT, xuebaProfile, [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }])
ok('B2 会话进行中 profile 跨档 → 档位不变（仍 foundational）', injected2.includes('学生当前水平档：foundational'))
// 新会话（reset + history 空）→ 重新计算
resetDifficultySession()
const injected3 = injectDifficultyAdaptation(FAKE_TUTOR_PROMPT, xuebaProfile, [])
ok('B2 新会话 → 重新计算（advanced）', injected3.includes('学生当前水平档：advanced'))

// 边界防御：找不到 # 核心原则 → 降级整体追加
resetDifficultySession()
const noBoundary = injectDifficultyAdaptation('# 角色\n你是导师。', chashengProfile, [])
ok('无「# 核心原则」边界 → 降级整体追加（含适配块）', noBoundary.includes('学生当前水平档：foundational') && noBoundary.includes('# 角色'))

// B4：==5★已入 mastered 的知识点不出现在注入（weak_topics 已不含 mastered）
resetDifficultySession()
const injected4 = injectDifficultyAdaptation(FAKE_TUTOR_PROMPT, { ability_stars: { a: 2, b: 5 }, knowledge_state: { a: { mastery: 0.3 }, b: { mastery: 0.95 } }, weak_topics: ['a'], mastered_topics: ['b'], last_diagnosis_score: 40 }, [])
// B4：weak_topics=['a']，mastered_topics=['b'] → 薄弱点行含 a 不含 b
ok('B4 weak 项 a 出现在薄弱点行', injected4.includes('学生当前薄弱知识点：a'))
ok('B4 mastered 项 b 不在薄弱点行', !injected4.includes('学生当前薄弱知识点：b') && !injected4.match(/薄弱知识点：.*b/))

console.log('\n=== R6 机制不暴露（注入块本身不含机制词给 LLM）===')
// 注：通用约束里有「不要向学生提及"水平档/分档/难度自适应"」——这是约束指令，不是暴露；
// 验注入块中向 LLM 申明档位是合法的（系统注入，非学生可见）。这里只验「学生适配上下文」标注。
ok('注入块标注「系统注入，请勿向学生展示」', injected1.includes('系统注入，请勿向学生展示'))

console.log(`\n========== 结果：${pass} passed, ${fail} failed ==========`)
if (fail > 0) process.exit(1)
