// ============================================================
// Diagnose Prompt 静态单测（v1.5 评审保命 P1）
// ============================================================
// 验收：
//   - 12 个样本（11 正常 + 1 对抗）
//   - 静态校验：JSON 必填字段（score/subject/weak_points/direct_causes/
//     middle_causes/root_causes/remediation）必须在 prompt 中声明
//   - 必填短语（4 层根因链 / JSON 块 / remediation）齐
//   - 危险片段 0 命中
//
// 用法：node scripts/test-diagnose-prompt.mjs
// ============================================================

import { runAgentTests } from './lib/promptRunner.mjs'

const code = runAgentTests('diagnose')
process.exit(code)
