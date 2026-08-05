-- ============================================================
-- 研芯通 v2.0 — W2 遗留 5 KP 补题（M-3 随带）
-- 5 KP × 2 题 = 10 题，覆盖 W2 失败的知识点
-- 用法：Supabase Dashboard → SQL Editor → 执行
-- ============================================================

-- 1. MOSFET I-V 特性（半导体物理 / 微电子器件）
INSERT INTO questions (subject, knowledge_point, question_type, difficulty, content, source, status, is_demo) VALUES
('微电子器件', 'MOSFET I-V', 'choice', 3,
 '{"stem": "对于一个 NMOS 晶体管，当 VGS > Vth 且 VDS < VGS - Vth 时，器件工作在哪个区域？", "options": ["A. 截止区", "B. 线性区（三极管区）", "C. 饱和区", "D. 击穿区"], "answer": "B", "explanation": "当 VDS < VGS - Vth（即 VDS < VOV，其中 VOV = VGS - Vth 为过驱动电压）时，沟道未在漏端夹断，器件工作在线性区（也称三极管区或非饱和区）。此时 ID 随 VDS 近似线性增加。"}',
 'curated', 'published', false),
('微电子器件', 'MOSFET I-V', 'fill', 4,
 '{"stem": "在饱和区，NMOS 的漏电流公式为 ID = (1/2)·μn·Cox·(W/L)·(VGS - Vth)²·(1 + λ·VDS)。其中 λ 称为 ______ 效应系数，反映了漏极电压对沟道有效长度的影响。", "answer": "沟道长度调制", "explanation": "λ 是沟道长度调制系数（Channel-Length Modulation）。在饱和区，增大 VDS 会使夹断点向源端移动，有效沟道长度 L 减小，导致 ID 随 VDS 略有增加。λ 与 1/L 成正比，短沟道器件中该效应更显著。"}',
 'curated', 'published', false)
ON CONFLICT (content_hash) DO NOTHING;

-- 2. JFET 结型场效应管
INSERT INTO questions (subject, knowledge_point, question_type, difficulty, content, source, status, is_demo) VALUES
('微电子器件', 'JFET', 'choice', 3,
 '{"stem": "N 沟道 JFET 中，当 VGS = 0 且 VDS 增大到一定值后，ID 达到饱和值 IDSS。此时漏端 PN 结的耗尽层状态是：", "options": ["A. 完全消失", "B. 在漏端夹断沟道", "C. 覆盖整个沟道", "D. 不变"], "answer": "B", "explanation": "当 VDS 增大到使 VDG = VDS - VGS = VDS = |Vp|（夹断电压）时，漏端 PN 结耗尽层在漏端夹断沟道，ID 达到饱和值 IDSS。此后 VDS 继续增大，ID 基本不变（忽略沟道长度调制效应）。"}',
 'curated', 'published', false),
('微电子器件', 'JFET', 'fill', 3,
 '{"stem": "N 沟道 JFET 的夹断电压 Vp 为 ______ 值（填正或负），IDSS 是 VGS = ______ 时的漏电流。", "answer": "负,0", "explanation": "N 沟道 JFET 的 Vp 为负值（通常 -2V 到 -10V），表示需要负的 VGS 来夹断沟道。IDSS（饱和漏电流）定义为 VGS = 0 时的漏电流，是 JFET 的最大工作电流。P 沟道 JFET 的 Vp 为正值。"}',
 'curated', 'published', false)
ON CONFLICT (content_hash) DO NOTHING;

-- 3. 单级放大器（模拟IC）
INSERT INTO questions (subject, knowledge_point, question_type, difficulty, content, source, status, is_demo) VALUES
('模拟IC', '单级放大器', 'choice', 4,
 '{"stem": "共源极放大器中，若负载电阻 RD 增大（假设晶体管始终在饱和区），以下哪个说法正确？", "options": ["A. 电压增益 |Av| = gm·RD 减小", "B. 电压增益 |Av| = gm·RD 增大", "C. 输出电阻减小", "D. 输入电阻增大"], "answer": "B", "explanation": "共源极放大器的电压增益 |Av| = gm·RD（忽略沟道长度调制）。增大 RD 使增益增大。但 RD 过大会导致：①直流工作点下 VDS 减小，可能使晶体管退出饱和区进入线性区；②输出电阻 Rout ≈ RD 增大；③带宽减小（密勒效应 + RC 时间常数）。输入电阻由栅极决定，与 RD 无关。"}',
 'curated', 'published', false),
('模拟IC', '单级放大器', 'fill', 4,
 '{"stem": "源极跟随器（共漏极放大器）的电压增益近似为 ______（用 gm 和 RL 表示），其输出电阻近似为 ______（用 gm 和 rs 表示，rs = 1/gm）。", "answer": "gm·RL/(1+gm·RL),1/gm", "explanation": "源极跟随器电压增益 Av = gm·RL / (1 + gm·RL) ≈ 1（当 gm·RL >> 1 时）。输出电阻 Rout ≈ 1/gm（与源极电阻并联，通常 rs << RL，故 Rout ≈ rs = 1/gm）。源极跟随器的特点：高输入阻抗、低输出阻抗、电压增益略小于 1，常用作缓冲级（buffer）或电平移位。"}',
 'curated', 'published', false)
ON CONFLICT (content_hash) DO NOTHING;

-- 4. 振荡器（模拟IC）
INSERT INTO questions (subject, knowledge_point, question_type, difficulty, content, source, status, is_demo) VALUES
('模拟IC', '振荡器', 'choice', 4,
 '{"stem": "RC 桥式振荡器（Wien 桥振荡器）的起振条件是放大器闭环增益 |A·β| 和相移条件分别满足：", "options": ["A. |A·β| > 1，相移 = 0°", "B. |A·β| < 1，相移 = 180°", "C. |A·β| = 1，相移 = 90°", "D. |A·β| > 1，相移 = 360°"], "answer": "A", "explanation": "Barkhausen 稳定性判据：振荡器起振需满足 |A·β| ≥ 1（环路增益模值≥1）且环路相移 ∠(A·β) = 2nπ（n=0,1,2...）。Wien 桥振荡器在谐振频率 f0 = 1/(2πRC) 处，反馈网络 β 的相移为 0°，因此放大器 A 也需提供 0° 相移（同相放大器），且 |A| ≥ 3（因为 β = 1/3）。稳幅后 |A·β| = 1。"}',
 'curated', 'published', false),
('模拟IC', '振荡器', 'fill', 3,
 '{"stem": "LC 振荡器的振荡频率由谐振回路决定，f0 = ______（用 L 和 C 表示）。Colpitts 振荡器中，反馈网络使用两个 ______（串联/并联）的电容和一个电感构成 LC 谐振回路。", "answer": "1/(2π√(LC)),串联", "explanation": "LC 振荡器谐振频率 f0 = 1/(2π√(LC))。Colpitts 振荡器使用两个串联电容 C1、C2 与一个电感 L 构成谐振回路，反馈比 β = C1/(C1+C2)。Hartley 振荡器则用两个串联电感和一个电容。Colpitts 因电容分压反馈稳定、波形好，在射频电路中广泛使用。"}',
 'curated', 'published', false)
ON CONFLICT (content_hash) DO NOTHING;

-- 5. 光学性质（半导体物理 / 固态物理）
INSERT INTO questions (subject, knowledge_point, question_type, difficulty, content, source, status, is_demo) VALUES
('半导体物理', '光学性质', 'choice', 3,
 '{"stem": "半导体在光吸收时，当光子能量 hν 大于禁带宽度 Eg 时发生本征吸收。对于直接带隙半导体（如 GaAs），以下说法正确的是：", "options": ["A. 导带底和价带顶在 k 空间不同位置，需要声子参与", "B. 导带底和价带顶在 k 空间同一位置，不需要声子参与", "C. 吸收系数随光子能量增加而减小", "D. 只能发生间接跃迁"], "answer": "B", "explanation": "直接带隙半导体（GaAs、InP 等）的导带底和价带顶在 k 空间同一位置（k=0，Γ 点），电子跃迁不需要声子参与动量守恒，吸收系数大且陡峭上升。间接带隙半导体（Si、Ge）的导带底和价带顶在 k 空间不同位置，跃迁需声子参与，吸收系数较小且上升缓慢。这就是 GaAs 太阳电池效率高于 Si 的原因之一。"}',
 'curated', 'published', false),
('半导体物理', '光学性质', 'fill', 4,
 '{"stem": "半导体发光二极管（LED）的发光波长 λ 与禁带宽度 Eg 的关系为 λ = ______（用 hc 和 Eg 表示）。对于 GaAs（Eg = 1.42 eV），发光波长约为 ______ nm。", "answer": "hc/Eg,874", "explanation": "LED 发光波长 λ = hc/Eg，其中 h = 4.136×10⁻¹⁵ eV·s，c = 3×10⁸ m/s。对 GaAs：λ = 1240/1.42 ≈ 873 nm（近红外）。这是 GaAs LED 发出近红外光的原理。可见光 LED 需要更大的 Eg：红光（~700nm）需 Eg ≈ 1.77 eV（GaAsP），蓝光（~470nm）需 Eg ≈ 2.64 eV（GaN）。"}',
 'curated', 'published', false)
ON CONFLICT (content_hash) DO NOTHING;
