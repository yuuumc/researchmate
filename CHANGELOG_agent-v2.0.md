# v2.0 阶段交付：Agent 编排层 + SSE 流式 + 学科路由

> 阶段：v2.0 多用户 SaaS 派发
> 负责人：Agent 编排工程师
> 日期：2026-07-28
> 估时：2 周（实际 1 次完整 run 落盘）
> 上游：v1.5 评审保命版 (d5346e6)

---

## 1. 三大交付物

### 交付物 1：DeepSeek 60s 超时兜底（SSE 流式）

**问题**：Vercel serverless hard limit 60s，DeepSeek-reasoner 长 prompt 经常 30-60s 必超时；v1.5 的 JSON 模式一次返回，前端必须等 30-60s。

**方案**：
- 服务端：`api/chat.js` 新增 `handleStream()`，Node.js ReadableStream 把 DeepSeek 的 SSE 转发到客户端
- 客户端：`src/api/deepseek.js` 新增 `callDeepSeekStream()`（fetch + TextDecoder + AbortController）
- BaseAgent：`runLLMStream()` + `callLLM()` 统一助手（自动选择流式/非流式）
- Router / Cascade：透传 `onToken` 和 `signal`
- ChatWindow：流式渲染 + 取消按钮 + AbortController
- 兜底机制：首 token 30s 超时 + 1 次重试（max_tokens 减半） + 上游错误时降级到 JSON 模式

**关键文件**：
- `api/chat.js`（重写）
- `src/api/deepseek.js`（新增 callDeepSeekStream）
- `src/api/custom.js`（AI_PROVIDER 暴露 callStream / callReasonerStream）
- `src/core/agents/BaseAgent.js`（新增 runLLMStream / callLLM）
- `src/core/router.js`（透传 onToken / signal）
- `src/core/cascade.js`（透传 ctx）
- `src/components/ChatWindow.vue`（流式渲染 + 取消）
- `vite.config.js`（mockRes 支持 write/flushHeaders/writableEnded）

### 交付物 2：BaseAgent 完善

**新增能力**：
1. **`onTrace(fn)`** —— trace 事件订阅系统（agent_done / first_token / llm_stream_done / error / retry）
2. **`withRetry(fn, opts)`** —— 指数退避重试装饰器（retries/backoff/retryableErrors 过滤）
3. **`withTimeout(fn, ms, label)`** —— Promise.race 超时装饰器
4. **`createAgent({name, run, options})`** —— Agent 工厂，自动包装 timeout + retry + trace
5. **`callLLM(...)`** —— 统一 LLM 调用入口（onToken 有无自动选流式/非流式）
6. **`runLLMStream(...)`** —— 流式 LLM 调用，发射 first_token / llm_stream_done trace

**createAgent 工厂实测 43 行**（≤ 100 行验收通过）—— 新增 Agent 控制在 100 行内。

**关键文件**：
- `src/core/agents/BaseAgent.js`（v1.5 → v2.0 升级版，43 + 158 行）

### 交付物 3：学科路由（运行时切换）

**问题**：v1.5 用 `VITE_SUBJECT=cs` 改 build-time 切换学科，新增学科需：上传 JSON + 改 .env + 重新 build。

**方案**：运行时拉取 + URL 参数驱动
- `public/knowledge/subjects.json` —— 学科注册表（数组、追加友好）
- `src/utils/subjectLoader.js` —— 运行时加载器（5 个核心函数）
- `src/stores/subject.js` —— Pinia store
- `src/main.js` —— 启动时调用 `bootstrapSubject()`

**优先级（决定当前学科）**：
1. URL 参数 `?subject=cs`（一次性，覆盖后写 localStorage）
2. localStorage 持久化
3. `VITE_SUBJECT`（v1.5 向后兼容，保留为第 3 优先级）
4. 注册表第一项（兜底）

**新增学科成本**：上传 JSON + 在 subjects.json 追加 1 条 + `?subject=xxx`。不再需要改 .env / 重新 build。

**关键文件**：
- `public/knowledge/subjects.json`（新增）
- `src/utils/subjectLoader.js`（新增）
- `src/stores/subject.js`（新增）
- `src/main.js`（改用 bootstrapSubject）

---

## 2. 验收自检

### 测试结果

| 测试 | 结果 | 覆盖 |
|------|------|------|
| `test-stream-chat.mjs` | ✅ **45/45 通过** | SSE 实现、Router 透传、ChatWindow 渲染、取消 |
| `test-subject-loader.mjs` | ✅ **35/35 通过** | 注册表、5 函数、优先级、注入、Pinia、缓存、错误处理 |
| `test-base-agent-v2.mjs` | ✅ **58/58 通过** | onTrace / withRetry / withTimeout / createAgent / 5 Agent 合规 |
| `test-base-agent-router.mjs` (v1.5) | ✅ **47/47 通过** | traceAgent 装饰器 / parseStructured / Promise.all |
| `test-rag-hit5.mjs` (v1.5) | ✅ **20/20 = 100%** | RAG 命中 |
| `test-citation-verifier.mjs` (v1.5) | ✅ 通过 | 引用验证 |
| `test-tutor-prompt.mjs` | ✅ 14/14 | tutor 静态校验 |
| `test-diagnose-prompt.mjs` | ✅ 12/12 | diagnose 静态校验 |
| `test-planner-prompt.mjs` | ✅ 12/12 | planner 静态校验 |
| `test-admission-prompt.mjs` | ✅ 12/12 | admission 静态校验 |
| `test-research-prompt.mjs` | ✅ 12/12 | research 静态校验 |

**v2.0 新增测试总计**：138 项断言，全部通过。
**v1.5 回归测试（关键）**：全部通过，未引入回归。

### 验收标准对照

| 验收项 | 设计保障 | 状态 |
|--------|---------|------|
| API 60s 超时错误率 < 0.5% | 服务端 1 次重试（max_tokens 减半）+ 首 token 30s 超时主动中断 + Vercel maxDuration 58s（小于 60s 限制） | ✅ 设计达标 |
| 首 token 延迟 < 2s（任意 prompt 长度） | fetch(SSE) → handler.flushHeaders → DeepSeek delta → onToken → DOM patch | ✅ 设计达标 |
| 新增学科 "改 JSON + 改 URL" | 注册表 + 内存缓存 + URL 参数优先级最高 | ✅ 验收达标 |
| 不动 5 Agent 业务逻辑 | RAG / knowledgeGraph / parseStructured / sanitizeReason / citationVerifier 全部保留 | ✅ 已验证 |
| 不引入新 npm 依赖 | 全部用 fetch / AbortController / Promise.race（Node 18+ 内置 / 浏览器原生） | ✅ 已验证 |

### 已知遗留（非 v2.0 范围）

- `test-full-regression.mjs`（v3.6 老脚本）有 2 个 v1.5 状态硬编码检查失败：
  - `cascade.js 含 loadProfile`（v2.0 改了 cascade 透传 ctx）
  - `main.js 含 SUBJECT_CONFIG`（v2.0 主动去掉，改用 bootstrapSubject）
  - **这两个是 v3.6 测试不适配 v2.0，不是 v2.0 引入的回归**。建议下一轮把 v3.6 测试模板升级为 v2.0-aware 形态。
- `test-key-leak.mjs` 报 dist/ 不存在（需 `npm run build`），是部署前动作，不在编排层范围。

---

## 3. 文件清单

### 改动（10 个）

- `api/chat.js` — handleJson / handleStream 双模式 + SSE
- `vite.config.js` — mockRes 支持 write/flushHeaders/writableEnded
- `src/main.js` — 改用 bootstrapSubject 运行时加载
- `src/api/deepseek.js` — 新增 callDeepSeekStream
- `src/api/custom.js` — AI_PROVIDER 暴露 callStream / callReasonerStream
- `src/core/agents/BaseAgent.js` — runLLMStream / callLLM / onTrace / withRetry / withTimeout / createAgent
- `src/core/router.js` — route 接受 onToken / signal
- `src/core/cascade.js` — 透传 ctx
- `src/core/agents/{tutor,diagnose,planner,admission,research}.js` — 签名升级 (userInput, profile, ctx)，引入 callLLM，保留 runLLM 引用
- `src/components/ChatWindow.vue` — 流式渲染 + 取消按钮 + AbortController

### 新增（6 个）

- `public/knowledge/subjects.json` — 学科注册表
- `src/utils/subjectLoader.js` — 运行时加载器
- `src/stores/subject.js` — Pinia store
- `scripts/test-stream-chat.mjs` — SSE 测试
- `scripts/test-subject-loader.mjs` — 学科路由测试
- `scripts/test-base-agent-v2.mjs` — BaseAgent v2.0 测试

---

## 4. 协调 / 上下游

- **本子任务**只动编排层（router / cascade / BaseAgent）+ 路由层（学科 runtime）+ 传输层（API SSE）
- **5 Agent 业务核心**（RAG / 图谱 / JSON 抽取 / sanitizeReason / citationVerifier）未改动
- **API 形态变化**：`/api/chat` 新增 `options.stream: true`；事件流格式 `event: token | done | error`；前端可自由选择 JSON 模式或 SSE 模式
- **数据 schema 变化**：`/knowledge/subjects.json` 是新增 schema（数组 + 每条 {id, name, textbookPath, graphPath, universityPath}），与 v1.5 兼容
- **如需 @ 全栈队长（后端 5 表 Supabase）**：本子任务不涉及数据库表 / 用户态 / 鉴权，仅在编排层内部完成

---

## 5. 风险与下阶段衔接

### 风险

- 流式接口在 Vercel 边缘节点的 last-mile 抖动还没量化监控。建议下阶段挂 Vercel Analytics 跟踪 firstTokenLatencyMs 分布
- subjects.json 改了 5 个 Agent 的数据源（之前是 hardcoded），下阶段如要换"按学科拆分 Agent 类"会有耦合

### 下阶段衔接（v3.0+）

- v3.0 加就业/教研 Agent：可直接用 createAgent 工厂（≤ 100 行）
- v3.0 加备选 LLM provider：AI_PROVIDER.callStream / callReasonerStream 已预留接口
- 学科 router 可平滑过渡到「学科 → 学科 Agent 类型」的多对一映射

---

*交付人：Agent 编排工程师（2026-07-28）*
