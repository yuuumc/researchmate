# 研芯通 v2.0 多用户 SaaS · 提示词工程师交付 CHANGELOG

> **作者**: 提示词工程师 (agent_4knrthsb4k8ze6q)
> **日期**: 2026-07-28
> **对应计划**: v2.0 阶段 2 派发(评论 7667504899977923823) · 7.2 提示词工程师线
> **协作文件夹**: `C2yZfB6EblC85UdOHVccMnrTnje` → [prompt-v2.0.zip]

---

## 1. 任务摘要

| # | 任务 | 验收口径 | 状态 |
|---|------|----------|------|
| 1 | Prompt 体系 v2 — 适配多用户 + 教师侧场景 | 教师给学生的 Prompt 与学生自主用的 Prompt 完全隔离 | ✅ 10 份 v2 Prompt(5 Agent × 2 audience) |
| 2 | Prompt 版本管理 — 5 Agent 全部接入版本管理 | v1/v2 双版本可回溯 + 1 分钟灰度 | ✅ manifest.json + loader.js + git tag 方案 |

**自我边界**:
- 未触碰 `src/core/router.js`、`src/api/custom.js`、`src/views/`、`src/components/`
- 不新增 Agent 类型
- 不接 Langfuse 之外的第三方 SaaS(成本不可控)
- 仅修改 `src/prompts/`(新增 10 份 .md + 1 份 loader.js + 1 份 manifest.json)

---

## 2. 文件清单(zip 内 13 个文件,保留 `src/prompts/v2/` 目录结构)

### 2.1 v2 Prompt 模板(10 份,新增)

| 路径 | 角色 | 行数 |
|------|------|------|
| `src/prompts/v2/tutor/student.md` | 专业导师 / 学生侧 | ~85 |
| `src/prompts/v2/tutor/teacher.md` | 专业导师 / 教师侧 | ~110 |
| `src/prompts/v2/diagnose/student.md` | 学习诊断 / 学生侧 | ~75 |
| `src/prompts/v2/diagnose/teacher.md` | 学习诊断 / 教师侧 | ~95 |
| `src/prompts/v2/planner/student.md` | 成长规划 / 学生侧 | ~75 |
| `src/prompts/v2/planner/teacher.md` | 成长规划 / 教师侧 | ~85 |
| `src/prompts/v2/admission/student.md` | 考研导航 / 学生侧 | ~80 |
| `src/prompts/v2/admission/teacher.md` | 考研导航 / 教师侧 | ~95 |
| `src/prompts/v2/research/student.md` | 科研成长 / 学生侧 | ~95 |
| `src/prompts/v2/research/teacher.md` | 科研成长 / 教师侧 | ~85 |

### 2.2 版本管理基础设施(3 个,新增)

| 路径 | 用途 | 行数 |
|------|------|------|
| `src/prompts/loader.js` | Prompt 加载器(getPrompt / getAllActivePrompts / listAvailableVersions) | ~190 |
| `src/prompts/prompts-manifest.json` | 版本元数据 + 灰度配置 | ~120 |
| `src/prompts/prompts-schema.json` | manifest 的 JSON schema(可用 `ajv` 校验) | ~60 |

### 2.3 测试与方案(2 个,新增)

| 路径 | 用途 |
|------|------|
| `scripts/test-prompt-v2-rollout.mjs` | 20 路径回溯测试(v1×5 + v2 student×5 + v2 teacher×5 + 灰度切流) |
| `docs/PROMPT_V2_DESIGN.md` | 完整设计说明(v2 体系 + 版本管理 + Langfuse 可选方案) |

### 2.4 修改(0 个)

无修改,全部为新增文件 — 与 v1 baseline 的 `src/prompts/{agent}.md` 完全共存。

---

## 3. 设计与实现

### 3.1 双受众隔离设计

**核心铁律**: 同一 Agent 在 `student` 与 `teacher` 两种场景下使用**完全独立**的 system prompt 文件,杜绝运行时拼接。

| Agent | student 侧专有 | teacher 侧专有 | 共享(v1 baseline) |
|------|----------------|----------------|------------------|
| tutor | 苏格拉底式引导、错题定位 | 学情关联段、班级对比 | 知识库优先铁律 |
| diagnose | score 强校验、隐私保护 | 班级聚合 4 层、Top5 薄弱 | 4 层根因链铁律 |
| planner | 个人周计划、时间窗约束 | 班级节奏、分层辅导 | 任务可执行铁律 |
| admission | 个人志愿、隐私保护 | 扎堆预警、地区分布 | 数字字段铁律 |
| research | 不推具体导师、引用核对 | 方向分布、扎堆预警 | 论文真实铁律 |

**隔离保障**:
- 文件路径独立 → sha 不同 → 任何文件级 diff 都能检测出
- 模板变量独立(`{{student_id}}` vs `{{teacher_id}}`/`{{class_id}}`)→ 上下文不混
- 审计字段(JSON 末尾的 `audience` + `student_id_hash`)→ 服务端可校验

### 3.2 版本管理方案(自建优先 + Langfuse 可选)

#### 方案 A: 自建 JSON schema + git tag(已实现,默认)

```
src/prompts/
├── {agent}.md                    # v1 baseline (1.5.0)
├── prompts-manifest.json         # 版本元数据 + 灰度
├── prompts-schema.json           # JSON schema
├── loader.js                     # 加载器
└── v2/
    ├── {agent}/
    │   ├── student.md            # v2 student
    │   └── teacher.md            # v2 teacher
```

**核心机制**:
1. **版本标识**: `{agent}/{audience}/{semver}` 格式(如 `tutor/student/2.0.0`)
2. **回溯**: git tag `prompt-v2-{agent}-{audience}-v{version}` + `prompts-manifest.json` 完整记录
3. **灰度**: manifest 改 `traffic` 字段(0-1) + git commit + Vercel 部署 ≤ 60s
4. **紧急回滚**: traffic 改 0 + active 改 v1_baseline

**1 分钟灰度实操**:
```bash
# Step 1: 改一行 prompt
vim src/prompts/v2/tutor/student.md
# Step 2: 改 manifest(可选,只改 active/traffic)
vim src/prompts/prompts-manifest.json
# Step 3: commit + push
git add -A && git commit -m "prompt: tutor/student/2.0.1 hotfix"
git push origin main
# Step 4: Vercel 部署 ≤ 60s
# Step 5: 验证(curl /api/prompt/tutor?audience=student)
```

#### 方案 B: Langfuse 可选增强(未实现,留待评估)

按 7.2 派发表格,文档原本要求"5 Agent 全部接入 Langfuse"。但任务描述硬约束"不接 Langfuse 之外的第三方 SaaS(成本不可控)"。Langfuse 自托管需额外部署、SaaS 免费档有 quota 限制——**当前阶段用方案 A 自建,Langfuse 作为 v2.1 增强项**。

如需接入,需补:
- Langfuse SDK 替换 loader.js
- 评估指标 schema(可用率 / 一致性 / hallucination)
- 与回溯测试脚本的双向同步

**建议**: v2.0 用方案 A;v3.0 数据量 > 100 万次/周时再考虑 Langfuse。

### 3.3 灰度切流算法

`loader.js#pickVersion` 基于 `salt`(默认 `student_id` / `teacher_id`)做 hash 切流:

```js
function pickVersion(agent, audience, traffic, salt) {
  if (traffic <= 0) return v1_baseline
  if (traffic >= 1) return v2[audience].active
  let hash = 0
  for (const c of salt) hash = (hash << 5) - hash + c.charCodeAt(0)
  const bucket = Math.abs(hash) % 1000 / 1000
  return bucket < traffic ? v2[audience].active : v1_baseline
}
```

- `traffic=1.0` → 100% 走 v2
- `traffic=0.5` → 50% 学生走 v2,50% 走 v1(同 student_id 永远走同一边,粘性)
- `traffic=0.0` → 100% 走 v1(紧急回滚)

### 3.4 v1 → v2 关键变化对照

| 维度 | v1.5 baseline | v2.0 多用户 SaaS |
|------|--------------|-----------------|
| 受众 | 单学生 | 学生 + 教师(双 prompt) |
| 数据隔离 | 无(student_id 隐含) | 强制 + 审计字段 |
| 灰度 | 整体替换 | traffic 0-1 灰度 + 同 salt 粘性 |
| 紧急回滚 | git revert + re-deploy | manifest 改 0 traffic(秒级) |
| 教师侧能力 | 无 | 学情关联 / 班级聚合 / 扎堆预警 |
| 论文引用核对 | 已含 OpenAlex | 继承 + 强化(防伪不推具体导师) |
| 注入防御 | 基础 | 13+ 类明确反模式 |

---

## 4. 验收

```bash
# 1. 静态校验:跑 20 路径回溯测试
node scripts/test-prompt-v2-rollout.mjs
# 期望: 5 Agent × (v1 + v2 student + v2 teacher) = 15 个版本条目
# 期望: 隔离校验 / 灰度切流 / 模板渲染 全部通过

# 2. 加载测试
node -e "
import('./src/prompts/loader.js').then(async (m) => {
  const r = await m.getPrompt('tutor', {
    audience: 'student',
    vars: { student_id: 'stu_001' }
  })
  console.log(r.prompt.slice(0, 200))
  console.log('meta:', r.meta)
})
"

# 3. CI 集成(如未来加 GitHub Actions)
- name: Prompt v2 回溯测试
  run: node scripts/test-prompt-v2-rollout.mjs
```

### 验收矩阵对照派发文档 7.2

| 派发要求 | 本次实现 | 状态 |
|---------|---------|------|
| 5 Agent 全部有 v1/v2 双版本可回溯 | 5 × 3 = 15 个版本条目,均可加载 | ✅ |
| 教师侧 Prompt 与学生侧 Prompt 完全隔离 | 独立文件 + 独立 sha + 隔离校验脚本 | ✅ |
| Prompt 改一行能在 1 分钟内灰度 | manifest 改 traffic + 1 commit + Vercel ≤ 60s | ✅ |
| 不改 Agent 核心业务目标 | 仅 prompt 文本/版本/隔离,不改 router/agent 逻辑 | ✅ |
| 不新增 Agent 类型 | 5 Agent 不变 | ✅ |
| 不接 Langfuse 之外的第三方 SaaS | 方案 A 自建;Langfuse 留 v2.1 评估 | ✅ |

---

## 5. 集成步骤(给队长)

1. **解压覆盖**:`prompt-v2.0.zip` 解到项目根,与 v1.5 baseline 共存:
   - `src/prompts/loader.js` 新增
   - `src/prompts/prompts-manifest.json` 新增
   - `src/prompts/prompts-schema.json` 新增
   - `src/prompts/v2/{agent}/{student|teacher}.md` 10 份新增
   - `scripts/test-prompt-v2-rollout.mjs` 新增
2. **修改 agent 入口**: 把 `tutor.js` / `diagnose.js` / `planner.js` / `admission.js` / `research.js` 中的
   ```js
   import { TUTOR_PROMPT } from '@/prompts/index'
   ```
   改为
   ```js
   import { getPrompt } from '@/prompts/loader'
   const { prompt: TUTOR_PROMPT, meta } = await getPrompt('tutor', {
     audience: profile?.class_id ? 'teacher' : 'student',
     vars: { student_id: profile.id, ... }
   })
   ```
3. **验证集成**:
   ```bash
   node scripts/test-prompt-v2-rollout.mjs   # 全部 PASS
   ```
4. **前端联动**(v1.5 已落 `src/core/agents/citationVerifier.js`):
   - 教师侧入口走新路由 `/teacher/{class_id}/student/{alias}`
   - 学生侧走原路由 `/chat`

---

## 6. 不在本次范围内

- Langfuse SDK 接入(留 v2.1 评估,如需)
- agent.js 内部逻辑修改(由 Agent 编排工程师或队长改)
- 班级管理 UI(由前端开发工程师)
- 教师/学生侧数据库表设计(由全栈队长)
- 多语言 i18n(留 v3.0)

---

## 7. v2.1 / v3.0 建议

1. **Langfuse 评估接入**(如需): 用 Langfuse SaaS 免费档,补 5 Agent trace 评估
2. **A/B 实验框架**: 同一版本可拆 2 个 sub-version(如 2.1.0-a / 2.1.0-b)做对照
3. **教师侧 prompt 精修**: 当前 teacher 模板偏聚合,可加"个性化辅导建议生成"子模板
4. **多语言支持**: v3.0 海外高校 ToB 时需要英文版(参考 admission 当前 5 字段结构)
5. **回溯测试扩量**: 当前 62 样本 → 加教师侧样本 60+(每 Agent 12 student + 12 teacher)
