# ResearchMate（研芯通）

> 工科学生成长的 AI 导师 —— 从课程学习、诊断规划到科研实践的全链路智能学习平台。
> 多 Agent 协作 + GraphRAG 三路融合检索 + 三层记忆 + 情绪关怀与安全边界 + 学科解耦。

**在线演示**：<https://researchmate.researchkit.online>

GitHub 仓库：<https://github.com/yuuumc/researchmate>

---

## 核心能力

### 多 Agent 架构

Router 编排器根据学生输入分派到专职 Agent，全程 Agent Trace 可视化（Router → Profile → Agent → Profile 更新的实时时间线）：

- **Tutor 导师** —— 概念问答、苏格拉底式提问、知识图谱路径引导、拍照解题（OCR + 图件识别）
- **Diagnose 诊断** —— 四层根因分析（症状 → 直接原因 → 中间原因 → 根本原因），薄弱知识点定位
- **Planner 规划** —— 4 周学习计划生成与动态调整，含难度自适应（R4 注入文案点出薄弱知识点名称）
- **Admission 升学** —— 三梯队院校推荐（冲刺 / 稳妥 / 保底），就业与考研数据驱动
- **Research 科研** —— 本科学习到科研路径打通（论文 + 项目 + 技术路线图）
- **Peer 同伴 / Feynman 费曼讲解 / Exam 模考 / Practice 练习 / Derivation 白板推导** —— 多场景学习闭环

### GraphRAG 三路融合检索

`问题 → 知识节点 → 前置链 → 个性化回答`，取代传统「问题 → 文本切片 → 答案」：

- **路径 1 TF-IDF 检索**（语义 + 子串加权，基于知识库切片）
- **路径 2 图谱向量检索**（特征哈希向量余弦相似度，基于知识图谱节点，命中同义/近义表述）
- **路径 3 关键词图谱匹配**（词法精确匹配，向量路补充）

三路分数 min-max 归一化后加权融合（0.4 / 0.4 / 0.2），按 source_id 去重返回 Top-K；无图谱时退化为纯 TF-IDF，向后兼容。

### 三层记忆

- **向量情景记忆**（`vectorMemory.js`）—— 诊断/计划/择校/问答结果向量化写入 localStorage，用户输入向量召回 Top-K 注入 prompt，零新增依赖、容量 200 条 + LRU
- **知识掌握度**（`masteryEngine.js`）—— 知识点掌握度 0–1 标准化、能力星级 1–5 推导、薄弱/已掌握分类
- **学生认知画像**（`profile.js` store）—— 能力星级 + 学习风格 + 目标方向 + 考研倒计时，跨 Agent 共享

### 情绪关怀与安全边界

`emotionGuard.js` 在 LLM 意图识别前做确定性关键词拦截（优先于 Router）：

- **危机信号**（crisis：不想活/想死/自残等）—— 命中即强制留在 Tutor，绝不路由到 Diagnose/Planner
- **情绪信号**（emotion：抑郁/焦虑/崩溃/学不进去等）—— 同样留在 Tutor 给予陪伴，宁可误伤
- 设计原则：误伤成本低（Tutor 是默认 handler），真正危害是把情绪信号路由离开 Tutor

### B1–B6 加分功能

| 编号 | 功能 | 实现 |
|------|------|------|
| B1 | 公式/图件标记规范 | KaTeX 公式渲染 + SVG 图件规范（`svgSpecRenderer.js` / `renderMath.js`），公式与图件在对话中结构化呈现 |
| B2 | 结构化分步推导 | JSON Step Player + 一次性推导 API（`api/derivation.js` + `DerivationView.vue`） |
| B3 | 错题变式闭环 | 错题 → 变式生成（`prompts/variant.md` 模板化）→ 判分（`grading.js` 双容差 abs/rel）→ 回流错题本 |
| B4 | 知识图谱可视化 | ECharts 力导向图，掌握度热力着色 + 薄弱节点静态光晕 + 深色模式（`KnowledgeGraphView.vue`） |
| B5 | 架构看板 | 仪表盘 4 卡片：能力雷达 / 活动趋势 / 薄弱点 / 进度轨迹（`useChartTheme` composable） |
| B6 | 每日学习路径 | 策略权重 + 分桶 + 比例表 + 降级填充 + 次日刷新（`learningPathEngine.js` + `dailyPath.js` store） |

## 技术栈

- **前端**：Vue 3 + Vite + Element Plus + Pinia + Vue Router + ECharts 5.6 + KaTeX + marked + DOMPurify（XSS 防护）+ tesseract.js（拍照 OCR）
- **后端**：Vercel serverless 函数（DeepSeek API 代理，隐藏 Key）
- **大模型**：DeepSeek `deepseek-chat`（对话）+ `deepseek-reasoner`（推理）
- **数据存储**：Supabase（Postgres + RLS，用户/画像/诊断/轨迹/错题/知识状态持久化）+ localStorage（向量记忆 + 诊断历史 + 计划版本）
- **知识库**：JSON 切片（教材 + 院校）+ 知识图谱（节点 + 前置边），学科解耦可切换

## 本地运行

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local
#   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY  —— Supabase 项目（可选，未配置时走 localStorage 演示模式）
#   DEEPSEEK_API_KEY                            —— DeepSeek API Key（serverless 端读取，不进前端构建）

# 3. 启动开发服务器
npm run dev          # http://localhost:5173

# 4. 构建生产产物
npm run build        # 输出至 dist/

# 5. 测试
npm run test:unit    # Vitest 单元测试
npm run test:e2e     # Playwright 端到端
```

未配置 Supabase 时自动降级为 localStorage 演示模式，可离线体验全部 Agent 与 RAG 能力。

## 目录结构

```
researchmate/
├── api/                          # Vercel serverless 函数
│   ├── chat.js                   # DeepSeek 代理（SSE 流式）
│   ├── derivation.js             # 一次性分步推导 API
│   ├── variant.js                # 错题变式生成
│   ├── diagnosis.js / exam-grade.js / feynman.js / knowledge.js / profile.js / research-agent.js / tutor-photo.js
│   ├── agent.js / llm-provider.js / _middleware.js
├── src/
│   ├── core/
│   │   ├── router.js             # Agent 编排器 + Trace 事件
│   │   ├── cascade.js            # 诊断 → 规划级联
│   │   ├── emotionGuard.js       # 情绪/危机确定性拦截
│   │   ├── masteryEngine.js      # 掌握度 + 能力星级
│   │   ├── learningPathEngine.js # B6 每日学习路径
│   │   ├── difficultyAdapt.js / examGrader.js / profileBus.js / profileLoader.js / profileUpdater.js
│   │   ├── agents/               # 7 Agent（tutor / diagnose / planner / admission / research + BaseAgent + citationVerifier）
│   │   └── tools/                # intentParser / index
│   ├── stores/                   # 18 个 Pinia store（profile / diagnosis / plan / practice / wrongBook / dailyPath / derivation / exam / feynman / journey / peer / research / sync / trace / auth / career / subject / diagnosisSession）
│   ├── utils/
│   │   ├── graphRag.js           # GraphRAG 三路融合
│   │   ├── knowledgeGraph.js     # 图谱加载 + 前置链 + 掌握度标注
│   │   ├── vectorMemory.js       # 向量情景记忆
│   │   ├── rag.js / vector.js / tokenize.js
│   │   ├── grading.js            # 双容差判分
│   │   ├── renderMath.js / svgSpecRenderer.js   # KaTeX + SVG
│   │   └── sanitize.js / validator.js / migrateStorage.js / persist.js ...
│   ├── composables/             # useMasteryData / useTheme / useVoiceChat / useAuthBootstrap / useChatShortcut / useTagInput
│   ├── services/                # supabase / sync / agentTrace / profileService / teacher
│   ├── views/                    # 24+ 视图（Home / Chat / Diagnosis / Plan / Practice / KnowledgeGraph / Architecture / Derivation / Variant / Feynman / Exam / Profile / Admission / Career / Research / Peer / Journey / Login ...）
│   ├── components/ prompts/ router/ data/ styles/
├── prompts/                      # Agent 提示词（diagnose / plan / practice / research / derivation / variant / peer / student-employment / student-taoyan）
├── supabase/
│   ├── migrations/              # 001_init ~ 007_knowledge_state
│   └── seed_*.sql               # 演示账号 / 知识点 / 题库种子
├── public/knowledge/             # 教材切片 + 院校数据 + 知识图谱 JSON
├── scripts/ docs/ vercel.json package.json
```

## 架构

```
浏览器 ──► /api/chat ──► Vercel serverless ──► DeepSeek API
   │            （代理，隐藏 API Key，SSE 流式）
   │
   ├──► emotionGuard（危机/情绪确定性拦截，优先于意图识别）
   │
   └──► Router 编排器 ──► 专职 Agent（全程 Agent Trace 时间线）
         ├─ Tutor     导师（概念问答、苏格拉底、知识图谱路径、拍照解题）
         ├─ Diagnose  诊断（四层根因分析 → 薄弱知识点）
         ├─ Planner   规划（4 周计划 + 难度自适应）
         ├─ Admission 升学（三梯队院校推荐）
         ├─ Research  科研（本科 → 科研路线图）
         └─ Peer / Feynman / Exam / Practice / Derivation ...

         RAG：GraphRAG 三路融合（TF-IDF + 图谱向量 + 关键词）
         记忆：向量情景记忆 + 知识掌握度 + 学生认知画像（三层）
```

## 学科解耦

通过环境变量切换知识库，同一套 Agent 与 RAG 引擎可服务不同学科：

- `public/knowledge/textbook/` —— 学科教材切片 + 图谱（半导体物理、数据结构等）
- `public/knowledge/university/` —— 院校数据（长三角微电子、CS 院校等）

## 安全性

- DeepSeek API Key 在 serverless 函数中通过 `process.env` 读取，绝不进入前端构建产物
- 源代码中无 `VITE_DEEPSEEK_*` 前缀变量（CI grep 强制检查）
- DevTools Network 只能看到 `/api/chat`，不会出现 `api.deepseek.com`
- DOMPurify XSS 防护 + sanitize.js 输出净化
- 情绪/危机信号确定性拦截，保障学生安全

## 许可证

MIT
