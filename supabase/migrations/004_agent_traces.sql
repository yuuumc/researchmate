-- ============================================================
-- 004 — agent_traces 表（B5 多 Agent 架构看板数据源）
-- ============================================================
-- 用途：记录每次 Agent 调用的真实 trace（角色/动作/输入摘要/输出摘要/
--   工具调用链/token 用量/状态），供 /architecture 看板只读展示。
-- 数据来源：前端 callAgent / callResearchAgent 返回后客户端写入（RLS owner）。
-- 鉴权：RLS — 用户只能读写自己的行（auth.uid() = user_id）。
-- 执行方式：Supabase Dashboard → SQL Editor → 整段粘贴执行（幂等）。
-- ============================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()

create table if not exists agent_traces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_role text not null,                      -- diagnose/tutor/plan/practice/career/research/peer/router
  action text,                                   -- 调用动作
  input_summary text,                            -- 输入摘要
  output_summary text,                           -- 输出摘要（含产出物链接则可点击）
  tool_calls_trace jsonb default '[]'::jsonb,    -- 工具调用数组（research-agent 已有此结构）
  usage jsonb,                                   -- token 用量
  status text default 'done',                    -- done / error / running
  created_at timestamptz default now()
);

alter table agent_traces enable row level security;

-- owner 策略：用户只能读 / 写自己的行
drop policy if exists agent_traces_owner on agent_traces;
create policy agent_traces_owner on agent_traces
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 按用户 + 时间倒序查询的索引（看板 GET 主路径）
create index if not exists agent_traces_user_created_idx
  on agent_traces (user_id, created_at desc);

-- ============================================================
-- 完成：1 表 + RLS owner 策略 + 查询索引
-- ============================================================
