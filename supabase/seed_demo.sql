-- ============================================================
-- 研芯通 v2.0 — 演示账号 seed 脚本（框架，真实数据 W4 填充）
-- ============================================================
-- 对齐 PRD 第七章「李同学」方案 + 技术架构方案 4.3。
-- 用法：Supabase Dashboard → SQL Editor 执行（在 001_init.sql 之后）。
-- 设计：演示数据由真实流程产出后导出为 seed，保证与产品逻辑一致；
--       演示账号 is_demo=true，RLS 逻辑统一（不放开跨用户读）。
--
-- ⚠️ 本文件目前为框架占位：表结构对齐 + is_demo 标记 + 李同学人设占位。
--    W4 联调阶段用真实流程跑通后导出数据替换占位行。
-- ============================================================

-- ============================================================
-- 0. 演示用户（需先在 Supabase Auth 创建对应账号，此处仅 seed profiles 及关联数据）
-- ============================================================
-- 演示账号凭证（W4 在 Supabase Auth 创建后填入）：
--   email: demo@researchmate.example  password: <W4 设定>
-- 占位 user_id：用 auth.users 创建后回填的 UUID 替换 'DEMO_USER_UUID'

-- ============================================================
-- 1. profiles — 李同学画像（占位，W4 用真实向导产出数据替换）
-- ============================================================
insert into profiles (
  user_id, nickname, avatar_url,
  target_school, target_major, exam_year,
  mastered_skills, weak_points, self_assessment,
  exam_date, weekly_hours,
  is_demo, wizard_completed
) values (
  'DEMO_USER_UUID',                       -- ⚠️ W4 替换为真实 auth.users.id
  '李同学',
  null,
  '东南大学',                              -- 目标院校（半导体/微电子强校示例）
  '集成电路设计',                           -- 目标专业
  2027,
  '["PN结原理","MOSFET基础"]'::jsonb,      -- 已掌握知识点（占位）
  '["CMOS模拟设计","锁相环"]'::jsonb,      -- 薄弱知识点（占位）
  '{"半导体物理":4,"微电子器件":3,"集成电路设计":2}'::jsonb,  -- 各科自评 1-5 星
  '2026-12-21'::date,                      -- 考试日期（占位）
  25,                                      -- 每周学习时长
  true,                                    -- is_demo 标记
  true                                     -- 向导已完成
) on conflict (user_id) do nothing;

-- ============================================================
-- 2. diagnoses — 李同学诊断记录（占位，W4 用真实诊断 Agent 产出替换）
-- ============================================================
-- structured 字段对齐 diagnose Prompt v3.2.0 的 10 字段 Schema（含 4 层因果链）
insert into diagnoses (user_id, structured, score) values (
  'DEMO_USER_UUID',
  '{}'::jsonb,                             -- ⚠️ W4 填入真实诊断 structured JSON
  null
) on conflict do nothing;

-- ============================================================
-- 3. plans — 李同学备考计划（占位）
-- ============================================================
insert into plans (user_id, structured, active) values (
  'DEMO_USER_UUID',
  '{}'::jsonb,                             -- ⚠️ W4 填入真实规划 structured JSON
  true
) on conflict do nothing;

-- ============================================================
-- 4. question_attempts — 李同学做题记录（占位，需先 seed questions）
-- ============================================================
-- W4 流程：seed 若干 published 题目 → 插入 attempts → 错题自动进 wrong_book_entries
-- 此处暂留占位注释，待题库 seed 后补

-- ============================================================
-- 5. wrong_book_entries — 李同学错题本（占位）
-- ============================================================
-- W4 由练习批改闭环真实产出后导出

-- ============================================================
-- 说明：arxiv_cache / paper_favorites / plan_progress 无需 demo seed
-- ============================================================
