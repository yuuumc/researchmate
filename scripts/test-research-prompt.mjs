// ============================================================
// Research Prompt 静态单测（v1.5 评审保命 P1）
// ============================================================
// 验收：
//   - 12 个样本（11 正常 + 1 对抗）
//   - JSON 必填字段（direction / undergrad_path / research_path / papers /
//     projects / tech_stack）齐
//   - 论文真实性硬约束："不得编造 / 真实存在" 短语必现
//   - 危险片段 0 命中
//
// 用法：node scripts/test-research-prompt.mjs
// ============================================================

import { runAgentTests } from './lib/promptRunner.mjs'

const code = runAgentTests('research')
process.exit(code)
