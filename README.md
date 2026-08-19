# ResearchMate（研芯通）

> 工科学生成长的 AI 导师 —— 从课程学习到科研实践。
> 5-Agent 协作 + 知识图谱 RAG + 学生认知模型 + 学科解耦 + 纵向诊断对比。

**在线演示**：<https://researchmate.researchkit.online>

## v1 版本亮点

- **学生认知模型**：画像从数据存储升级为能力星级（1-5）+ 学习风格 + 目标方向 + 考研倒计时
- **第 5 个 Agent —— 科研**：打通本科学习到科研路径（论文 + 项目 + 技术路线图）
- **知识图谱 RAG**：`问题 → 知识节点 → 前置链 → 答案`（旧版为：`问题 → 文本切片 → 答案`）
- **仪表盘首页**：以能力进度、最大短板、考研倒计时、快捷操作取代"聊天优先"的 UI
- **Agent Trace 可视化**：Router → Profile → Agent → Profile 更新的实时时间线
- **品牌重新定位**：从"AI 应试工具"升级为"工科学生成长导师"

## 技术栈

- **前端**：Vue 3 + Vite + Element Plus + Pinia
- **后端**：Vercel serverless 函数（DeepSeek API 代理）
- **大模型**：DeepSeek `deepseek-chat`（对话）+ `deepseek-reasoner`（推理）
- **知识库**：JSON 切片（教材 + 院校）+ 知识图谱（节点 + 前置边）
- **存储**：localStorage（学生认知模型 + 诊断历史 + 计划版本）

## 架构

```
浏览器 ──► /api/chat ──► Vercel serverless ──► DeepSeek API
   │            （代理，隐藏 API Key）
   │
   └──► 5 个 Agent（Router 编排器 + Agent Trace 时间线）
         ├─ Tutor     导师（概念问答、苏格拉底式提问、知识图谱路径）
         ├─ Diagnose  诊断（四层根因分析）
         ├─ Planner   规划（4 周学习计划与动态调整）
         ├─ Admission 升学（三梯队院校推荐）
         └─ Research  科研（本科 → 科研路线图，论文 + 项目）
```

### 知识图谱 RAG 流水线

```
学生提问
   ↓
RAG 检索（Top-5 切片，TF-IDF + 子串混合）
   ↓
知识节点查找（按切片 ID，回退按关键词）
   ↓
前置链（递归、去重）
   ↓
掌握度标注（已掌握 / 薄弱 / 未知 / 学习中）
   ↓
个性化回答 + 知识路径卡片 UI
```

示例："MOSFET 阈值电压推导" → 目标节点 `MOSFET基础` → 11 个前置节点 → 重点提示"你之前未学「半导体基础」，建议先补这个前置知识。"

## 学科解耦

通过环境变量切换知识库：

```bash
# 微电子（默认，含知识图谱）
VITE_SUBJECT=microelectronics npm run build

# 计算机科学
VITE_SUBJECT=cs npm run build
```

同一套代码、同一个 DeepSeek API，不同学科。两个学科的 RAG hit@5 均为 100%。

## 快速开始

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 生产构建
npm run build

# 部署到 Vercel
vercel --prod
```

## 测试

```bash
# RAG 质量（微电子）
node scripts/test-rag-hit5.mjs

# RAG 质量（计算机，学科解耦）
node scripts/test-rag-hit5-cs.mjs

# 5-Agent 协作（6 个场景）
node scripts/test-agents-collab.mjs

# 纵向诊断演示（5 轮 + 3 份计划）
node scripts/test-history-demo.mjs

# Tutor 提示词遵循度
node scripts/test-tutor-prompt.mjs

# Agent 端到端（真实 API）
node scripts/test-agent-e2e.mjs

# API Key 泄露自查（v3.3 风险点 #11）
node scripts/test-key-leak.mjs

# 11 个风险点演练
node scripts/test-rollback-rehearsal.mjs --check

# 38 天计划重排验证
node scripts/test-plan-reorder.mjs

# 全量回归 + 盲测模板
node scripts/test-full-regression.mjs --blind-test
```

## 项目结构

```
├── api/chat.js                  # Vercel serverless（DeepSeek 代理）
├── src/
│   ├── core/
│   │   ├── router.js            # 编排器 + Agent Trace 事件
│   │   ├── cascade.js           # 诊断 → 规划级联
│   │   └── agents/              # 5 个 Agent（tutor / diagnose / planner / admission / research）
│   ├── prompts/                 # 5 个 Agent 提示词
│   ├── stores/
│   │   ├── profile.js           # 学生认知模型（能力星级 + 学习风格）
│   │   └── trace.js             # Agent Trace 时间线 store
│   ├── utils/
│   │   ├── rag.js               # TF-IDF + 子串混合检索
│   │   ├── tokenize.js          # Intl.Segmenter + 专业术语
│   │   └── knowledgeGraph.js    # 图谱加载 + 前置链 + 掌握度标注
│   └── components/
│       ├── KnowledgePathCard.vue  # 知识图谱路径可视化
│       ├── AgentTrace.vue         # Agent 过程时间线
│       ├── ResearchCard.vue       # 科研路线图卡片
│       └── ...                    # 诊断 / 规划 / 升学 / 画像等卡片
├── public/knowledge/
│   ├── textbook/
│   │   ├── 半导体物理.json          # 20 个切片
│   │   ├── 半导体物理-图谱.json     # 20 个节点 + 21 条前置边
│   │   └── 数据结构.json            # 计算机学科切片
│   └── university/              # 长三角微电子.json / CS院校.json
├── scripts/                     # 测试 + 演示脚本
├── docs/                        # 演示视频脚本
└── 前端UI设计_v{1,2,3}.md        # 设计文档（知识图谱样式）
```

## 安全性

- DeepSeek API Key 在 serverless 函数中通过 `process.env` 读取，绝不进入前端构建产物
- 源代码中无 `VITE_DEEPSEEK_*` 前缀变量（由 CI grep 强制检查）
- DevTools Network 只能看到 `/api/chat`，不会出现 `api.deepseek.com`

## 许可证

MIT
