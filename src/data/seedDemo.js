// ============================================================
// Demo 种子数据（V2 迭代 · 评审展示用）
// ============================================================
// 目的：评委进入后任何位置不能看到空状态
// 种子用户：张同学 / 微电子科学与工程 / 大二 / 目标 AI芯片方向研究生
// 专业能力 72%（半导体物理 65%、数字电路 82%、Verilog 45%）
//
// 注入策略：当 profile.name 为空时注入（首次访问 / 清空缓存后）
// 不会覆盖用户已填写的信息
// ============================================================

import { useProfileStore } from '@/stores/profile'
import { usePlanStore } from '@/stores/plan'
import { storage } from '@/utils/storage'

const SEED_FLAG = 'seed_demo_v2'

// 种子画像数据
export const SEED_PROFILE = {
  name: '张同学',
  major: '微电子科学与工程',
  target_direction: 'AI芯片',
  target_school: '浙江大学',
  target_major: '集成电路工程',
  learning_style: 'mixed',
  exam_date: '2027-12-21',
  preparation_stage: 'basic',
  last_diagnosis_score: 68,
  last_diagnosis_date: new Date(Date.now() - 7 * 86400000).toISOString(),
  // ability_stars: 5 个知识点，均值 3.6 → abilityLevel = 72%
  // MOSFET(1) + Verilog(2) = 2 个薄弱点（≤2 星）
  // 半导体物理(5) + 数字电路(5) + CMOS(5) = 3 个优势（≥4 星）
  ability_stars: {
    MOSFET: 1,
    Verilog: 2,
    '半导体物理': 5,
    '数字电路': 5,
    CMOS: 5
  },
  weak_topics: ['MOSFET', 'Verilog'],
  mastered_topics: ['半导体物理', '数字电路', 'CMOS'],
  // 学科分数明细（画像中心页用）
  subject_scores: [
    { subject: '半导体物理', score: 65, star: 3 },
    { subject: '数字电路', score: 82, star: 4 },
    { subject: 'Verilog', score: 45, star: 2 }
  ]
}

// 种子复习计划
export const SEED_PLAN = {
  version: 1,
  created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  based_on_diagnosis: 68,
  weeks: [
    {
      week: 1,
      title: '微电子基础巩固周',
      tasks: [
        '复习 MOSFET 阈值电压推导（重点：平带电压与氧化层电容）',
        '完成 Verilog 组合逻辑练习 5 题',
        '阅读半导体物理第 5 章 PN 结小结'
      ]
    }
  ],
  adjustments: { keep: ['数字电路基础'], strengthen: ['MOSFET 阈值电压'], drop: [] },
  completion_rate: 33,
  raw_plan: ''
}

// 种子诊断历史
export const SEED_DIAGNOSIS = {
  score: 68,
  date: new Date(Date.now() - 7 * 86400000).toISOString(),
  weak_points: [
    { topic: 'MOSFET 阈值电压', level: 1, root_cause: '对平带电压概念理解不清晰' },
    { topic: 'Verilog 组合逻辑', level: 2, root_cause: 'always 块与 assign 混用' }
  ],
  mastered: ['半导体物理·PN结', '数字电路·卡诺图', 'CMOS·反相器原理']
}

/**
 * 注入种子数据（幂等，仅首次执行）
 * 在 main.js bootstrap 中调用
 */
export function injectSeedData() {
  // 已注入过则跳过
  if (storage.get(SEED_FLAG)) return

  const profileStore = useProfileStore()

  // 仅当用户未填写姓名时注入（不覆盖已有数据）
  if (profileStore.profile.name) {
    storage.set(SEED_FLAG, true)
    return
  }

  // 注入画像
  profileStore.updateProfile({
    name: SEED_PROFILE.name,
    major: SEED_PROFILE.major,
    target_direction: SEED_PROFILE.target_direction,
    target_school: SEED_PROFILE.target_school,
    target_major: SEED_PROFILE.target_major,
    learning_style: SEED_PROFILE.learning_style,
    exam_date: SEED_PROFILE.exam_date,
    preparation_stage: SEED_PROFILE.preparation_stage,
    last_diagnosis_score: SEED_PROFILE.last_diagnosis_score,
    last_diagnosis_date: SEED_PROFILE.last_diagnosis_date,
    ability_stars: { ...SEED_PROFILE.ability_stars },
    weak_topics: [...SEED_PROFILE.weak_topics],
    mastered_topics: [...SEED_PROFILE.mastered_topics],
    subject_scores: SEED_PROFILE.subject_scores
  })

  // 注入复习计划
  const planStore = usePlanStore()
  planStore.addPlan({
    based_on_diagnosis: SEED_PLAN.based_on_diagnosis,
    weeks: SEED_PLAN.weeks,
    adjustments: SEED_PLAN.adjustments,
    completion_rate: SEED_PLAN.completion_rate,
    raw_plan: SEED_PLAN.raw_plan
  })

  storage.set(SEED_FLAG, true)
  console.info('[seedDemo] 种子数据已注入：张同学 / 微电子科学与工程')
}
