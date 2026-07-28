// ============================================================
// Planner Prompt 静态单测（v1.5 评审保命 P1）
// ============================================================
// 验收：
//   - 12 个样本（11 正常 + 1 对抗）
//   - JSON 必填字段（target_stage / weeks / adjustments.keep|strengthen|drop）齐
//   - 4 周 / 紧急度 P0/P1/P2 / 弹性时间 关键词必现
//   - 危险片段 0 命中
//
// 用法：node scripts/test-planner-prompt.mjs
// ============================================================

import { runAgentTests } from './lib/promptRunner.mjs'

const code = runAgentTests('planner')
process.exit(code)
