-- ============================================================
-- 研芯通 F1 画像引擎地基 — profiles 表 knowledge_state 列（007）
-- ============================================================
-- 背景：F1 画像引擎地基（精简版）。profiles 表目前只有 ability_stars
--   （1-5 星粗粒度），缺少每知识点的多维掌握状态。本迁移新增
--   knowledge_state JSONB 列，结构为 { [topic]: KnowledgeState }，
--   KnowledgeState = {
--     mastery:      0-100  掌握度（经遗忘衰减 + 题型加权 + 置信度因子维护）
--     confidence:   0-1    置信度（样本量越大越高，单次学习影响幅度越小）
--     lastStudied:  ISO    最后学习时间（遗忘衰减基准）
--     attempts:     int    累计作答次数
--     correctRate:  0-1    累计正确率
--     errorTypes:   { [type]: int }  错误类型计数（choice/fill/essay/derivation）
--   }
-- 五维模型仅落三维：知识状态（本列）+ 能力（ability_stars 沿用）
--   + 目标约束（target_school/target_major/exam_date 沿用）；
--   行为指纹 / 认知风格不建（数据积累不足，赛后迭代）。
-- 执行方式：Supabase Dashboard -> SQL Editor -> 整段粘贴 Run（幂等：IF NOT EXISTS）
-- ============================================================

alter table profiles add column if not exists knowledge_state jsonb default '{}';

-- 验证：
-- select column_name, data_type from information_schema.columns
--   where table_name='profiles' and column_name='knowledge_state';
