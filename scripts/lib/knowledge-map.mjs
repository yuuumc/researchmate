// ============================================================
// 知识图谱：5 学科 × 10-12 知识点（集成电路方向）
// W2 题库生成管线的输入清单
// ============================================================
// 用途：scripts/generate-questions.mjs 遍历每个学科/知识点，
//       调 DeepSeek 生成题目，构建 50-100 道初始题库
// ============================================================

export const SUBJECTS = {
  '半导体物理': {
    knowledge_points: [
      '晶体结构与晶格振动',
      '半导体能带理论',
      '载流子统计与费米能级',
      'PN 结原理与能带图',
      'PN 结电流-电压特性',
      '金属-半导体接触',
      'MOS 结构与 C-V 特性',
      '载流子输运：漂移与扩散',
      '少子产生复合与寿命',
      '半导体光学性质',
      '异质结与量子阱',
    ],
  },
  '微电子器件': {
    knowledge_points: [
      'MOSFET 结构与工作原理',
      'MOSFET I-V 特性与阈值电压',
      'MOSFET 高频模型与频率特性',
      'MOSFET 短沟道效应',
      'BJT 结构与工作原理',
      'BJT 电流增益与频率特性',
      'JFET 与 MESFET',
      '功率器件：IGBT 与功率 MOSFET',
      '器件可靠性与失效机制',
      'FinFET 与新型器件结构',
    ],
  },
  '数字IC': {
    knowledge_points: [
      'CMOS 反相器静态特性',
      'CMOS 反相器动态特性',
      'CMOS 组合逻辑电路',
      'CMOS 时序逻辑电路：锁存器与触发器',
      '半导体存储器：SRAM/DRAM/Flash',
      '标准单元库设计',
      '数字IC 设计流程与综合',
      '时序分析：setup/hold',
      '低功耗设计技术',
      '时钟树综合与复位策略',
    ],
  },
  '模拟IC': {
    knowledge_points: [
      '单级放大器：共源/共漏/共栅',
      '差分放大器',
      '电流镜与有源负载',
      '运算放大器：两级与套筒式',
      '频率补偿：米勒补偿与 Cascode 补偿',
      '反馈理论与稳定性',
      '噪声分析：热噪声与 1/f 噪声',
      'ADC 基本原理：SAR/Delta-Sigma/Pipeline',
      '基准源：Bandgap 与 LDO',
      '振荡器：环形与 LC',
    ],
  },
  '固态物理': {
    knowledge_points: [
      '晶体学基础：晶格与倒格矢',
      '布洛赫定理与能带形成',
      '近自由电子近似',
      '紧束缚近似',
      '晶格振动与声子',
      '固体热容：爱因斯坦与德拜模型',
      '固体磁性：顺磁/铁磁/反铁磁',
      '超导基础：BCS 理论',
      '介电性质与极化',
      '光学性质：激子与光子晶体',
    ],
  },
};

// 扁平化：生成 (subject, knowledge_point) 配对列表
export function expandAll() {
  const pairs = [];
  for (const [subject, def] of Object.entries(SUBJECTS)) {
    for (const kp of def.knowledge_points) {
      pairs.push({ subject, knowledge_point: kp });
    }
  }
  return pairs;
}

// 每个学科分配的题目数（5 学科 × ~6 题 = 30 题基础；W2 目标 50-100 题）
export const DEFAULT_COUNT_PER_KP = 2;

export function totalTargetQuestions() {
  return expandAll().length * DEFAULT_COUNT_PER_KP;
}
