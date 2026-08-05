// ============================================================
// 题目校验器：JSON Schema + 去重指纹
// W2 题库生成管线的质量门
// ============================================================
// 功能：
//   1. validateQuestion(q) — 校验单题字段完整性、答案格式
//   2. computeContentHash(q) — SHA256(stem + answer + options) 唯一指纹
//   3. validateBatch(questions) — 批量校验 + 去重
//   4. mapDifficulty(label) — basic/intermediate/advanced → 1-5
// ============================================================

import crypto from 'crypto';

// 难度标签 → 1-5 数字
const DIFFICULTY_MAP = {
  basic: 2,
  intermediate: 3,
  advanced: 4,
  expert: 5,
};

export function mapDifficulty(label) {
  return DIFFICULTY_MAP[label] || 3;
}

// 题型集合
const VALID_TYPES = new Set(['choice', 'fill', 'essay']);

// 单题校验：返回 { valid: boolean, errors: string[] }
export function validateQuestion(q) {
  const errors = [];
  if (!q || typeof q !== 'object') {
    return { valid: false, errors: ['not an object'] };
  }
  if (!q.stem || typeof q.stem !== 'string' || q.stem.trim().length < 10) {
    errors.push('stem missing or too short (<10 chars)');
  }
  if (!q.type || !VALID_TYPES.has(q.type)) {
    errors.push(`type invalid: ${q.type} (must be choice/fill/essay)`);
  }
  if (q.type === 'choice') {
    if (!q.options || typeof q.options !== 'object') {
      errors.push('choice requires options object');
    } else {
      const keys = Object.keys(q.options);
      if (keys.length < 2) {
        errors.push(`choice requires ≥2 options, got ${keys.length}`);
      }
      if (!q.answer || !keys.includes(q.answer)) {
        errors.push(`choice answer "${q.answer}" not in options [${keys.join(',')}]`);
      }
    }
  } else if (q.type === 'fill' || q.type === 'essay') {
    if (!q.answer || typeof q.answer !== 'string' || q.answer.trim().length === 0) {
      errors.push(`${q.type} requires non-empty answer string`);
    }
  }
  if (!q.explanation || typeof q.explanation !== 'string' || q.explanation.trim().length < 10) {
    errors.push('explanation missing or too short (<10 chars)');
  }
  if (q.difficulty_label && !DIFFICULTY_MAP[q.difficulty_label]) {
    errors.push(`unknown difficulty_label: ${q.difficulty_label}`);
  }
  if (q.knowledge_tags && !Array.isArray(q.knowledge_tags)) {
    errors.push('knowledge_tags must be array');
  }
  return { valid: errors.length === 0, errors };
}

// 内容指纹：去重核心（基于题干 + 答案 + 选项内容）
export function computeContentHash(q) {
  const parts = [q.stem || '', q.answer || ''];
  if (q.options && typeof q.options === 'object') {
    parts.push(JSON.stringify(q.options, Object.keys(q.options).sort()));
  }
  return crypto.createHash('sha256').update(parts.join('||')).digest('hex');
}

// 标准化：LLM 返回的题目 → 符合 DB schema 的行对象
export function normalize(rawQ, subject, knowledgePoint) {
  const normalized = {
    subject,
    knowledge_point: knowledgePoint,
    question_type: rawQ.type,
    difficulty: mapDifficulty(rawQ.difficulty_label),
    content: {
      stem: rawQ.stem,
      type: rawQ.type,
      options: rawQ.options || null,
      answer: rawQ.answer,
      explanation: rawQ.explanation,
      knowledge_tags: rawQ.knowledge_tags || [knowledgePoint],
      difficulty_label: rawQ.difficulty_label || 'intermediate',
      common_mistakes: rawQ.common_mistakes || [],
    },
    source: 'llm',
    status: 'draft',
    is_demo: false,
  };
  normalized.content_hash = computeContentHash(normalized.content);
  return normalized;
}

// 批量校验 + 去重
export function validateBatch(questions) {
  const seen = new Set();
  const valid = [];
  const rejected = [];
  const duplicates = [];
  for (const q of questions) {
    const { valid: ok, errors } = validateQuestion(q);
    if (!ok) {
      rejected.push({ question: q, errors });
      continue;
    }
    const hash = computeContentHash(q);
    if (seen.has(hash)) {
      duplicates.push({ question: q, hash });
      continue;
    }
    seen.add(hash);
    valid.push({ ...q, _hash: hash });
  }
  return { valid, rejected, duplicates, stats: {
    total: questions.length,
    valid: valid.length,
    rejected: rejected.length,
    duplicates: duplicates.length,
  }};
}
