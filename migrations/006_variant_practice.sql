-- ============================================================
-- B3 Migration 006: 变式题练习 — question_attempts 扩展字段
-- 需在 Supabase Dashboard → SQL Editor 手动执行
-- ============================================================

-- 1. 添加变式题相关字段到 question_attempts 表
ALTER TABLE question_attempts
  ADD COLUMN IF NOT EXISTS is_variant BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS variant_stem TEXT,
  ADD COLUMN IF NOT EXISTS variant_correct_answer TEXT;

-- 2. 创建 increment_wrong_count RPC（如果不存在）
-- 用于变式题答错时递增错题计数
CREATE OR REPLACE FUNCTION increment_wrong_count(
  p_question_id UUID,
  p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE wrong_book_entries
  SET wrong_count = wrong_count + 1,
      last_seen_at = NOW()
  WHERE question_id = p_question_id
    AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- 3. 注释
COMMENT ON COLUMN question_attempts.is_variant IS 'B3: 是否为变式题练习';
COMMENT ON COLUMN question_attempts.variant_stem IS 'B3: 变式题题干';
COMMENT ON COLUMN question_attempts.variant_correct_answer IS 'B3: 变式题正确答案';
