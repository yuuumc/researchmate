// ============================================================
// 难度自适应注入层（v1.0 · 提示词工程师终版契约对齐）
// ============================================================
// 职责：
//   1. computeMasteryLevel(profile) — 纯函数，按 §1 确定性优先级判定学生水平档
//   2. buildAdaptationBlock(profile) — 拼装 §3 学生适配上下文注入块（含 tier_block + 通用约束）
//   3. injectDifficultyAdaptation(tutorPrompt, profile, history) — 在导师角色定义之后、
//      任务指令之前注入适配块（TUTOR_PROMPT 按首个「# 核心原则」边界切分，两半逐字保留）
//   4. 会话级档位缓存：会话首轮（history 为空）取一次值并随会话固定，
//      会话进行中 store 变化不重算不重新注入（满足 B2：单轮内 mastery 跨档当轮不变、新会话生效）
//
// 设计原则：纯函数 + 零 store 依赖（store getter 与 tutor 调用链共用同一判定逻辑，
//   单一事实源在此模块），无 @/ 别名依赖，可被 node 直跑单测覆盖。
// ============================================================

// ---- §2 三档 tier_block 模板块（逐字） ----
const TIER_BLOCKS = {
  foundational: `【讲解策略 · 基础档】
- 概念优先：先讲清"是什么"，再讲"为什么"，公式与推导放在最后。
- 术语释义：专业术语首次出现时用一句大白话解释，并尽量配生活化类比（如用水压/水流类比电压/电流）。
- 前置补齐：讲解依赖的前置概念，先花一两句补齐再进入正题。
- 步骤拆解：多步推导拆成编号小步，每步只推进一个知识点。
- 互动节奏：每个要点讲完用一句话确认理解（如"这一步清楚吗？不清楚我换个角度讲"）。`,
  intermediate: `【讲解策略 · 巩固档】
- 深度均衡："是什么"与"为什么"并重，标准讲解节奏。
- 术语使用：正常使用专业术语，首次出现给一句简短定义即可，不展开类比。
- 示例优先：优先给典型电路或代码示例（如 CMOS 反相器、典型 Verilog 片段）。
- 前置知识：按需补充，不主动铺开。
- 互动节奏：段落末尾一句小结，不逐步确认。`,
  advanced: `【讲解策略 · 进阶档】
- 深度优先：跳过概念铺垫，直奔推导、边界条件与设计权衡。
- 术语密集：直接使用器件级/系统级表述（如跨导、沟道长度调制、噪声裕量），不做释义。
- 禁用释义标记词：全程（含追问轮）不使用「也就是说」「也就是」「即」「可以理解为」「相当于」「类似于」做同义改写或降维解释；推理衔接改用推导连接词（「因此」「于是」「代入得」「可得」「进而」）。
- 示例取向：优先给边缘 case、反例与工程引申，不给入门示例。
- 前置知识：默认已掌握，不回溯。
- 互动节奏：一次性给出完整结论与推导，不中途确认。`,
}

// 通用约束（逐字相同，拼在每个 tier_block 尾部 ——「单轮不中途切档」落点）
const CONSTRAINT_BLOCK = `【通用约束】
- 本会话内讲解档位固定，不中途切换：即使学生本轮表现显示水平变化，也保持当前档位的深度与术语密度直到会话结束；档位由系统在下次会话开始时重新计算。
- 学生明确反馈"听不懂/太深了"时，可用更直白的方式重讲当前这一个知识点（属讲解方式调整，不是切档），其余内容仍按当前档位。
- 不要向学生提及"水平档/分档/难度自适应"等机制本身，只用适配后的方式讲解。`

/**
 * §1 分档判定（确定性优先级，逐字对齐提示词工程师终版）
 *   1. 未初始化（无认知数据）→ intermediate（兜底；本轮 weak_topics 渲染"暂无"）
 *   2. mastery < 0.5 || meanStar < 2.5 → foundational
 *   3. mastery >= 0.8 || meanStar >= 4 → advanced
 *   4. 其余 → intermediate
 *
 * meanStar = ability_stars 各值均值（0-5）；mastery = knowledge_state 各 mastery 均值（0-1）。
 *
 * 注：现有 useProfileStore.isInitialized getter（=!!user_id）恒真，不反映"画像有无认知数据"，
 *   无法满足 B1（未诊断账号→intermediate）。这里改用 hasCognitiveData 判定兜底，
 *   语义与契约意图（"画像未初始化默认 intermediate 不注入 weak_topics"）一致。
 *
 * @param {object} profile - useProfileStore.profile 快照
 * @returns {'foundational'|'intermediate'|'advanced'}
 */
export function computeMasteryLevel(profile) {
  if (!profile) return 'intermediate'
  const stars = profile.ability_stars || {}
  const ks = profile.knowledge_state || {}
  const starTopics = Object.keys(stars)
  const ksTopics = Object.keys(ks)
  const hasCognitiveData =
    starTopics.length > 0 ||
    ksTopics.length > 0 ||
    profile.last_diagnosis_score != null
  if (!hasCognitiveData) return 'intermediate' // B1 未初始化兜底

  const meanStar = starTopics.length > 0
    ? Object.values(stars).reduce((s, v) => s + (Number(v) || 0), 0) / starTopics.length
    : 0
  // ① 刻度统一：mastery 全仓 0-1（setAbilityStar / persistToDB / applyLearningEvent / feynman 统一），
  //   0-100 残留由 profile.migrateProfile 加载时经 migrateMasteryScale 一次性迁移。
  //   空 ks → mastery = undefined（NaN 比较 → 仅 meanStar 生效）
  const mastery = ksTopics.length > 0
    ? ksTopics.reduce((s, t) => s + (Number(ks[t] && ks[t].mastery) || 0), 0) / ksTopics.length
    : undefined

  if (mastery < 0.5 || meanStar < 2.5) return 'foundational'
  if (mastery >= 0.8 || meanStar >= 4) return 'advanced'
  return 'intermediate'
}

/**
 * weak_topics_str：profile.weak_topics 以"、"join；空数组/未初始化 → "暂无"
 * （==5★已入 mastered 的知识点已由 P1-3 联动从 weak_topics 移除，故不再出现于注入，满足 B4）
 */
export function buildWeakTopicsStr(profile) {
  const weak = Array.isArray(profile && profile.weak_topics) ? profile.weak_topics : []
  return weak.length > 0 ? weak.join('、') : '暂无'
}

/**
 * §2 tier_block = 对应档模板块 + 通用约束尾段
 */
export function buildTierBlock(level) {
  const block = TIER_BLOCKS[level] || TIER_BLOCKS.intermediate
  return `${block}\n\n${CONSTRAINT_BLOCK}`
}

/**
 * §3 学生适配上下文注入块（角色定义之后、任务指令之前）
 */
export function buildAdaptationBlock(profile) {
  const level = computeMasteryLevel(profile)
  const weakTopicsStr = buildWeakTopicsStr(profile)
  const tierBlock = buildTierBlock(level)
  return `---
## 学生适配上下文（系统注入，请勿向学生展示）
- 学生当前水平档：${level}
- 学生当前薄弱知识点：${weakTopicsStr}
（讲解涉及以上薄弱点时，请主动加强铺垫与关联巩固，并明确点出该薄弱知识点的名称。）

${tierBlock}
---`
}

// ---- 会话级档位缓存（B2：单轮内 mastery 跨档当轮不变、新会话生效）----
let _sessionTier = null // { level, weakTopicsStr, tierBlock }

/**
 * 重置会话档位缓存（新会话开始时调用；
 * injectDifficultyAdaptation 在 history 为空时也会自动重置）
 */
export function resetDifficultySession() {
  _sessionTier = null
}

/**
 * 取本会话档位（首轮计算并缓存；后续轮复用，store 变化不重算）
 * @param {object} profile
 * @param {Array} history - 对话历史；空数组=会话首轮
 */
function getSessionTier(profile, history) {
  const isFirstTurn = !Array.isArray(history) || history.length === 0
  if (isFirstTurn || !_sessionTier) {
    const level = computeMasteryLevel(profile)
    _sessionTier = {
      level,
      weakTopicsStr: buildWeakTopicsStr(profile),
      tierBlock: buildTierBlock(level),
    }
  }
  return _sessionTier
}

// TUTOR_PROMPT 角色定义 / 任务指令切分边界（首个「# 核心原则」标题）
const TASK_SECTION_BOUNDARY = '\n# 核心原则'

/**
 * 在导师角色定义之后、任务指令之前注入学生适配上下文块。
 * TUTOR_PROMPT 按首个「# 核心原则」切分：前半=角色定义、后半=任务指令，
 * 两半逐字保留，仅在中间插入注入层。不动导师现有角色定义、任务指令、功能逻辑。
 *
 * @param {string} tutorPrompt - TUTOR_PROMPT 原文（src/prompts/tutor.md?raw）
 * @param {object} profile
 * @param {Array} history - 对话历史（用于会话首轮判定，满足 B2）
 * @returns {string} 注入后的完整导师 prompt
 */
export function injectDifficultyAdaptation(tutorPrompt, profile, history = []) {
  const tier = getSessionTier(profile, history)
  const adaptation = `---
## 学生适配上下文（系统注入，请勿向学生展示）
- 学生当前水平档：${tier.level}
- 学生当前薄弱知识点：${tier.weakTopicsStr}
（讲解涉及以上薄弱点时，请主动加强铺垫与关联巩固，并明确点出该薄弱知识点的名称。）

${tier.tierBlock}
---`

  const idx = tutorPrompt ? tutorPrompt.indexOf(TASK_SECTION_BOUNDARY) : -1
  if (idx === -1) {
    // 边界防御：TUTOR_PROMPT 结构变化找不到「# 核心原则」时，
    // 退化为在 TUTOR_PROMPT 之后整体追加（仍注入适配块，不阻断主流程）
    console.warn('[difficultyAdapt] TUTOR_PROMPT 未找到「# 核心原则」边界，适配块降级为整体追加')
    return `${tutorPrompt}\n\n${adaptation}`
  }
  const roleDef = tutorPrompt.slice(0, idx)
  const taskInstr = tutorPrompt.slice(idx)
  return `${roleDef}\n${adaptation}\n\n${taskInstr}`
}

export const LEVELS = Object.freeze({
  FOUNDATIONAL: 'foundational',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
})
