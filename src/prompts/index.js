// ============================================================
// Prompt 模板统一导出（用 Vite 的 ?raw 后缀导入 .md 文件）
// ============================================================
// 优势：编辑 .md 文件时有语法高亮，避免在 .js 里写多行字符串
// ============================================================

import tutorRaw from './tutor.md?raw'
import diagnoseRaw from './diagnose.md?raw'
import plannerRaw from './planner.md?raw'
import admissionRaw from './admission.md?raw'
import researchRaw from './research.md?raw'

export const TUTOR_PROMPT = tutorRaw
export const DIAGNOSE_PROMPT = diagnoseRaw
export const PLANNER_PROMPT = plannerRaw
export const ADMISSION_PROMPT = admissionRaw
export const RESEARCH_PROMPT = researchRaw
