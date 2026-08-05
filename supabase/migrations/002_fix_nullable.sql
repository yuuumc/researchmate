-- ============================================================
-- 研芯通 v2.0 — 修复：profiles 表 NOT NULL 约束阻止注册触发器
-- ============================================================
-- 问题：001_init.sql 中 target_school/target_major 设为 NOT NULL，
--       但 handle_new_user() 触发器只插入 user_id → 违反约束 → 注册 500
-- 修复：将 target_school/target_major 改为 nullable，
--       wizard_completed=false 期间允许空值，向导完成后由应用层保证非空
-- ============================================================

alter table profiles alter column target_school drop not null;
alter table profiles alter column target_major drop not null;

-- 验证：注册新用户后 profiles 应自动出现空行（user_id 填充，其余为 NULL）
