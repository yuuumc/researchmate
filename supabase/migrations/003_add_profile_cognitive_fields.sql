-- ============================================================
-- 研芯通 v2.0 — profiles 表认知模型字段补列（P0 修复 · 003）
-- ============================================================
-- 背景：profileStore 实际 upsert 的认知字段（ability_stars / weak_topics /
--   mastered_topics / last_diagnosis_score / last_diagnosis_date / name /
--   preparation_stage / learning_style / major / target_direction / phone / role）
--   在 001_init.sql 中未建列 -> saveProfile upsert 一直 400 (PGRST204) 被
--   _pushToCloud 静默吞掉，星级 / 诊断分等只活在浏览器 localStorage，
--   换设备登录学生画像页为空。
-- 执行方式：Supabase Dashboard -> SQL Editor -> 整段粘贴 Run（幂等：IF NOT EXISTS）
-- ============================================================

alter table profiles add column if not exists ability_stars jsonb default '{}';
alter table profiles add column if not exists weak_topics jsonb default '[]';
alter table profiles add column if not exists mastered_topics jsonb default '[]';
alter table profiles add column if not exists last_diagnosis_score int;
alter table profiles add column if not exists last_diagnosis_date timestamptz;
alter table profiles add column if not exists name text;
alter table profiles add column if not exists preparation_stage text default 'initial';
alter table profiles add column if not exists learning_style text default 'mixed';
-- 额外对齐 profileStore.bindAuthUser / setIdentity 实际 upsert 的字段
alter table profiles add column if not exists major text;
alter table profiles add column if not exists target_direction text;
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists role text;

-- 验证：select column_name, data_type from information_schema.columns
--       where table_name='profiles' order by ordinal_position;
