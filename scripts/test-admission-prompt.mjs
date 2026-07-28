// ============================================================
// Admission Prompt 静态单测（v1.5 评审保命 P1）
// ============================================================
// 验收：
//   - 12 个样本（11 正常 + 1 对抗）
//   - JSON 必填字段 recommendations 齐
//   - v1 §6.5 铁律短语必现：不得编造数字字段 / 不得编造 URL / 3 档齐全
//   - 危险片段 0 命中
//   - 数字字段越界检测：userInput 中含 "分数线 / 报录比 / 百分比 / 招生人数 / 年份"
//     命中应被 admission agent 拒绝（v1 §6.5 铁律）
//
// 用法：node scripts/test-admission-prompt.mjs
// ============================================================

import { runAgentTests } from './lib/promptRunner.mjs'

const code = runAgentTests('admission')
process.exit(code)
