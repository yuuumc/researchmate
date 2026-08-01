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

// 种子诊断报告（DiagnosisView · 4 层根因链展示用）
export const SEED_DIAGNOSIS_REPORT = {
  score: 68,
  subject: '微电子科学与工程',
  // 4 层根因链
  weak_points: ['MOSFET 阈值电压推导错误', 'Verilog always 块与时序逻辑混淆'],
  direct_causes: ['平带电压公式未掌握', '阻塞赋值与非阻塞赋值概念模糊'],
  middle_causes: ['半导体表面势概念断层', '硬件描述语言并发模型缺失'],
  root_causes: ['固体物理能带理论基础薄弱', '数字系统设计思维尚未建立'],
  remediation: '建议先用 2 周补强固体物理能带与费米能级概念，再回到 MOSFET 阈值电压推导；Verilog 部分通过对比 always@(*) 与 always@(posedge clk) 的仿真波形建立时序直觉。'
}

// 种子能力星图（DiagnosisView · 能力维度展示）
export const SEED_ABILITY_STARS = [
  { topic: '半导体物理', star: 4, score: 65, type: 'strength' },
  { topic: '数字电路', star: 4, score: 82, type: 'strength' },
  { topic: 'CMOS 反相器', star: 4, score: 78, type: 'strength' },
  { topic: 'Verilog HDL', star: 2, score: 45, type: 'weak' },
  { topic: 'MOSFET 原理', star: 1, score: 38, type: 'weak' }
]

// 种子就业路径（CareerView · 空态红线展示）
export const SEED_CAREER_PATHS = [
  {
    title: '数字 IC 设计工程师',
    match: 82,
    gap: ['Verilog 系统建模', '低功耗设计方法'],
    companies: ['海思半导体', '紫光展锐', '中兴微电子'],
    salary: '25-40K·14薪'
  },
  {
    title: '模拟 IC 设计工程师',
    match: 68,
    gap: ['MOSFET 小信号模型', '版图基础'],
    companies: ['圣邦微电子', '思瑞浦', '艾为电子'],
    salary: '22-35K·14薪'
  },
  {
    title: 'IC 验证工程师',
    match: 75,
    gap: ['UVM 方法学', 'SystemVerilog 断言'],
    companies: ['芯原股份', '澜起科技', '兆易创新'],
    salary: '20-32K·13薪'
  }
]

// 种子练习题（PracticeView · 空态红线展示）
export const SEED_QUESTIONS = [
  {
    type: '选择题',
    difficulty: '中级',
    point: 'MOSFET 阈值电压',
    question: '当 NMOS 的衬底偏置电压 VBS < 0 时，阈值电压 Vth 将如何变化？',
    options: ['A. 减小', 'B. 增大', 'C. 不变', 'D. 先增大后减小'],
    answer: 'B',
    analysis: '衬底反偏使耗尽层变宽，体电荷 Qb 增大，由 Vth = Vfb + 2φf + Qb/Cox 可知 Vth 增大，即体效应。'
  },
  {
    type: '填空题',
    difficulty: '初级',
    point: 'Verilog 组合逻辑',
    question: '在 Verilog 中，描述纯组合逻辑的 always 块敏感表应使用关键字 ______ 替代信号列表。',
    answer: '(*)',
    analysis: 'always@(*) 会让综合工具自动推导敏感信号，避免遗漏导致锁存器，是组合逻辑的推荐写法。'
  },
  {
    type: '简答题',
    difficulty: '高级',
    point: 'CMOS 反相器',
    question: '简述 CMOS 反相器在输入跳变过程中的功耗来源，并说明静态功耗为何接近零。',
    answer: '动态功耗来自充放电电容（P = αCV²f）与输入跳变瞬间 PMOS/NMOS 同时导通的短路功耗；静态功耗接近零是因为稳态下始终有一个管子截止，无直流通路（理想情况）。'
  }
]

// 种子同伴匹配（PeerView · 空态红线展示）
export const SEED_PEER_MATCHES = [
  {
    name: '李同学',
    school: '电子科技大学',
    major: '微电子科学与工程',
    complement: 'Verilog 项目经验丰富（8 题 OJ）',
    common: ['目标 AI 芯片方向', '半导体物理 4★'],
    match_score: 91
  },
  {
    name: '王同学',
    school: '西安电子科技大学',
    major: '集成电路设计',
    complement: 'MOSFET 仿真熟练（Cadence）',
    common: ['Verilog 同为薄弱点', '大二'],
    match_score: 86
  },
  {
    name: '陈同学',
    school: '东南大学',
    major: '电子科学与技术',
    complement: '数字电路竞赛省一',
    common: ['目标院校浙江大学', '混合学习风格'],
    match_score: 79
  }
]

// 种子科研路线（ResearchView · ResearchCard 用）
export const SEED_RESEARCH = {
  direction: 'AI 芯片 · 数字加速器方向',
  undergrad_path: [
    { phase: '大二上', task: '夯实半导体物理 + 数字电路基础', difficulty: '入门' },
    { phase: '大二下', task: '入门 Verilog / FPGA，完成 RISC-V 单周期 CPU', difficulty: '进阶' },
    { phase: '大三上', task: '学习计算机体系结构，实现 5 级流水线', difficulty: '进阶' },
    { phase: '大三下', task: '进入实验室，复现 AI 加速器论文（如 NVDLA 子模块）', difficulty: '高级' }
  ],
  research_path: [
    { phase: '研一', task: '深度学习编译器（TVM/MLIR）+ 芯片联合优化', difficulty: '高级' },
    { phase: '研二', task: '独立课题：面向 Transformer 的稀疏加速器设计', difficulty: '高级' }
  ],
  papers: [
    { title: 'Eyeriss: A Spatial Architecture for Energy-Efficient DNN', venue: 'ISCA 2016' },
    { title: 'A Configurable Cloud-Scale DNN Accelerator (NVDLA)', venue: 'MICRO 2018' }
  ],
  projects: ['RISC-V 五级流水线 CPU（FPGA）', 'MNIST 加速器（Verilog 仿真）'],
  tech_stack: ['Verilog', 'Chisel', 'PyTorch', 'Vivado', 'Cadence']
}

// 种子择校推荐（AdmissionView · AdmissionCard 用）
export const SEED_ADMISSION = [
  {
    school: '浙江大学',
    region: '浙江',
    tier: 'reach',
    level: '985',
    major: '集成电路工程',
    year: 2026,
    score_line: 355,
    ratio: 6,
    enrollment: 45,
    reason: 'AI 芯片方向强势（集成电路学院），但竞争激烈，张同学当前 72% 能力需提升至 85%+ 方较稳。'
  },
  {
    school: '电子科技大学',
    region: '四川',
    tier: 'match',
    level: '985',
    major: '集成电路工程',
    year: 2026,
    score_line: 330,
    ratio: 4,
    enrollment: 80,
    reason: '微电子 A+ 学科，与张同学专业高度契合，分数线友好，推荐作为主攻。'
  },
  {
    school: '西安电子科技大学',
    region: '陕西',
    tier: 'safety',
    level: '211',
    major: '集成电路工程',
    year: 2026,
    score_line: 305,
    ratio: 3,
    enrollment: 120,
    reason: '集成电路 211 强校，招生量大、报录比友好，作为稳妥保底。'
  }
]

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
