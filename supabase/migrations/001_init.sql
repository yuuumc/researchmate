-- ============================================================
-- 研芯通 v2.0 — Supabase 初始化迁移（9 表 + RLS 全启 + 注册触发器）
-- ============================================================
-- 来源：技术架构方案 v2.1 第三章（3.1-3.4）+ 第十一章 11.2 RLS 设计 + 第四章 4.1 注册触发器
-- 执行方式：Supabase Dashboard → SQL Editor → 整段粘贴执行（幂等：DROP IF EXISTS 兜底）
-- 双通道：前端 anon key 走 RLS 鉴权；后端 Serverless 用 SUPABASE_SERVICE_ROLE_KEY 绕过 RLS
-- ============================================================

-- ============================================================
-- 0. 扩展
-- ============================================================
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ============================================================
-- 1. profiles — 用户画像（3 步向导数据）
-- ============================================================
drop table if exists profiles cascade;
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Step 1 基础信息
  nickname text,
  avatar_url text,
  -- Step 2 学情自评
  target_school text not null,
  target_major text not null,          -- 半导体物理/微电子器件/集成电路设计
  exam_year int default 2027,
  mastered_skills jsonb default '[]',  -- 已掌握知识点
  weak_points jsonb default '[]',      -- 薄弱知识点
  self_assessment jsonb default '{}',  -- 各科自评 1-5 星
  -- Step 3 备考设置
  exam_date date,
  weekly_hours int default 20,
  -- 元数据
  is_demo boolean default false,
  wizard_completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table profiles enable row level security;
create policy profiles_owner on profiles
  for all using (auth.uid() = user_id);

-- ============================================================
-- 2. questions — 题库（客观/主观、科目、难度、来源）
-- ============================================================
drop table if exists questions cascade;
create table questions (
  id uuid primary key default gen_random_uuid(),
  subject text not null,              -- 半导体物理/微电子器件/数字IC/模拟IC/固态物理
  knowledge_point text not null,      -- 知识点标签
  question_type text not null check (question_type in ('choice','fill','essay')),
  difficulty int check (difficulty between 1 and 5),
  content jsonb not null,             -- 题干+选项+答案+解析
  source text default 'llm' check (source in ('llm','curated','reference')),
  status text default 'draft' check (status in ('draft','reviewed','published')),
  content_hash text unique,           -- 去重指纹 SHA256(content)
  created_by uuid references auth.users(id),
  is_demo boolean default false,
  created_at timestamptz default now()
);
alter table questions enable row level security;
-- published 题目所有登录用户可读；写操作仅创建者
create policy questions_read on questions for select
  using (status = 'published' and auth.uid() is not null);
create policy questions_write on questions for all
  using (auth.uid() = created_by);

-- ============================================================
-- 3. diagnoses — 诊断记录 + structured JSON
-- ============================================================
drop table if exists diagnoses cascade;
create table diagnoses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  structured jsonb default '{}',      -- 10 字段 Schema（含 4 层因果链）
  score int,
  created_at timestamptz default now()
);
alter table diagnoses enable row level security;
create policy diagnoses_owner on diagnoses
  for all using (auth.uid() = user_id);

-- ============================================================
-- 4. question_attempts — 做题记录 + 批改结果
-- ============================================================
drop table if exists question_attempts cascade;
create table question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid references questions(id) on delete set null,
  answer jsonb,                       -- 学生作答
  is_correct boolean,
  score int,
  feedback jsonb,                     -- 批改反馈
  created_at timestamptz default now()
);
alter table question_attempts enable row level security;
create policy question_attempts_owner on question_attempts
  for all using (auth.uid() = user_id);

-- ============================================================
-- 5. plans — 备考计划 + structured JSON
-- ============================================================
drop table if exists plans cascade;
create table plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  structured jsonb default '{}',
  active boolean default true,
  created_at timestamptz default now()
);
alter table plans enable row level security;
create policy plans_owner on plans
  for all using (auth.uid() = user_id);

-- ============================================================
-- 6. plan_progress — 周进度打卡
-- ============================================================
drop table if exists plan_progress cascade;
create table plan_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references plans(id) on delete cascade,
  week_num int not null,
  completed_tasks jsonb default '[]',
  checked_at timestamptz default now()
);
alter table plan_progress enable row level security;
create policy plan_progress_owner on plan_progress
  for all using (auth.uid() = user_id);

-- ============================================================
-- 7. arxiv_cache — arXiv 检索结果 24h 缓存
-- ============================================================
-- 公共读（登录用户可读）；写入仅后端 service_role（无用户写 Policy）
drop table if exists arxiv_cache;
create table arxiv_cache (
  query_hash text primary key,        -- SHA256(query+category)
  result jsonb,                       -- 解析后的 arXiv 结果（Atom XML → JSON）
  cached_at timestamptz default now()
);
alter table arxiv_cache enable row level security;
create policy arxiv_cache_read on arxiv_cache for select
  using (auth.uid() is not null);
-- 注意：无 INSERT/UPDATE Policy → 前端 anon key 写不进；
-- 后端 SUPABASE_SERVICE_ROLE_KEY 绕过 RLS 写入（11.2 双通道设计）

-- ============================================================
-- 8. paper_favorites — 论文收藏
-- ============================================================
drop table if exists paper_favorites cascade;
create table paper_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  arxiv_id text not null,
  title text,
  abstract text,
  saved_at timestamptz default now(),
  unique (user_id, arxiv_id)
);
alter table paper_favorites enable row level security;
create policy paper_favorites_owner on paper_favorites
  for all using (auth.uid() = user_id);

-- ============================================================
-- 9. wrong_book_entries — 错题本
-- ============================================================
drop table if exists wrong_book_entries cascade;
create table wrong_book_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid references questions(id) on delete set null,
  attempt_id uuid references question_attempts(id) on delete set null,
  wrong_count int default 1,
  last_wrong_at timestamptz default now(),
  unique (user_id, question_id)
);
alter table wrong_book_entries enable row level security;
create policy wrong_book_entries_owner on wrong_book_entries
  for all using (auth.uid() = user_id);

-- ============================================================
-- 10. 注册触发器 — auth.users → profiles 空行
-- ============================================================
-- 新用户注册后自动插入 profiles 空行（wizard_completed=false）
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (user_id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- 11. updated_at 自动维护（profiles）
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- ============================================================
-- 完成：9 表 + 9 组 RLS Policy + 注册触发器 + updated_at 触发器
-- ============================================================
