-- ============================================================
-- Migration 005: derivation_history 表（B2 · AI 白板推导历史）
-- ============================================================
-- 在 Supabase Dashboard → SQL Editor 手动执行
-- ============================================================

CREATE TABLE IF NOT EXISTS derivation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  knowledge_point TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引：按用户+时间倒序查询
CREATE INDEX IF NOT EXISTS idx_derivation_history_user_time
  ON derivation_history(user_id, created_at DESC);

-- RLS：用户只能读写自己的推导历史
ALTER TABLE derivation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "用户读自己的推导历史"
  ON derivation_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "用户插入自己的推导历史"
  ON derivation_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户删除自己的推导历史"
  ON derivation_history FOR DELETE
  USING (auth.uid() = user_id);
