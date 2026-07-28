// ============================================================
// Tutor Prompt 静态单测（v1.5 评审保命 P1）
// ============================================================
// 验收：
//   - 14 个样本（12 正常 + 2 对抗）
//   - 静态校验：JSON 不强制（tutor 输出 Markdown），但必填短语齐
//   - 危险片段（<script> / eval() / Function() / on*= 等）必须 0 命中
//   - 拼 prompt 前 sanitize（防 prompt 注入）
//
// 用法：node scripts/test-tutor-prompt.mjs
// ============================================================

import { runAgentTests } from './lib/promptRunner.mjs'

const code = runAgentTests('tutor')
process.exit(code)
