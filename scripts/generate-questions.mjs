// ============================================================
// 题库生成脚本：遍历知识图谱 → 调 DeepSeek → 输出 JSON
// W2 第一步（8/6-8/8）
// ============================================================
// 用法：
//   node scripts/generate-questions.mjs --subject "半导体物理" --count 2 --output /tmp/half.json
//   node scripts/generate-questions.mjs --all --output /tmp/all.json
//
// 环境变量：
//   LLM_API_KEY 或 DEEPSEEK_API_KEY（向后兼容）
//   LLM_BASE_URL（默认 https://api.deepseek.com/v1）
//   LLM_MODEL（默认 deepseek-chat）
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SUBJECTS, expandAll } from './lib/knowledge-map.mjs';
import { validateBatch, normalize } from './lib/validate-question.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- LLM 配置（复用 api/llm-provider.js 的思路）---
const API_KEY = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY;
const BASE_URL = process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1';
const MODEL = process.env.LLM_MODEL || 'deepseek-chat';

if (!API_KEY) {
  console.error('ERROR: LLM_API_KEY or DEEPSEEK_API_KEY not set');
  process.exit(1);
}

// --- 参数解析 ---
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { count: 2, subject: null, all: false, output: null, kp: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--subject') opts.subject = args[++i];
    else if (args[i] === '--count') opts.count = parseInt(args[++i], 10);
    else if (args[i] === '--all') opts.all = true;
    else if (args[i] === '--kp') opts.kp = args[++i];
    else if (args[i] === '--output') opts.output = args[++i];
  }
  return opts;
}

// --- Prompt 构造 ---
function buildPrompt(subject, knowledgePoint, count) {
  return `你是一位半导体/微电子方向的资深考研出题专家。请为「${subject}」学科的「${knowledgePoint}」知识点生成 ${count} 道练习题。

# 输出格式（严格遵守）

返回一个 JSON 数组，每个元素是一道题，结构如下：

\`\`\`json
[
  {
    "stem": "题干（清晰描述场景，10-300 字）",
    "type": "choice" | "fill" | "essay",
    "options": { "A": "...", "B": "...", "C": "...", "D": "..." },  // 仅 choice
    "answer": "B" | "填空答案文本" | "论述要点",
    "explanation": "逐步解析，30-200 字",
    "knowledge_tags": ["${knowledgePoint}", "相关知识点2"],
    "difficulty_label": "basic" | "intermediate" | "advanced",
    "common_mistakes": ["常见错误1", "常见错误2"]
  }
]
\`\`\`

# 难度分布建议
- basic（约 30%）：概念辨析、公式直接套用
- intermediate（约 50%）：需要推理、多步计算
- advanced（约 20%）：综合应用、跨知识点

# 注意事项
1. 选择题必须有 4 个选项，答案明确指向正确选项
2. 填空题答案应简洁（数字/公式/术语）
3. 论述题答案应是结构化要点，不是长段文字
4. 解析必须包含关键公式或推理步骤
5. 题干场景应贴近半导体/微电子考研真题风格
6. 不得使用「下列哪项正确」等过于宽泛的提问

只输出 JSON 数组，不要任何其他文字。`;
}

// --- 调 DeepSeek API ---
async function callLLM(prompt) {
  const url = `${BASE_URL}/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: '你是考研题目生成专家，输出严格 JSON。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`LLM API ${resp.status}: ${err.slice(0, 200)}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM returned empty content');
  return content;
}

// --- 从 LLM 响应提取 JSON 数组 ---
function extractQuestions(content) {
  // 尝试直接解析为数组
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
    // 如果是对象，寻找 questions 字段
    if (parsed.questions && Array.isArray(parsed.questions)) return parsed.questions;
  } catch { /* fall through */ }
  // 尝试从 ```json ... ``` 代码块提取
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.questions) return parsed.questions;
    } catch { /* fall through */ }
  }
  // 尝试找第一个 [ 到最后一个 ]
  const first = content.indexOf('[');
  const last = content.lastIndexOf(']');
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(content.slice(first, last + 1));
    } catch { /* fall through */ }
  }
  throw new Error('Could not extract JSON array from LLM response');
}

// --- 主流程：生成单个 (subject, kp) 配对 ---
async function generateOne(subject, knowledgePoint, count) {
  const prompt = buildPrompt(subject, knowledgePoint, count);
  const content = await callLLM(prompt);
  const rawQuestions = extractQuestions(content);
  const { valid, rejected, duplicates, stats } = validateBatch(rawQuestions);
  const rows = valid.map((q) => normalize(q, subject, knowledgePoint));
  return { subject, knowledge_point: knowledgePoint, rows, stats, rejected, duplicates };
}

// --- 批量生成：限速 + 进度 ---
async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function generateBatch(pairs, countPerKP, delayMs = 2000) {
  const results = [];
  const allRows = [];
  const allRejected = [];
  for (let i = 0; i < pairs.length; i++) {
    const { subject, knowledge_point } = pairs[i];
    process.stdout.write(`[${i + 1}/${pairs.length}] ${subject} · ${knowledge_point}...`);
    try {
      const { rows, stats, rejected } = await generateOne(subject, knowledge_point, countPerKP);
      results.push({ subject, knowledge_point, stats });
      allRows.push(...rows);
      allRejected.push(...rejected);
      process.stdout.write(` ✓ valid=${stats.valid}/${stats.total} rejected=${stats.rejected}\n`);
    } catch (err) {
      process.stdout.write(` ✗ ERROR: ${err.message}\n`);
    }
    if (i < pairs.length - 1) await sleep(delayMs);
  }
  return { results, allRows, allRejected };
}

// --- 入口 ---
async function main() {
  const opts = parseArgs();
  console.log('=== Question Generation ===');
  console.log('Config:', { model: MODEL, baseUrl: BASE_URL, count: opts.count });

  let pairs;
  if (opts.all) {
    pairs = expandAll();
    console.log(`Mode: ALL, ${pairs.length} (subject, kp) pairs × ${opts.count} = target ${pairs.length * opts.count} questions`);
  } else if (opts.subject) {
    const subj = SUBJECTS[opts.subject];
    if (!subj) {
      console.error(`Unknown subject: ${opts.subject}`);
      console.error(`Available: ${Object.keys(SUBJECTS).join(', ')}`);
      process.exit(1);
    }
    if (opts.kp) {
      pairs = [{ subject: opts.subject, knowledge_point: opts.kp }];
    } else {
      pairs = subj.knowledge_points.map((kp) => ({ subject: opts.subject, knowledge_point: kp }));
    }
    console.log(`Mode: subject=${opts.subject}, ${pairs.length} kp × ${opts.count}`);
  } else {
    console.error('Usage: --subject "X" [--kp "Y"] | --all');
    process.exit(1);
  }

  const { results, allRows, allRejected } = await generateBatch(pairs, opts.count);

  // 汇总
  const totalValid = allRows.length;
  const totalRejected = allRejected.length;
  console.log('\n=== Summary ===');
  console.log(`Total raw attempted: ${results.reduce((s, r) => s + r.stats.total, 0)}`);
  console.log(`Total valid: ${totalValid}`);
  console.log(`Total rejected: ${totalRejected}`);

  // 写入输出
  const output = {
    generated_at: new Date().toISOString(),
    model: MODEL,
    config: { count_per_kp: opts.count, subjects: [...new Set(pairs.map((p) => p.subject))] },
    rows: allRows,
    rejected: allRejected,
    per_kp_stats: results,
  };

  if (opts.output) {
    fs.writeFileSync(opts.output, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`Written to ${opts.output} (${allRows.length} rows)`);
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
