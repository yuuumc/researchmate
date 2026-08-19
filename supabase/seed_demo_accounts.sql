-- ============================================================
-- 研芯通 v2.0 — 演示账号预置 seed（C6 实现侧）
-- ============================================================
-- 对齐产品口径：Phase C 产品侧交付 Part 1（docx RRnpdsPUPoGgovx0sMSc8nc6nUc）
--   三档 80/57/31 梯度 + 优势/薄弱 9/3、3/5、4/9
--   Account B（中等生 57 分）= 5 分钟主演示账号
--   MOSFET I-V 锁为 Account B「故意做错」目标题
--   demo 账号独立邮箱前缀 demo-a/b/c，与 xueba/zhongdeng/chasheng 真实画像隔离
--
-- 用法（一键重置 demo 态）：
--   1) 一次性建账号：Supabase Dashboard → Authentication → Users → Add user
--      demo-a@yanxintong-test.com / demo-b@yanxintong-test.com / demo-c@yanxintong-test.com
--      密码自定（建议 Demo1234!），勾选 Auto Confirm。
--   2) 把下面三个 :DEMO_A_UUID / :DEMO_B_UUID / :DEMO_C_UUID 替换为对应 user UUID
--      （SQL Editor 用 pgbinding 变量，或直接把字符串替换进去）。
--   3) Dashboard → SQL Editor → 整段粘贴 Run。幂等：先按 user_id 清 demo 态再重灌。
--   4) 录制前复跑一次即可复现 80/57/31 梯度 + 9/3、3/5、4/9 优势薄弱点。
--
-- B6 每日学习路径（dailyPath）存浏览器 localStorage、由 B6 引擎按 profile 现算，
--   demo 账号登录后进 HomeView 即自动重生成，无需 seed。
-- ============================================================

-- ↓↓↓ 把这三个 UUID 替换成你在 Auth 建好的 demo 账号 UUID ↓↓↓
-- :DEMO_A_UUID  学霸（80 分 · advanced）
-- :DEMO_B_UUID  中等生（57 分 · intermediate · 主演示账号）
-- :DEMO_C_UUID  基础薄弱生（31 分 · foundational）


-- ============================================================
-- 0. demo 锚点题（is_demo=true，published，供 attempts/wrong_book 挂载）
--    每个知识点 1 道选择题；content_hash 用 md5(知识点的稳定串) 预算，保证 ON CONFLICT 幂等
--    且能被 (knowledge_point, is_demo, question_type) 唯一子查询定位。
-- ============================================================
insert into questions (subject, knowledge_point, question_type, difficulty, content, source, status, is_demo, content_hash)
select subject, knowledge_point, question_type, difficulty, content, source, status, is_demo,
       md5(subject || '|' || knowledge_point || '|' || question_type)
from (values
  ('微电子器件','MOSFET I-V','choice',3, jsonb_build_object('stem','NMOS 饱和区漏电流表达式正确的是？','options',jsonb_build_array('A. ½μnCox(W/L)(VGS-Vth)²','B. μnCox(VGS-Vth)','C. ½μnCox(VGS-Vth)','D. (VGS-Vth)²'),'answer','B','explanation','饱和区 ID=½μnCox(W/L)(VGS-Vth)²(1+λVDS)，核心是过驱动电压平方关系。'),'curated','published',true),
  ('半导体物理','光学性质','choice',3, jsonb_build_object('stem','直接带隙半导体（如 GaAs）本征吸收的特点？','options',jsonb_build_array('A. 需声子参与','B. 导带底价带顶同 k，无需声子','C. 吸收系数小','D. 只能间接跃迁'),'answer','B','explanation','直接带隙导带底与价带顶在 k 空间同位置，跃迁无需声子，吸收系数大。'),'curated','published',true),
  ('模拟IC','单级放大器','choice',4, jsonb_build_object('stem','共源极放大器增大 RD（晶体管仍在饱和区），电压增益 |Av|=gm·RD？','options',jsonb_build_array('A. 减小','B. 增大','C. 输入电阻增大','D. 不变'),'answer','B','explanation','|Av|=gm·RD，增大 RD 使增益增大，但工作点与带宽受影响。'),'curated','published',true),
  ('数字IC','CMOS 时序','choice',3, jsonb_build_object('stem','CMOS 静态时序分析中，建立时间余量 = ？','options',jsonb_build_array('A. 数据到达时间 - 时钟到达时间','B. 要求时间 - 数据到达时间','C. 时钟周期 - 数据延迟','D. 保持时间 + 偏斜'),'answer','B','explanation','建立余量 = 要求到达时间 − 实际数据到达时间，为正则满足。'),'curated','published',true),
  ('固态物理','超导 BCS','choice',4, jsonb_build_object('stem','BCS 理论中库珀对由哪两类粒子配对？','options',jsonb_build_array('A. 电子-空穴','B. 动量相反、自旋相反的电子','C. 电子-声子','D. 质子-电子'),'answer','B','explanation','库珀对=动量相反且自旋相反的两个电子，经声子中介形成。'),'curated','published',true),
  ('固态物理','晶体学','choice',3, jsonb_build_object('stem','面心立方（FCC）晶胞含几个格点？','options',jsonb_build_array('A. 1','B. 2','C. 4','D. 8'),'answer','C','explanation','FCC：8 个角各 1/8 + 6 个面心各 1/2 = 1+3 = 4 个格点。'),'curated','published',true),
  ('数字IC','CMOS 反相器','choice',3, jsonb_build_object('stem','理想 CMOS 反相器在输入介于逻辑电平之间时，静态功耗主要来自？','options',jsonb_build_array('A. 亚阈值漏电','B. 翻转瞬间双管同时导通的短路电流','C. 负载电容充放电','D. 串联电阻'),'answer','B','explanation','输入在阈值附近时 PMOS/NMOS 同时导通形成直流通路，产生短路功耗。'),'curated','published',true),
  ('微电子器件','MOSFET 电容','choice',4, jsonb_build_object('stem','MOS 电容积累区对应：','options',jsonb_build_array('A. 表面反型，多数载流子耗尽','B. 表面多数载流子堆积','C. 表面本征','D. 强反型'),'answer','B','explanation','积累区=栅压使多数载流子在表面堆积，C≈Cox。'),'curated','published',true),
  ('模拟IC','频率响应/Miller 效应','choice',4, jsonb_build_object('stem','密勒效应使共源放大器输入电容：','options',jsonb_build_array('A. 减小为 Cgd','B. 放大为 Cgd(1+|Av|)','C. 不变','D. 放大为 Cgd·Av'),'answer','B','explanation','反馈电容 Cgd 在输入侧等效为 Cgd(1−A)，共源 Av 为负→放大为 Cgd(1+|Av|)。'),'curated','published',true),
  ('半导体物理','PN 结/半导体物理基础','choice',3, jsonb_build_object('stem','PN 结正偏时势垒区：','options',jsonb_build_array('A. 变宽','B. 变窄','C. 不变','D. 消失'),'answer','B','explanation','正偏削弱内建电场，势垒区变窄，多子扩散增强形成正向电流。'),'curated','published',true),
  ('微电子器件','CMOS 反相器静态特性','choice',3, jsonb_build_object('stem','CMOS 反相器在输入等于 VDD/2 时的静态特性？','options',jsonb_build_array('A. 两管均截止','B. 两管均导通，短路电流最大','C. 仅 PMOS 导通','D. 仅 NMOS 导通'),'answer','B','explanation','输入 VDD/2 时 PMOS 和 NMOS 均处于导通态，形成直流通路，静态功耗最大。'),'curated','published',true),
  ('模拟IC','振荡器','choice',3, jsonb_build_object('stem','环形振荡器的振荡频率主要由什么决定？','options',jsonb_build_array('A. 电源电压','B. 级数和单级延迟','C. 负载电容','D. 温度'),'answer','B','explanation','环形振荡器频率由反相器级数 N 和单级传播延迟 tp 决定，f=1/(2N·tp)。'),'curated','published',true)
) as t(subject, knowledge_point, question_type, difficulty, content, source, status, is_demo)
on conflict (content_hash) do nothing;

-- content_hash 显式用 md5(subject|knowledge_point|question_type) 计算（001_init 无自动触发器）；
--   ON CONFLICT (content_hash) DO NOTHING 保证多次重跑幂等，不重复插入 demo 题。


-- ============================================================
-- 辅助：把三个 demo UUID 收进临时变量，后续统一引用
-- ============================================================
-- ⚠️ 替换下方三个字符串为真实 auth.users.id
-- （Dashboard → Authentication → Users 表里复制对应 demo 账号的 User UID）
--
-- 以下用 do $$ 块 + 变量，避免 psql 变量绑定差异；
-- 若你的 SQL Editor 不支持 do 块，可把变量替换为字面 UUID 内联。

do $$
declare
  v_a uuid := '__DEMO_A_UUID__';  -- 学霸
  v_b uuid := '__DEMO_B_UUID__';  -- 中等生（主演示）
  v_c uuid := '__DEMO_C_UUID__';  -- 基础薄弱生
begin
  -- ---------------------------------------------------------
  -- 0. 清 demo 态（幂等重置）：只动 demo 账号，不碰真实用户
  -- ---------------------------------------------------------
  delete from wrong_book_entries where user_id in (v_a, v_b, v_c);
  delete from question_attempts   where user_id in (v_a, v_b, v_c);
  delete from diagnoses           where user_id in (v_a, v_b, v_c);
  delete from plan_progress       where user_id in (v_a, v_b, v_c);
  delete from plans               where user_id in (v_a, v_b, v_c);
  -- profiles 留行（on conflict 更新），不删；auth.users 不动

  -- ============================================================
  -- 1. profiles — 三档认知画像（真实结构 + 预置值）
  -- ============================================================
  -- Account A · 学霸（80 分，9 强 / 3 弱，advanced）
  insert into profiles (
    user_id, nickname, target_major, exam_year, is_demo, wizard_completed,
    ability_stars, knowledge_state, weak_topics, mastered_topics,
    last_diagnosis_score, last_diagnosis_date, preparation_stage, learning_style
  ) values (
    v_a, '李学霸', '集成电路设计', 2027, true, true,
    -- 9 个 ≥4★ + 3 个 ≤2★（共 12 知识点，meanStar≈4.0 → advanced）
    '{"MOSFET I-V":5,"光学性质":4,"单级放大器":5,"CMOS 反相器":5,"超导 BCS":4,"晶体学":5,"MOSFET 电容":4,"频率响应/Miller":5,"PN 结/半导体物理基础":5,"CMOS 时序":2,"CMOS 反相器静态特性":2,"振荡器":2}'::jsonb,
    -- mastery 均值 ≈0.80（9 强知识点高 mastery，3 弱知识点低）
    '{"MOSFET I-V":{"mastery":0.95,"attempts":3,"correctRate":0.9},"光学性质":{"mastery":0.85,"attempts":2,"correctRate":0.8},"单级放大器":{"mastery":0.95},"CMOS 反相器":{"mastery":0.9},"超导 BCS":{"mastery":0.85},"晶体学":{"mastery":0.9},"MOSFET 电容":{"mastery":0.85},"频率响应/Miller":{"mastery":0.95},"PN 结/半导体物理基础":{"mastery":0.95},"CMOS 时序":{"mastery":0.3},"CMOS 反相器静态特性":{"mastery":0.2},"振荡器":{"mastery":0.25}}'::jsonb,
    '["CMOS 时序","CMOS 反相器静态特性","振荡器"]'::jsonb,                   -- 3 薄弱点
    '["MOSFET I-V","光学性质","单级放大器","CMOS 反相器","超导 BCS","晶体学","MOSFET 电容","频率响应/Miller","PN 结/半导体物理基础"]'::jsonb,  -- 9 已掌握
    80, now() - interval '2 days', 'breakthrough', 'self_directed'
  ) on conflict (user_id) do update set
      nickname=excluded.nickname, target_major=excluded.target_major, is_demo=true,
      wizard_completed=true, ability_stars=excluded.ability_stars,
      knowledge_state=excluded.knowledge_state, weak_topics=excluded.weak_topics,
      mastered_topics=excluded.mastered_topics, last_diagnosis_score=excluded.last_diagnosis_score,
      last_diagnosis_date=excluded.last_diagnosis_date, preparation_stage=excluded.preparation_stage,
      learning_style=excluded.learning_style, updated_at=now();

  -- Account B · 中等生（57 分，3 强 / 5 弱，intermediate · 主演示账号）
  insert into profiles (
    user_id, nickname, target_major, exam_year, is_demo, wizard_completed,
    ability_stars, knowledge_state, weak_topics, mastered_topics,
    last_diagnosis_score, last_diagnosis_date, preparation_stage, learning_style
  ) values (
    v_b, '李同学', '微电子科学与工程', 2027, true, true,
    -- 3 个 ≥4★ + 5 个 ≤2★ + 4 个 3★（共 12，meanStar≈2.67 → intermediate）
    '{"MOSFET I-V":2,"光学性质":1,"单级放大器":3,"CMOS 反相器":2,"超导 BCS":2,"晶体学":1,"MOSFET 电容":3,"PN 结/半导体物理基础":4,"CMOS 时序":3,"频率响应/Miller":3,"振荡器":4,"载流子输运":4}'::jsonb,
    -- mastery 均值 ≈0.50（3 强高，5 弱低）
    '{"MOSFET I-V":{"mastery":0.4,"attempts":2,"correctRate":0.4},"光学性质":{"mastery":0.3},"单级放大器":{"mastery":0.7},"CMOS 反相器":{"mastery":0.35},"超导 BCS":{"mastery":0.25},"晶体学":{"mastery":0.2},"MOSFET 电容":{"mastery":0.65},"PN 结/半导体物理基础":{"mastery":0.85},"CMOS 时序":{"mastery":0.45},"频率响应/Miller":{"mastery":0.35},"振荡器":{"mastery":0.8},"载流子输运":{"mastery":0.75}}'::jsonb,
    -- 5 薄弱点，MOSFET I-V 在列（演示「故意做错」目标题）
    '["MOSFET I-V","光学性质","CMOS 反相器","超导 BCS","晶体学"]'::jsonb,
    '["PN 结/半导体物理基础","振荡器","载流子输运"]'::jsonb,                 -- 3 已掌握
    57, now() - interval '2 days', 'consolidation', 'mixed'
  ) on conflict (user_id) do update set
      nickname=excluded.nickname, target_major=excluded.target_major, is_demo=true,
      wizard_completed=true, ability_stars=excluded.ability_stars,
      knowledge_state=excluded.knowledge_state, weak_topics=excluded.weak_topics,
      mastered_topics=excluded.mastered_topics, last_diagnosis_score=excluded.last_diagnosis_score,
      last_diagnosis_date=excluded.last_diagnosis_date, preparation_stage=excluded.preparation_stage,
      learning_style=excluded.learning_style, updated_at=now();

  -- Account C · 基础薄弱生（31 分，4 强 / 9 弱，foundational）
  insert into profiles (
    user_id, nickname, target_major, exam_year, is_demo, wizard_completed,
    ability_stars, knowledge_state, weak_topics, mastered_topics,
    last_diagnosis_score, last_diagnosis_date, preparation_stage, learning_style
  ) values (
    v_c, '李基础', '微电子科学与工程', 2027, true, true,
    -- 4 个 ≥4★ + 9 个 ≤2★（共 13，meanStar≈2.0 → foundational）
    '{"MOSFET I-V":1,"光学性质":1,"单级放大器":2,"CMOS 反相器":1,"超导 BCS":1,"晶体学":1,"MOSFET 电容":4,"PN 结/半导体物理基础":5,"CMOS 时序":2,"频率响应/Miller":1,"振荡器":4,"载流子输运":5,"CMOS 反相器静态特性":2}'::jsonb,
    -- mastery 均值 ≈0.30（薄弱为主）
    '{"MOSFET I-V":{"mastery":0.15,"attempts":1,"correctRate":0.2},"光学性质":{"mastery":0.1},"单级放大器":{"mastery":0.2},"CMOS 反相器":{"mastery":0.15},"超导 BCS":{"mastery":0.1},"晶体学":{"mastery":0.1},"MOSFET 电容":{"mastery":0.85},"PN 结/半导体物理基础":{"mastery":0.9},"CMOS 时序":{"mastery":0.2},"频率响应/Miller":{"mastery":0.1},"振荡器":{"mastery":0.8},"载流子输运":{"mastery":0.9},"CMOS 反相器静态特性":{"mastery":0.2}}'::jsonb,
    '["MOSFET I-V","光学性质","单级放大器","CMOS 反相器","超导 BCS","晶体学","CMOS 时序","频率响应/Miller","CMOS 反相器静态特性"]'::jsonb,  -- 9 薄弱
    '["MOSFET 电容","PN 结/半导体物理基础","载流子输运"]'::jsonb,            -- 4 已掌握（振荡器星 4 但未入 mastered，留作巩固态）
    31, now() - interval '2 days', 'foundation', 'guided'
  ) on conflict (user_id) do update set
      nickname=excluded.nickname, target_major=excluded.target_major, is_demo=true,
      wizard_completed=true, ability_stars=excluded.ability_stars,
      knowledge_state=excluded.knowledge_state, weak_topics=excluded.weak_topics,
      mastered_topics=excluded.mastered_topics, last_diagnosis_score=excluded.last_diagnosis_score,
      last_diagnosis_date=excluded.last_diagnosis_date, preparation_stage=excluded.preparation_stage,
      learning_style=excluded.learning_style, updated_at=now();

  -- ============================================================
  -- 2. diagnoses — 进步轨迹（每档 3 条时间序，进步曲线数据源）
  -- ============================================================
  -- A: 65 → 72 → 80
  insert into diagnoses (user_id, structured, score, created_at) values
    (v_a, jsonb_build_object('summary','早期诊断：基础概念掌握，部分应用薄弱','weak_topics',jsonb_build_array('CMOS 时序','振荡器')), 65, now() - interval '20 days'),
    (v_a, jsonb_build_object('summary','中期诊断：应用题正确率提升，残余 CMOS 时序薄弱','weak_topics',jsonb_build_array('CMOS 时序')), 72, now() - interval '10 days'),
    (v_a, jsonb_build_object('summary','近期诊断：冲刺拔高，剩余 3 薄弱点','weak_topics',jsonb_build_array('CMOS 时序','CMOS 反相器静态特性','振荡器')), 80, now() - interval '2 days');
  -- B: 30 → 45 → 57
  insert into diagnoses (user_id, structured, score, created_at) values
    (v_b, jsonb_build_object('summary','早期诊断：概念薄弱面广，需从基础补起','weak_topics',jsonb_build_array('MOSFET I-V','光学性质','CMOS 反相器','超导 BCS','晶体学','CMOS 时序')), 30, now() - interval '20 days'),
    (v_b, jsonb_build_object('summary','中期诊断：概念题改善，应用题仍弱','weak_topics',jsonb_build_array('MOSFET I-V','光学性质','CMOS 反相器')), 45, now() - interval '10 days'),
    (v_b, jsonb_build_object('summary','近期诊断：明显上升，5 薄弱点收敛','weak_topics',jsonb_build_array('MOSFET I-V','光学性质','CMOS 反相器','超导 BCS','晶体学')), 57, now() - interval '2 days');
  -- C: 20 → 25 → 31
  insert into diagnoses (user_id, structured, score, created_at) values
    (v_c, jsonb_build_object('summary','早期诊断：基础极薄弱，需苏格拉底降维引导','weak_topics',jsonb_build_array('MOSFET I-V','光学性质','单级放大器','CMOS 反相器','超导 BCS','晶体学','CMOS 时序','频率响应/Miller','CMOS 反相器静态特性','振荡器')), 20, now() - interval '20 days'),
    (v_c, jsonb_build_object('summary','中期诊断：难度自适应后开始见效，仍 9 薄弱','weak_topics',jsonb_build_array('MOSFET I-V','光学性质','单级放大器','CMOS 反相器','超导 BCS','晶体学','CMOS 时序','频率响应/Miller','CMOS 反相器静态特性')), 25, now() - interval '10 days'),
    (v_c, jsonb_build_object('summary','近期诊断：缓慢提升，薄弱面仍大','weak_topics',jsonb_build_array('MOSFET I-V','光学性质','单级放大器','CMOS 反相器','超导 BCS','晶体学','CMOS 时序','频率响应/Miller','CMOS 反相器静态特性')), 31, now() - interval '2 days');

  -- ============================================================
  -- 3. question_attempts — 做题记录（correctRate 对齐产品口径）
  -- ============================================================
  -- Account A：~20 题，correctRate≈0.80（16 对 / 4 错）
  insert into question_attempts (user_id, question_id, answer, is_correct, score, feedback, created_at)
  select v_a, q.id, jsonb_build_object('selected','A'), true, 1, jsonb_build_object('result','correct'),
         now() - (random() * 15 * interval '1 day')
  from (select id from questions where is_demo=true and question_type='choice' order by id limit 1 offset 0) q
  cross join generate_series(1, 16)
  union all
  select v_a, q.id, jsonb_build_object('selected','C'), false, 0, jsonb_build_object('result','wrong','hint','复核薄弱点'),
         now() - (random() * 15 * interval '1 day')
  from (select id from questions where is_demo=true and knowledge_point='CMOS 时序' and question_type='choice' limit 1) q
  cross join generate_series(1, 4);

  -- Account B：~15 题，correctRate≈0.57（7 对 / 8 错），其中 MOSFET I-V 故意做错
  insert into question_attempts (user_id, question_id, answer, is_correct, score, feedback, created_at)
  select v_b, q.id, jsonb_build_object('selected','A'), true, 1, jsonb_build_object('result','correct'),
         now() - (random() * 12 * interval '1 day')
  from (select id from questions where is_demo=true and question_type='choice' order by id limit 1 offset 0) q
  cross join generate_series(1, 7)
  union all
  select v_b, q.id, jsonb_build_object('selected','A'), false, 0, jsonb_build_object('result','wrong','hint','MOSFET I-V 饱和区公式','target',true),
         now() - (random() * 12 * interval '1 day')
  from (select id from questions where is_demo=true and knowledge_point='MOSFET I-V' and question_type='choice' limit 1) q
  cross join generate_series(1, 8);

  -- Account C：~12 题，correctRate≈0.33（4 对 / 8 错）
  insert into question_attempts (user_id, question_id, answer, is_correct, score, feedback, created_at)
  select v_c, q.id, jsonb_build_object('selected','B'), true, 1, jsonb_build_object('result','correct'),
         now() - (random() * 10 * interval '1 day')
  from (select id from questions where is_demo=true and question_type='choice' order by id limit 1 offset 0) q
  cross join generate_series(1, 4)
  union all
  select v_c, q.id, jsonb_build_object('selected','A'), false, 0, jsonb_build_object('result','wrong','hint','基础概念，需降维讲解'),
         now() - (random() * 10 * interval '1 day')
  from (select id from questions where is_demo=true and question_type='choice' order by id limit 1 offset 1) q
  cross join generate_series(1, 8);

  -- ============================================================
  -- 4. wrong_book_entries — 错题本（对齐薄弱点计数）
  -- ============================================================
  -- A: 3 条（对应 3 薄弱点）
  insert into wrong_book_entries (user_id, question_id, attempt_id, wrong_count, last_wrong_at)
  select v_a, q.id, null, 2, now() - interval '3 days'
  from (select id from questions where is_demo=true and knowledge_point='CMOS 时序' and question_type='choice' limit 1) q
  union all
  select v_a, q.id, null, 1, now() - interval '5 days'
  from (select id from questions where is_demo=true and knowledge_point='CMOS 反相器静态特性' limit 1) q
  union all
  select v_a, q.id, null, 1, now() - interval '6 days'
  from (select id from questions where is_demo=true and knowledge_point='振荡器' limit 1) q;

  -- B: 5 条（5 薄弱点，MOSFET I-V 在列——演示「故意做错」目标题）
  insert into wrong_book_entries (user_id, question_id, attempt_id, wrong_count, last_wrong_at)
  select v_b, q.id, null, 3, now() - interval '1 days'   -- MOSFET I-V 故意做错，错 3 次（演示触发点）
  from (select id from questions where is_demo=true and knowledge_point='MOSFET I-V' and question_type='choice' limit 1) q
  union all
  select v_b, q.id, null, 2, now() - interval '4 days'
  from (select id from questions where is_demo=true and knowledge_point='光学性质' and question_type='choice' limit 1) q
  union all
  select v_b, q.id, null, 1, now() - interval '4 days'
  from (select id from questions where is_demo=true and knowledge_point='CMOS 反相器' and question_type='choice' limit 1) q
  union all
  select v_b, q.id, null, 1, now() - interval '5 days'
  from (select id from questions where is_demo=true and knowledge_point='超导 BCS' limit 1) q
  union all
  select v_b, q.id, null, 1, now() - interval '5 days'
  from (select id from questions where is_demo=true and knowledge_point='晶体学' and question_type='choice' limit 1) q;

  -- C: 9 条（9 薄弱点）
  insert into wrong_book_entries (user_id, question_id, attempt_id, wrong_count, last_wrong_at)
  select v_c, q.id, null, 3, now() - interval '2 days'
  from (select id from questions where is_demo=true and knowledge_point='MOSFET I-V' and question_type='choice' limit 1) q
  union all select v_c, q.id, null, 2, now() - interval '2 days' from (select id from questions where is_demo=true and knowledge_point='光学性质' and question_type='choice' limit 1) q
  union all select v_c, q.id, null, 2, now() - interval '2 days' from (select id from questions where is_demo=true and knowledge_point='单级放大器' limit 1) q
  union all select v_c, q.id, null, 1, now() - interval '3 days' from (select id from questions where is_demo=true and knowledge_point='CMOS 反相器' and question_type='choice' limit 1) q
  union all select v_c, q.id, null, 1, now() - interval '3 days' from (select id from questions where is_demo=true and knowledge_point='超导 BCS' limit 1) q
  union all select v_c, q.id, null, 1, now() - interval '3 days' from (select id from questions where is_demo=true and knowledge_point='晶体学' and question_type='choice' limit 1) q
  union all select v_c, q.id, null, 1, now() - interval '4 days' from (select id from questions where is_demo=true and knowledge_point='CMOS 时序' and question_type='choice' limit 1) q
  union all select v_c, q.id, null, 1, now() - interval '4 days' from (select id from questions where is_demo=true and knowledge_point='频率响应/Miller' limit 1) q
  union all select v_c, q.id, null, 1, now() - interval '4 days' from (select id from questions where is_demo=true and knowledge_point='CMOS 反相器静态特性' limit 1) q;

end $$;

-- ============================================================
-- 5. 验证查询（跑完后可选执行，确认梯度复现）
-- ============================================================
-- select p.nickname, p.last_diagnosis_score,
--        (select avg(v::numeric) from jsonb_array_values_text(p.ability_stars) v)::numeric(4,2) as mean_star,
--        jsonb_array_length(p.weak_topics) as weak_cnt,
--        jsonb_array_length(p.mastered_topics) as mastered_cnt,
--        (select count(*) from diagnoses d where d.user_id=p.user_id) as diag_history_cnt,
--        (select count(*) from wrong_book_entries w where w.user_id=p.user_id) as wrong_cnt
-- from profiles p where p.is_demo=true order by p.last_diagnosis_score desc;
--
-- 预期：
--   李学霸  80 | mean≈4.0  | weak 3 | mastered 9 | diag 3 | wrong 3
--   李同学  57 | mean≈2.67 | weak 5 | mastered 3 | diag 3 | wrong 5   ← 主演示账号
--   李基础  31 | mean≈2.00 | weak 9 | mastered 3 | diag 3 | wrong 9
-- ============================================================
