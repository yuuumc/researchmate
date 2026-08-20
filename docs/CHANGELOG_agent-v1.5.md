# v1.5 评审保命 — Agent 编排层（H2 + BaseAgent）

**Owner**: Agent 编排工程师
**交付日期**: 2026-07-28
**基线**: v1.0 (researchmate-v1.0.tar.gz, 184KB)
**协作文件夹**: https://larkcommunity.feishu.cn/drive/folder/C2yZfB6EblC85UdOHVccMnrTnje

---

## 变更范围

按计划 8.1 派单，Agent 编排层的 2 项工作全部完成：

| # | 任务 | 状态 | 文件 |
|---|------|------|------|
| H2 | router.js 2x 串行 LLM → 并行 + 兜底 | ✅ 完成 | `src/core/router.js` |
| H3 | BaseAgent 基类 + trace 装饰器 | ✅ 完成 | `src/core/agents/BaseAgent.js`（新）+ 5 Agent 改造 |
| 附 | 单元测试（47 项全通过） | ✅ 完成 | `scripts/test-base-agent-router.mjs`（新） |

---

## H2: router.js 并行改造

### 设计

**核心思路**：tutor（concept 引导）是最高频的 intent（默认走 concept 兜底），所以**预热** tutor 与 **识别** intent 并行执行。如果命中 concept，直接用预热结果；如果命中其他 intent，丢弃预热结果，调用对应 Agent。

**关键路径**：
```
原 v1.0（串行）：
  loadProfile → LLM(intent) → switch(intent) → LLM(agent) → updateProfile
  延迟: profile + intent + agent + update ≈ T(intent) + T(agent)

v1.5（并行）：
  loadProfile → Promise.all[LLM(intent), LLM(tutor)] → if concept: 用 tutor / else: 调对应 agent → updateProfile
  延迟: profile + max(T(intent), T(tutor)) ≈ T(tutor)（命中 concept 时）
  ↓ 节省 ≈ T(intent) ≈ 50% 单轮延迟
```

### 兜底策略（3 层）

1. **intent 失败 + tutor 成功** → 默认 concept，直接用 tutor 预热结果
2. **intent 成功 + tutor 失败** → 命中 concept → 再调一次 tutor；命中其他 → 调对应 Agent
3. **intent 失败 + tutor 失败** → 串行兜底，再调一次 tutor；都失败时返回错误信息

### 代码位置

- `recognizeIntent(userInput)`：独立函数，可在 Promise.all 中复用 + 单独重试
- `route(userInput)`：主控流程，2 个 Promise 包裹后 `Promise.all` 调度
- `intentForNext`：统一变量名，所有后续判断走这一份
- `tutorPrewarmResult`：缓存预热结果，命中 concept 时直接使用

### 关键不变量

- ✅ 任何异常都不抛到调用方（最终都有兜底）
- ✅ trace 步骤完整（profile / router / agent / profile_update 四步都记录）
- ✅ 命中 concept 时 trace 仍然更新
- ✅ cascade intent 走 cascadeDiagnoseToPlan（不动原级联逻辑）

---

## H3: BaseAgent + trace 装饰器

### 抽象设计

新建 `src/core/agents/BaseAgent.js`，提供 3 个核心工具：

| 工具 | 职责 | 替代的原代码 |
|------|------|--------------|
| `runLLM(agentName, prompt, userInput, options, useReasoner)` | 统一 LLM 调用 + 计时 + 异常包装 | 5 处 `AI_PROVIDER.call(...)` 重复 |
| `parseStructured(raw, fallback)` | 统一 JSON 抽取 + 兜底 | 5 处 `extractXxxStructure(raw)` 重复 |
| `traceAgent(agentName, fn)` | 装饰器：input/output/latency 自动埋点 | 无（新增能力） |

### 装饰器设计

`traceAgent` 是高阶函数，**保留原函数签名**（userInput, profile），调用方零修改：

```js
// 改造前
export async function tutorAgent(userInput, profile) { ... }

// 改造后
export const tutorAgent = traceAgent('tutor', async function tutorCore(userInput, profile) {
  // 内部实现可使用 runLLM + parseStructured
})
```

### 5 Agent 改造详情

| Agent | LLM 抽象 | 异常处理 | 备注 |
|-------|----------|----------|------|
| tutor | runLLM('tutor', ...) | runLLM 内部捕获，保留 tutor 原 `apiError` 兜底 | RAG + 知识图谱逻辑保留 |
| diagnose | runLLM('diagnose', ..., true) | 直接抛，router 兜底 | 用 reasoner 模型 |
| planner | runLLM('planner', ...) | 直接抛，router 兜底 | — |
| admission | runLLM('admission', ...) | 直接抛，router 兜底 | sanitizeReason 保留 |
| research | runLLM('research', ...) | 直接抛，router 兜底 | — |

### 兼容性

- ✅ 所有 5 个 `xxxAgent` 导出名不变
- ✅ 所有 `setKnowledgeBase / setKnowledgeGraph / setUniversityData` 辅助函数保留
- ✅ 返回结构（`{ intent, agent, content, structured, ... }`）不变
- ✅ 既有测试脚本（`scripts/test-*.mjs`）无须修改即可运行

---

## 单元测试（47/47 通过）

新文件 `scripts/test-base-agent-router.mjs`，覆盖：

1. **traceAgent 装饰器** —— 日志格式、计时、异常透传
2. **parseStructured** —— ```json 块、严格 JSON、非法 JSON、null 输入
3. **Promise.all 并行调度** —— 验证两个 Promise 几乎同时 start（间隔 < 10ms）
4. **双失败兜底** —— 检测到双失败后串行 tutor 兜底
5. **单边失败** —— intent 失败 + tutor 成功 → 走 concept
6. **router.js 源码完整性** —— route 导出、Promise.all 存在、recognizeIntent 存在
7. **5 Agent 改造完整性** —— traceAgent 包装、runLLM 使用、导出保留
8. **BaseAgent.js 导出完整性** —— runLLM / parseStructured / traceAgent / BaseAgent
9. **tutor 预热只调用 1 次** —— 命中 concept 时不重复 LLM

### 运行方式

```bash
cd researchmate-main
node scripts/test-base-agent-router.mjs
```

预期输出：47/47 通过（✅ 全部 47 项通过）。

---

## 集成步骤（队长）

1. 解压 `agent-v1.5.zip` 到 `researchmate-main/`，覆盖以下文件：
   ```
   src/core/router.js                          (modify)
   src/core/agents/BaseAgent.js                (new)
   src/core/agents/tutor.js                    (modify)
   src/core/agents/diagnose.js                 (modify)
   src/core/agents/planner.js                  (modify)
   src/core/agents/admission.js                (modify)
   src/core/agents/research.js                 (modify)
   scripts/test-base-agent-router.mjs          (new)
   ```
2. 不需新增依赖（不引 echarts / 其他 npm 包）
3. `npm run build` 验证：应通过（5 Agent 行为不变，router 行为不变）
4. `node scripts/test-base-agent-router.mjs` 验证：47/47 通过
5. 端到端验证：调一次概念问题 → console 应输出 2 条 trace（intent + tutor）；调一次"先诊断再规划" → console 应输出 3 条 trace（intent + diagnose + planner）

### 边界（不动）

- `src/views/`、`src/components/`、`src/stores/`、`src/prompts/`、`src/api/`、`vercel.json`、`api/chat.js` —— 全部不动
- 提示词工程师的脚本（`scripts/test-{admission,diagnose,planner,research}-prompt.mjs`）—— 各自独立，本份不涉及
- 前端开发工程师的 4 Critical + 4 新功能 —— 各自独立，本份不涉及

---

## 风险与已知限制

1. **tutor 预热会消耗一次 LLM 调用**（即使最终命中其他 intent）。如果你们想精确控制成本，可以加一个开关（比如 `prewarmTutor: true/false`）默认 true，由 router 入口控制。
2. **intent 识别从 v1.0 的 200 max_tokens 不变**。如想进一步降延迟可降到 100，但可能影响 JSON 解析成功率。
3. **trace 日志目前是 console.log**。如果上线后想收集到 Sentry / 自建日志系统，需要在 BaseAgent 里加 hook 点（`onTrace` 回调）。

以上 3 点都是 nice-to-have，不影响 v1.5 评审保命的核心目标。

---

## 自检（已通过）

- [x] `node --check` 全部 7 个 JS 文件无语法错误
- [x] 47 项单元测试全部通过
- [x] 5 Agent 的导出名 / 函数签名 / 返回结构与 v1.0 完全一致
- [x] router.js 行为兼容：命中 concept、命中其他 intent、双失败、单边失败 4 种路径都有兜底
- [x] 不引入新 npm 依赖
- [x] 不动边界（views / components / stores / prompts / api / vercel.json / api/chat.js）
- [x] 静态 grep 确认 5 Agent 不再直接 import `@/api/custom`，全部走 BaseAgent.runLLM
