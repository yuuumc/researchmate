<title>前端 UI 设计</title>

# 研芯通迭代方案 v1 — 基础可发布版（Trae 自建全栈）

> **版本**：v1.0 | 2026-07-27  
> **定位**：基础可发布版——自建 Vue 3 前端 + DeepSeek API + 浏览器 localStorage  
> **技术栈**：Vue 3 + Element Plus + Vite + DeepSeek-V4 API + localStorage  
> **开发工具**：Trae IDE  
> **上游文档**：无  
> **下游版本**：v2（业务闭环） / v3（参赛级）

---

## 修改说明（技术栈取舍：Trae 自建全栈的关键决策）

| 编号 | 修改点 | 取舍理由 |
|-|-|-|
| T1 | 12 节点工作流 → 前端路由 + 后端 API + AI 调用 | 切换到自建架构，工作流全部重写 |
| T2 | DeepSeek-V4 API 作为唯一 AI 模型（前期） | 用户决策；中文表现好，成本低 90%，提示词可专门优化 |
| T3 | 浏览器 localStorage 存画像 / 诊断 / 计划 | 用户决策；零成本，评审演示够用；后期可平滑迁移到自建后端 |
| T4 | Vue 3 + Element Plus 作为前端栈 | 用户决策；Trae 对 Vue 支持好，组件丰富，生态成熟 |
| T5 | 38 天计划重排：前端 2 周 + 后端 1 周 + 联调 1 周 + 测试 1 周 | 保持 38 天不变（用户决策），但任务重新分配 |
| T6 | 后期预留"自定义接入 API"扩展点 | 用户决策；后期可能接入自建模型 / 第三方 API |
| T7 | 删掉平台特定的 JSON 兜底设计（N2.5） | 前端 JS 天然有 try-catch，原 N2.5 设计改为前端 try-catch |
| T8 | 删掉平台特定的"代码节点"设计（N3/N8） | 前端直接读写 localStorage，原代码节点改为 JS 函数 |
| T9 | 保留"主控编排器"逻辑（N2 意图识别） | 这是核心创新，逻辑保留，实现改为前端 JS 模块 |
| T10 | 保留"学生画像全局共享"逻辑（N3 装配 / N8 更新） | 这是核心创新，逻辑保留，实现改为 Pinia store |
| T11 | 保留"级联管道"逻辑（N5 → N6） | 这是核心创新，逻辑保留，实现改为前端事件链 |
| T12 | 评审演示路径：本地起服务 + 浏览器打开 | 改用本地 URL（http://localhost:5173）+ 录屏 |

---

## 项目结构

```
yanxintong/
├── package.json
├── vite.config.js
├── index.html
├── .env.development          # VITE_DEEPSEEK_API_KEY=sk-xxx
├── .env.production           # 后期自定义 API 配置
├── public/
│   └── knowledge/            # 知识库静态文件（教材 / 院校 / 经验帖）
│       ├── textbook/         # PDF 切片
│       ├── university/       # JSON 数据
│       └── essays/           # Markdown
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── router/               # Vue Router
│   │   └── index.js
│   ├── stores/               # Pinia stores
│   │   ├── profile.js        # 学生画像
│   │   ├── diagnosis.js      # 诊断历史
│   │   └── plan.js           # 计划版本
│   ├── api/                  # AI 调用层
│   │   ├── deepseek.js       # DeepSeek API 封装
│   │   └── custom.js         # 后期自定义 API 接入点
│   ├── core/                 # 核心逻辑（对应原 12 节点工作流）
│   │   ├── router.js         # 主控编排器（原 N2）
│   │   ├── profileLoader.js  # 画像装配（原 N3）
│   │   ├── agents/           # 4 个业务 Agent
│   │   │   ├── tutor.js      # 专业导师（原 N4b）
│   │   │   ├── diagnose.js   # 学习诊断（原 N5）
│   │   │   ├── planner.js    # 成长规划（原 N6）
│   │   │   └── admission.js  # 考研导航（原 N7）
│   │   ├── profileUpdater.js # 画像更新（原 N8）
│   │   └── cascade.js        # 级联管道（原 N5 → N6）
│   ├── components/           # UI 组件
│   │   ├── ChatWindow.vue    # 聊天主窗口
│   │   ├── ProfileCard.vue   # 画像卡片
│   │   ├── DiagnosisReport.vue
│   │   ├── PlanCard.vue
│   │   └── AdmissionCard.vue
│   ├── views/                # 页面
│   │   ├── HomeView.vue      # 首页（输入 + 聊天）
│   │   ├── ProfileView.vue   # 画像页
│   │   ├── HistoryView.vue   # 诊断历史
│   │   └── PlanView.vue      # 计划管理
│   ├── prompts/              # Prompt 模板（4 个业务 Agent）
│   │   ├── tutor.md
│   │   ├── diagnose.md
│   │   ├── planner.md
│   │   └── admission.md
│   └── utils/
│       ├── storage.js        # localStorage 封装
│       ├── rag.js            # 简易 RAG（关键词检索 + Top-K）
│       └── validator.js      # JSON 校验
```

---

## 第 1 章：项目定位

### 1.1 项目背景

2026 年考研人数预计 343 万，其中工科占 40%。工科专业课备考面临 2 大痛点：

- **知识断层严重**：教材 / 真题 / 经验帖分散在各平台
- **通用 AI 缺乏专业课深度语料**：ChatGPT 不懂 MOSFET 阈值电压推导

### 1.2 项目定位

**研芯通**（ResearchMate）：面向工科人才培养的专业知识智能体平台。

**后端定位**：v1 没有独立的 Node.js 后端服务，**后端 = Vercel serverless API 层**（`api/chat.js` 等 serverless function），负责代理 DeepSeek 调用，不持有任何业务数据；所有业务数据（学生画像、诊断历史、计划版本）通过浏览器 `localStorage` 存储，v1 不引入数据库。这种"前端 + serverless 代理 + localStorage"的极简架构让 v1 在 38 天内可发布，v2+ 评估是否迁数据库。

### 1.3 核心创新

1. **苏格拉底式教学**：不直接给答案，而是引导学生自己推导
2. **4 层根因链诊断**：从"哪几道题错"挖到"泊松方程没学过"
3. **学科解耦架构**：换知识库就能换专业（微电子 → CS / 机械 / 电子）
4. **历次诊断追踪**：学生画像全局共享，5 轮诊断对比 + 计划版本迭代

### 1.4 目标用户

- **核心用户**：工科考研学生（大一 / 大二 / 大三）
- **首期验证场景**：微电子专业（半导体物理 / 模拟电子技术 / 数字电子技术）
- **扩展场景**：计算机科学 / 机械工程 / 电子信息

---

## 第 2 章：环境搭建

### 2.1 开发环境

| 工具 | 版本 | 说明 |
|-|-|-|
| Trae IDE | 最新版 | 用户选定的开发工具 |
| Node.js | ≥ 18.0 | 运行时 |
| npm | ≥ 9.0 | 包管理 |
| Vue 3 | 3.4+ | 前端框架 |
| Vite | 5.0+ | 构建工具 |
| Element Plus | 2.4+ | UI 组件库 |
| Pinia | 2.1+ | 状态管理 |
| DeepSeek API Key | - | AI 模型调用凭证 |

### 2.2 快速开始

```bash
# 1. 创建项目
npm create vite@latest yanxintong -- --template vue
cd yanxintong

# 2. 安装依赖
npm install element-plus pinia vue-router
npm install axios

# 3. 配置环境变量（API Key 放服务端，前端不再持有）
#    本地：复制 .env.example 为 .env，填入 DEEPSEEK_API_KEY
cp .env.example .env
#    Vercel 部署：在 Project Settings → Environment Variables 配置 DEEPSEEK_API_KEY
#    前端只调自己的 /api/chat 代理，绝不直连 DeepSeek（避免 Key 进 JS bundle 泄露）

# 4. 启动开发服务器
npm run dev
# → http://localhost:5173
```

### 2.3 项目初始化

**main.js 关键配置**：

```javascript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import router from './router'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.mount('#app')
```

### 2.4 全局变量定义（前端 store 替代全局变量）

| 原全局变量 | Trae 自建实现 | 存储位置 |
|-|-|-|
| `student_profile` | `useProfileStore().profile` | Pinia + localStorage |
| `diagnosis_history` | `useDiagnosisStore().history` | Pinia + localStorage |
| `plan_version` | `usePlanStore().currentVersion` | Pinia + localStorage |

**storage.js 封装**：

```javascript
// 通用 localStorage 封装
export const storage = {
  get(key) {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch (e) {
      console.error(`[storage] get ${key} failed:`, e)
      return null
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch (e) {
      console.error(`[storage] set ${key} failed:`, e)
      return false
    }
  },
  remove(key) {
    localStorage.removeItem(key)
  }
}
```

---

## 第 3 章：知识库构建

### 3.1 知识库结构

```
public/knowledge/
├── textbook/                 # 教材（PDF 切片后转 JSON）
│   ├── 半导体物理/
│   │   ├── chapter-1.json   # 第 1 章切片
│   │   ├── chapter-2.json
│   │   └── ...
│   ├── 模拟电子技术/
│   └── 数字电子技术/
├── university/               # 院校数据（JSON）
│   ├── 985.json
│   ├── 211.json
│   └── 双非.json
├── questions/                # 真题（JSON）
│   ├── 2024.json
│   └── 2025.json
└── essays/                   # 经验帖（Markdown）
    ├── 考研经验.md
    └── 复试经验.md
```

### 3.2 教材切片策略（v1 基础版）

**切片单位**：1 页（约 500-800 字）

**切片格式**：

```json
{
  "id": "semi-phys-ch1-p1",
  "source": "半导体物理-第1章",
  "page": 1,
  "content": "半导体物理是研究半导体材料...",
  "keywords": ["半导体", "能带", "载流子"]
}
```

**v1 切片脚本**（v1 不做高级切片，后期可优化）：

```javascript
// src/scripts/splitTextbook.js
// 简化版：按页切片
import fs from 'fs'
import path from 'path'

function splitByPage(text, sourceName) {
  const pages = text.split(/\f/) // \f 是分页符
  return pages.map((content, idx) => ({
    id: `${sourceName}-p${idx + 1}`,
    source: `${sourceName}-第${idx + 1}页`,
    page: idx + 1,
    content: content.trim(),
    keywords: extractKeywords(content)
  }))
}
```

### 3.3 简易 RAG（v1 基础版）

<callout emoji="💡">
**开发期爆雷点（P2）**：`extractKeywords` 是 v1 RAG 检索的**唯一入口**，分词质量直接决定命中率。中英文混排的工科文本（"MOSFET 阈值电压推导"）如果只用 JS 原生 `String.split(/\s+/)` 会被切成整句，**命中率≈0**。
**硬约束**：
1. 分词实现：优先用 `Intl.Segmenter('zh', { granularity: 'word' })`（浏览器原生，零依赖），如果浏览器覆盖不足再退到 `nodejieba`（build 时打包进 worker）
2. 英文 / 公式 / 专有名词保留整词（`MOSFET`、`C-V`、`pn 结`）不被中文分词器拆碎
3. **第 1 周必须用 20 条真实问题验证检索命中率**（覆盖：概念 / 真题 / 院校 / 经验帖 / 政策 5 类各 4 条），不达标（hit@5 < 0.8）则降级为"按章节手动挂标签"，不用 v1 的关键词算法硬撑
详见 §11 风险预案表"中文分词"行。
</callout>

**算法**：关键词匹配 + Top-K 排序

```javascript
// src/utils/rag.js
export function retrieve(query, knowledgeBase, topK = 5) {
  const queryKeywords = extractKeywords(query)
  const scored = knowledgeBase.map(item => {
    const score = queryKeywords.reduce((sum, kw) => {
      return sum + (item.keywords.includes(kw) ? 1 : 0)
    }, 0)
    return { ...item, score }
  })
  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
```

**v2 升级**：TF-IDF / 向量检索（Top-K + 阈值 + 重排序）

### 3.4 知识库数据来源

| 类型 | 来源 | 授权 |
|-|-|-|
| 教材 | 刘恩科《半导体物理》等 | 已购买正版 |
| 院校数据 | 各高校研究生院官网 | 公开数据 |
| 真题 | 各高校历年真题 | 公开数据 |
| 经验帖 | 知乎 / 小红书 | 已获作者授权 |

---

## 第 4 章：学生画像

### 4.1 画像结构

```json
{
  "user_id": "uuid-v4",
  "created_at": "2026-07-27T10:00:00Z",
  "updated_at": "2026-07-27T10:00:00Z",
  "weak_topics": [],           // 薄弱知识点
  "mastered_topics": [],       // 已掌握知识点
  "last_diagnosis_score": null,// 最近一次诊断分数
  "last_diagnosis_date": null, // 最近一次诊断时间
  "target_school": null,       // 目标院校
  "target_major": null,        // 目标专业
  "preparation_stage": "initial" // initial / basic / intensive / sprint
}
```

### 4.2 画像存储

**迁移路径（P3）**：v1 用 `crypto.randomUUID()` 在浏览器本地生成 `user_id`，登录时把 UUID 作为"账号体系"主键写入 localStorage。**后期迁移到自建后端时，UUID 直接映射到账号体系**（同一个 UUID 转为后端用户表的 PK），前端无感、存量数据可全量回填。

**Pinia store**：

```javascript
// src/stores/profile.js
import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'

const STORAGE_KEY = 'yanxintong_profile'

export const useProfileStore = defineStore('profile', {
  state: () => ({
    profile: storage.get(STORAGE_KEY) || {
      user_id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      weak_topics: [],
      mastered_topics: [],
      last_diagnosis_score: null,
      preparation_stage: 'initial'
    }
  }),
  actions: {
    updateProfile(updates) {
      this.profile = {
        ...this.profile,
        ...updates,
        updated_at: new Date().toISOString()
      }
      storage.set(STORAGE_KEY, this.profile)
    },
    addWeakTopic(topic) {
      if (!this.profile.weak_topics.includes(topic)) {
        this.profile.weak_topics.push(topic)
        this.updateProfile({})
      }
    },
    addMasteredTopic(topic) {
      if (!this.profile.mastered_topics.includes(topic)) {
        this.profile.mastered_topics.push(topic)
        this.updateProfile({})
      }
    }
  }
})
```

### 4.3 画像更新逻辑（v1 基础版）

**触发时机**：

- 诊断报告生成后：更新 `last_diagnosis_score` / `last_diagnosis_date` / `weak_topics` / `mastered_topics`
- 规划生成后：更新 `target_school` / `target_major` / `preparation_stage`
- 用户手动修改：直接覆盖

**v1 更新策略**：

- 字段级合并（`mastered_topics` + `weak_topics` 互斥，新增/移除触发互斥更新）
- 冲突消解：mastered 优先级 > weak（一旦标记掌握，从 weak 移除）

**v2 升级**：JSON 选型 + 完整字段级合并 + 5 轮诊断对比

---

## 第 5 章：核心架构（对应原 12 节点工作流）

### 5.1 架构映射表

| 原工作流节点 | Trae 自建实现 | 文件位置 |
|-|-|-|
| N1 入口 | ChatWindow 组件 | `src/components/ChatWindow.vue` |
| N2 意图识别 | router.js（主控编排器） | `src/core/router.js` |
| N2.5 JSON 兜底 | try-catch（前端天然支持） | 内联在 router.js |
| N3 画像装配 | profileLoader.js | `src/core/profileLoader.js` |
| N4a/b/c/d 4 个 LLM 节点 | agents/\*.js | `src/core/agents/` |
| N5 学习诊断 | diagnose.js | `src/core/agents/diagnose.js` |
| N6 成长规划 | planner.js | `src/core/agents/planner.js` |
| N7 考研导航 | admission.js | `src/core/agents/admission.js` |
| N8 画像更新 | profileUpdater.js | `src/core/profileUpdater.js` |
| N9 输出 | ChatWindow 显示 | `src/components/ChatWindow.vue` |

### 5.2 主控编排器（router.js）

**核心逻辑**：意图识别 + 路由

```javascript
// src/core/router.js
import { tutorAgent } from './agents/tutor'
import { diagnoseAgent } from './agents/diagnose'
import { plannerAgent } from './agents/planner'
import { admissionAgent } from './agents/admission'
import { loadProfile } from './profileLoader'
import { updateProfile } from './profileUpdater'
import { cascadeDiagnoseToPlan } from './cascade'

// 意图识别 Prompt（v1 基础版）
const INTENT_PROMPT = `
你是研芯通的主控编排器，负责识别学生输入的意图。
可选意图：
- concept：概念问题（如"MOSFET 阈值电压怎么推导"）
- diagnose：诊断请求（如"我半导体物理考了 55 分"）
- plan：规划请求（如"帮我做下个月复习计划"）
- admission：择校请求（如"我双非前 30%，想去长三角"）
- cascade：级联请求（如"先诊断再规划"）

请仅返回 JSON 格式：{"intent": "concept|diagnose|plan|admission|cascade", "raw_query": "<学生原始输入>"}
`

export async function route(userInput) {
  try {
    // 1. 加载学生画像
    const profile = loadProfile()

    // 2. 意图识别（调用 DeepSeek）
    const intentResult = await callDeepSeek(INTENT_PROMPT, userInput)
    const intent = JSON.parse(intentResult)

    // 3. 路由到对应 Agent
    switch (intent.intent) {
      case 'concept':
        return await tutorAgent(userInput, profile)
      case 'diagnose':
        return await diagnoseAgent(userInput, profile)
      case 'plan':
        return await plannerAgent(userInput, profile)
      case 'admission':
        return await admissionAgent(userInput, profile)
      case 'cascade':
        return await cascadeDiagnoseToPlan(userInput, profile)
      default:
        return { error: 'unknown_intent' }
    }
  } catch (e) {
    // v1 兜底：意图识别失败，按 concept 处理
    console.error('[router] intent recognition failed:', e)
    return await tutorAgent(userInput, loadProfile())
  }
}
```

### 5.3 DeepSeek API 封装

**安全改造（P0）**：Vite 构建会把 `import.meta.env.VITE_*` 静态替换进 JS bundle，部署到 Vercel 等公网后 **API Key 明文可见**，任何人按 F12 即可盗用。改造方案：前端只调 `/api/chat`（同源），由 Vercel serverless function 转发到 DeepSeek，`DEEPSEEK_API_KEY` 放服务端环境变量。

<callout emoji="💡">
**Vercel serverless 代理**（新建 `api/chat.js`，约 30 行）：
</callout>

```javascript
// api/chat.js (Vercel serverless function)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { prompt, userInput, options = {} } = req.body || {}
  const apiKey = process.env.DEEPSEEK_API_KEY // 服务端环境变量，Vercel Project Settings 配置
  if (!apiKey) return res.status(500).json({ error: 'DEEPSEEK_API_KEY not configured' })
  try {
    const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || 'deepseek-chat',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: userInput }
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 2000
      })
    })
    const data = await r.json()
    res.status(200).json({ content: data.choices?.[0]?.message?.content || '' })
  } catch (e) {
    res.status(502).json({ error: 'upstream_error', message: String(e) })
  }
}
```

```javascript
// src/api/deepseek.js (v1 改造：前端只调自己的代理，不再持有 Key)
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '', // 空字符串 = 同源，请求 /api/chat
  headers: { 'Content-Type': 'application/json' }
})

export async function callDeepSeek(prompt, userInput, options = {}) {
  const {
    model = 'deepseek-chat', // 第 1 周验证官方文档确认可用 model ID
    temperature = 0.7,
    max_tokens = 2000
  } = options
  const { data } = await client.post('/api/chat', { prompt, userInput, options: { model, temperature, max_tokens } })
  return data.content
}
```

### 5.4 自定义 API 接入点（后期扩展）

```javascript
// src/api/custom.js
// 后期接入自建模型 / 第三方 API 的扩展点
export async function callCustomAPI(prompt, userInput, options = {}) {
  // 占位：后期实现
  // 例如：调用本地部署的 Qwen / Llama / 自训练模型
  throw new Error('Custom API not implemented yet')
}

// 路由策略：v1 用 DeepSeek，后期可切换
export const AI_PROVIDER = {
  current: 'deepseek', // 'deepseek' | 'custom'

  async call(prompt, userInput, options) {
    if (this.current === 'deepseek') {
      return await callDeepSeek(prompt, userInput, options)
    } else {
      return await callCustomAPI(prompt, userInput, options)
    }
  }
}
```

---

## 第 6 章：各 Agent Prompt（v1 基础版）

### 6.1 主控编排器 Prompt

见 § 5.2 router.js 中的 `INTENT_PROMPT`

### 6.2 专业导师 Prompt（v1 基础版）

```markdown
# 角色
你是研芯通的专业导师，负责回答学生的专业课概念问题。

# 风格
采用苏格拉底式教学法，不直接给答案，而是引导学生自己推导。

# 步骤
1. 先询问学生是否掌握前置知识
2. 设计 3-5 个阶梯引导问题
3. 每阶梯带判断问题（"你能想到下一步吗？"）
4. 学生在哪一步卡住，就重点讲解该步

# 输出格式
Markdown，包含：
- 前置知识检查
- 阶梯引导（带判断问题）
- 关键提示（不直接给答案）

# 示例
学生：MOSFET 阈值电压怎么推导？
回答：
## 前置知识检查
- 半导体表面势是什么？（如不会，先补这块）
- 能带弯曲的物理意义是什么？
## 阶梯引导
1. MOSFET 阈值电压的定义是什么？
2. 强反型层的判据是什么？
3. 表面势 ψ_s = 2φ_F 时，对应的栅压是什么？
4. 求解 ψ_s = 2φ_F 时的 V_GS，就是阈值电压。
## 关键提示
- 注意区分表面势和费米势
- 衬底偏置效应会影响阈值电压
```

**v2 升级**：增加"反模式约束"（防止直接给答案）

### 6.3 学习诊断 Prompt（v1 基础版）

```markdown
# 角色
你是研芯通的学习诊断专家，负责分析学生的错题和薄弱点。

# 输入
- 考试科目和分数
- 错题列表（章节 + 题号）
- 学生描述

# 输出
- 表面问题（哪几道题错）
- 直接原因（哪些知识点不熟）
- 根因（哪些上游知识点没掌握）
- 补强方案（具体到教材页码和题目号）
```

**v2 升级**：4 层根因链结构化（表面 / 直接 / 中间 / 根本）

### 6.4 成长规划 Prompt（v1 基础版）

```markdown
# 角色
你是研芯通的成长规划师，负责根据学生诊断结果生成个性化复习计划。

# 输入
- 学生画像（薄弱点 / 已掌握 / 备考阶段）
- 学生目标（院校 / 专业 / 时间）

# 输出
- 周计划（每周任务清单）
- 每日安排（具体到时间段）
- 补强任务（针对薄弱点）
```

**v2 升级**：紧急度分档 + 动态调整 3 类（保留 / 强化 / 放弃）

### 6.5 考研导航 Prompt（v1 基础版）

```markdown
# 角色
你是研芯通的考研导航专家，负责根据学生背景推荐院校。

# 输入
- 学生背景（学校 / 排名 / 目标地区 / 兴趣方向）
- 学生需求（冲刺 / 稳妥 / 保底）

# 输出
- 推荐院校（3 档：冲刺 / 稳妥 / 保底，每档 2 所）
- 录取概率分析
- 数据来源（每条数据带 URL + 年份）
```

**v2 升级**：录取概率公式化 + 数据来源 URL

<callout emoji="🚫">
**硬约束（防止 LLM 编造数字）**：考研导航输出的**所有数字字段**（分数线 / 报录比 / 录取概率 / 招生人数 / 年份）**禁止由 LLM 自由生成**。LLM 在压力下会编造"以假乱真"的 URL 和数字（评审当场无法核实），直接破坏可信度。
**正确做法**：
1. 数字只从 `university/*.json`（`src/data/university/*.json`）本地数据渲染，**前端模板绑定**字段（如 `{{ row.school }} {{ row.year }} 报录比 {{ row.ratio }}`）
2. LLM 只做 2 件事：① 匹配（哪 3 档各推哪 2 所）② 推荐理由（自然语言解释）
3. Prompt 模板明确禁止生成数字（加一行 `# 硬约束：不得编造任何数字字段，所有数字必须来自提供的院校数据上下文`）
4. 院校数据来源 URL 由 `university/*.json` 的 `source_url` 字段直接渲染，不让 LLM 拼 URL
</callout>

### 6.6 初始化对话 Prompt（v1 基础版）

```markdown
# 角色
你是研芯通的引导员，负责帮助新用户完成初始化。

# 步骤
1. 欢迎语（不超过 50 字）
2. 询问 3 个关键信息：
   - 你是什么专业的？
   - 你现在大几？
   - 你的目标院校是？
3. 根据回答初始化学生画像
4. 给出下一步建议（"现在可以问我一个专业课问题"）
```

---

## 第 7 章：测试

### 7.1 单元测试（v1 基础版）

<callout emoji="💡">
**测试工具链（P2 必补）**：
- **单测**：Vitest（`npm i -D vitest @vue/test-utils`）· 配置 `vite.config.ts` 加 `test:` 块 · `npm run test:unit`
- **端到端**：Playwright（`npm i -D @playwright/test`）· `npx playwright install chromium` · 5 个标准对话脚本（与 §7.2 一一对应）
- **DeepSeek mock**：用 `msw`（Mock Service Worker）拦截 `/api/chat` 请求，返回预设 fixture · 否则 §7.3 边界用例（API 失败 / 超时）无法在 CI 复现
- **覆盖率门槛**：utils/\* 与 stores/\* 覆盖率 ≥ 70%，components/\* 关键路径（ChatWindow / 4 个业务卡）≥ 50%
</callout>

| 测试对象 | 测试用例 | 通过条件 |
|-|-|-|
| storage.js | get/set/remove 正常 | 3 个用例全过 |
| rag.js | 关键词检索 + Top-K | 5 个用例全过 |
| router.js | 4 种意图路由 | 4 个用例全过 |
| profile.js | 画像增删改 | 5 个用例全过 |

### 7.2 端到端测试

**5 个标准对话**：

1. "MOSFET 阈值电压怎么推导？"（concept）
2. "我半导体物理考了 55 分"（diagnose）
3. "帮我做下个月复习计划"（plan）
4. "我双非前 30%，想去长三角"（admission）
5. "先诊断再规划"（cascade）

**通过条件**：5 个对话全部成功，UI 显示正确，画像更新正确。

### 7.3 边界测试

| 用例 | 输入 | 预期 |
|-|-|-|
| 空输入 | "" | 提示"请输入问题" |
| 超长输入 | 1000+ 字 | 正常处理（截断或分段） |
| DeepSeek API 失败 | 网络断开 | 显示"AI 服务暂不可用，请稍后再试" |
| localStorage 满 | 存储超限 | 提示"存储空间不足" |

---

## 第 8 章：发布

### 8.1 本地启动（评审演示用）

```bash
npm run dev
# → http://localhost:5173
```

### 8.2 构建生产版本

```bash
npm run build
# 输出到 dist/ 目录
```

### 8.3 部署选项

| 方案 | 适用场景 | 成本 |
|-|-|-|
| Vercel | 评审演示 + 长期运行 | 免费 |
| Netlify | 评审演示 + 长期运行 | 免费 |
| GitHub Pages | 评审演示 | 免费 |
| 阿里云 OSS | 国内访问 | 低价 |

**v1 推荐**：Vercel（自动 HTTPS，部署简单）

<callout emoji="💡">
**安全部署清单（P0 必做）**：Vercel 部署时**只把 `api/chat.js` 部署为 serverless function，`DEEPSEEK_API_KEY` 必须在 Vercel Project Settings → Environment Variables 配置**，绝不能走 `VITE_*` 前缀注入。具体步骤：
1. Vercel Project → Settings → Environment Variables → 添加 `DEEPSEEK_API_KEY` = `sk-...`
2. 确认 `api/chat.js` 放在仓库根目录（Vercel 自动识别为 serverless function）
3. **删除**所有 `VITE_DEEPSEEK_API_KEY` 相关代码（已被 `api/chat.js` 取代）
4. 部署后用 `curl https://your-app.vercel.app/api/chat -X POST -H "Content-Type: application/json" -d '{"prompt":"hi","userInput":"hello"}'` 验证代理可用
5. 浏览器 DevTools Network 面板确认前端请求的是 `/api/chat` 而非 `api.deepseek.com`
</callout>

### 8.4 评审演示准备

- 本地起服务：`npm run dev`
- 浏览器打开：`http://localhost:5173`
- 录屏备用：OBS / Windows Game Bar
- 备用设备：笔记本 + 平板

---

## 第 9 章：参赛材料

### 9.1 演示视频

- 时长：≤ 5 分钟
- 分辨率：1080P
- 大小：≤ 200MB
- 内容：5 段（痛点 / 功能 / 架构 / 创新 / 效果）

### 9.2 技术文档

- 字数：≤ 2000 字
- 章节：5 章（背景 / 架构 / 创新 / 效果 / AI 标识）

### 9.3 报名表

- 平台填写
- 10 个字段（作品名 / 简介 / 团队 / 教师 / 联系方式 / 链接 / 视频 / 文档 / 测试账号 / 备注）

### 9.4 提交清单

- 6 项材料（报名表 / 链接 / 视频 / 文档 / 工作流截图 / 测试账号）

**v3 详细产出**：见 v3 文档 § 参赛材料整合

---

## 第 10 章：38 天计划（v1 重排版）

### 时间分配（用户决策）

| 阶段 | 时间 | 占比 |
|-|-|-|
| 前端开发 | 2 周（14 天） | 37% |
| 后端 + API 集成 | 1 周（7 天） | 18% |
| 联调 + 测试 | 1 周（7 天） | 18% |
| 测试 + 验收 | 1 周（7 天） | 18% |
| 缓冲 + 参赛材料 | 3 天 | 9% |

### 详细计划

| 周 | 日期范围 | 任务 | 产出 |
|-|-|-|-|
| 第 1 周 | 7/28-8/3 | 项目初始化 + Vue 3 搭建 + 路由 + Pinia + Element Plus | 项目骨架 |
| 第 2 周 | 8/4-8/10 | 前端组件开发（ChatWindow / ProfileCard / 各业务卡） | 完整前端 |
| 第 3 周 | 8/11-8/17 | DeepSeek API 封装 + 4 个业务 Agent + 主控编排器 | 后端逻辑完成 |
| 第 4 周 | 8/18-8/24 | 联调：前后端 + AI 调用 + localStorage | 端到端可用 |
| 第 5 周 | 8/25-8/31 | 测试：单元 + 端到端 + 边界 + 盲测 | 测试通过 |
| 第 6 周 | 9/1-9/6 | 参赛材料（视频 / 文档 / 报名表） + 最终回归 | 可提交 |

---

## 第 11 章：风险预案

### 11.1 技术风险

| 风险 | 概率 | 影响 | 应对 |
|-|-|-|-|
| DeepSeek API 不稳定 | 中 | 高 | 备用 OpenAI API；本地缓存常见问答 |
| DeepSeek API 限流 | 中 | 中 | 评审前申请高额度；本地预热 |
| localStorage 容量限制 | 低 | 中 | 提示用户清理；数据压缩 |
| Trae IDE 不熟悉 | 中 | 中 | 团队培训 1 天；准备 WebStorm 备用 |

### **11.1.bis 额外风险（v1 评审发现）**

| 风险 | 概率 | 影响 | 应对 |
|-|-|-|-|
| **API Key 裸露进 JS bundle** | 高 | **高** | P0 改造：API Key 放 Vercel serverless 环境变量，前端只调 `/api/chat` 代理（详见 §5.3 / §8.3） |
| 中文分词失效导致 RAG 命中率≈0 | 中 | 高 | P2 约束：第 1 周用 20 条真实问题验证 hit@5，不达标降级为按章节手动挂标签（详见 §3.3） |
| 考研导航 LLM 编造分数线/报录比/URL | 中 | **高**（可信度崩盘） | P2 硬约束：数字字段只从 `university/*.json` 本地渲染，LLM 只做匹配（详见 §6.5） |

### 11.2 评审风险

| 风险 | 概率 | 影响 | 应对 |
|-|-|-|-|
| 本地服务无法访问 | 中 | 高 | 录屏备份；Vercel 部署备用链接 |
| DeepSeek API 超时 | 中 | 高 | 备用 API；本地 mock 数据 |
| 浏览器兼容问题 | 低 | 中 | 测试 Chrome / Edge / Safari |
| 投屏失败 | 中 | 中 | 备用设备；本地截图 |

### 11.3 人员风险

| 风险 | 概率 | 影响 | 应对 |
|-|-|-|-|
| 核心开发请假 | 中 | 高 | 任务并行；文档齐全 |
| 进度延期 | 中 | 高 | 每周 review；及时调整 |

---

## 现状基线

| 维度 | 状态 | 说明 |
|-|-|-|
| 项目骨架 | 待搭建 | v1 第 1 周 |
| 前端组件 | 待开发 | v1 第 2 周 |
| 后端 API | 待封装 | v1 第 3 周 |
| AI Agent | 待实现 | v1 第 3 周 |
| 知识库 | 待准备 | 需上传教材 PDF |
| 测试 | 待执行 | v1 第 5 周 |
| 参赛材料 | 待制作 | v1 第 6 周 |
| 评审演示 | 待准备 | v1 第 6 周 |

---

*v1 基础可发布版 · 文档结束*

# 前端 UI 设计

<callout emoji="🎨">
**设计基线**：本文 UI 设计采用**知识图谱风设计系统 v2.0**——以墨蓝学术调色板（`--color-ink-900/700/500/300/100`）替代 v1 紫色品牌色，以衬线学术字体（`--font-serif`）做标题、等宽字体（`--font-mono`）做数据/路径条，核心隐喻为「知识网络 / Agent 星座 / 思维路径 / 节点轴线」。背景层为浅灰冷底（`--color-bg-base #f4f6fa`）+ 流动节点连线 SVG，卡片悬浮层叠感（shadow-md + radius-lg）。4 业务 Agent 用 4 节点状态色区分（导师=钢蓝/诊断=琥珀/规划=青绿/择校=珊瑚红），消息流采用节点轴线（每条消息左侧有节点圆点 + 连线），路径条用终端命令行提示符 ▸。8 级字号阶梯 / 8 栅格间距 / 圆角阶梯保持不变。技术栈 Vue 3 + Element Plus，开发在 Element Plus 默认样式上以 CSS 变量做 Token 覆盖，保留其可达性与响应式能力。UI 层只新增"学科切换"与"演示状态条"两块（第 7 章中标注），其余 UI 资产整体平迁。
</callout>

**本章范围**：v1 基础可发布版——4 个核心页面（Home / Profile / History / Plan）+ 4 个业务 Agent 卡（苏格拉底导师 / 学习诊断 / 成长规划 / 考研导航）+ 1 套评审演示包装。后续 v2/v3 在此基础上叠加增量，演进路径在每版文档中独立成节。

## 1. 信息架构与页面清单

<grid>
<column width-ratio="0.500000">
### v1 页面（4 个）
1. **HomeView**：输入 + 聊天主战场 — 包含 ChatWindow / QuickActionBar / RAGPanel
2. **ProfileView**：学生画像查看与编辑 — 包含 ProfileCard / TopicChips
3. **HistoryView**：诊断历史列表 — 包含 DiagnosisCard（v1 仅列表，无对比）
4. **PlanView**：当前计划查看 — 包含 PlanCard / WeekList
**全局壳层**：TopBar（Logo + AgentSwitchBar + 演示状态条 + 用户入口）
</column>
<column width-ratio="0.500000">
### 核心组件（9 个，全部对齐知识图谱风设计系统 v2.0）
- ChatWindow（自定义） — 聊天主窗口
- ProfileCard（自定义） — 画像卡
- DiagnosisCard（自定义） — 诊断卡（v1 列表项）
- PlanCard（自定义） — 计划卡
- AdmissionCard（自定义） — 院校推荐卡
- AgentSwitchBar（Element Plus Tabs） — 4 业务 Agent 切换
- QuickActionBar（自定义） — 快捷问题（4 个预设）
- RAGPanel（自定义） — Top-K 引用面板（折叠态）
- EmptyState（自定义） — 空态 / Loading / Error 三态
</column>
</grid>

### 路由结构

## 2. 全局壳层：TopBar

所有页面共用 64px 高的 TopBar，承载 Logo / Agent 切换 / 演示状态条 / 用户入口，是评审演示时最先被看到的一层。

<grid>
<column width-ratio="0.500000">
### 布局与 Token
- 容器：`height: 64px` · `padding-x: 24px (--space-6)` · `bg: --color-bg-deep`（墨蓝页头条）· `border-bottom: 1px --color-ink-700` · 顶部 1px 高光线 `--color-node-active`
- 背景：TopBar 内嵌流动节点连线 SVG（透明度 6%，仅页头条做隐喻提示，形成"Agent 星座"基底）
- Logo：`width: 28px height: 28px` · 纯色 `--color-ink-700`（禁渐变，纯色节点风）· 右侧产品名 `--font-serif 18px / weight 600 / color: --color-bg-elevated`
- AgentSwitchBar：4 个 Tab 等宽 · `height: 40px` · 选中态纯色 `color: --color-bg-elevated + border-bottom: 2px`（**不**用渐变，激活 Tab 即"当前 Agent 节点"高亮，下划线色 = 该 Agent 节点状态色：导师=钢蓝/诊断=琥珀/规划=青绿/择校=珊瑚红）
- 演示状态条（Trae 自建全栈新增）：本地起服务时显示，`bg: --color-bg-elevated` + 左侧 3px `--color-node-active` 边条 + ⚙️ 图标 + 文字"本地开发服务 · `localhost:5173`"（`--font-mono 12px`）
- 用户入口：圆形 32px 头像 + 姓名缩写（背景 `--color-ink-500`）· hover 弹出 Popover（设置 / 退出）
</column>
<column width-ratio="0.500000">
### 结构示意
<callout emoji="💡">
┌────────────────────────────────────────────────────────────────┐  
│ 🎓 研芯通  │ 导师  诊断  规划  择校  │  ✅ 本地开发服务  │  YM  │  
│ (28px 纯色) │  active=underline(2px)  │  localhost:5173  │ 32px │  
└────────────────────────────────────────────────────────────────┘  
h-64, px-24, border-b ink-700, bg bg-deep, 顶部高光线 node-active
（4 Tab 下划线 = 当前 Agent 节点状态色：导师=钢蓝/诊断=琥珀/规划=青绿/择校=珊瑚红）
</callout>
**说明**：AgentSwitchBar 当前激活 Agent 即"Agent 星座"中当前节点；切换 Tab 不清空聊天历史，仅切换主控编排器默认路由。用户点 Agent 卡时自动滚到 ChatWindow 顶部。
</column>
</grid>

## 3. 页面 1：HomeView（输入 + 聊天）

主战场，承担 4 大业务 Agent 全部对话流，是评审演示 5 个标准对话的承载页面。

### 3.1 布局结构（桌面 ≥ 1024px）

<callout emoji="💡">
┌──────────────────────────────────────────────────────────────────────┐  
│  TopBar (h-64, bg bg-deep, 顶部高光线 node-active)                    │  
├──────────────────────────────────────────────────────────────────────┤  
│  Hero 首屏区 (px-6, py-8, 节点连线 SVG 背景 6% 透明)                   │  
│  「你今天想攻克哪个考点？」  --font-serif 32px / weight 700 / ink-900  │  
│  「4 个 Agent 协同，可随时切换」   --font-sans 14px / color-fg-secondary│  
│  路径条 ▸ home ▸ tutor  (--font-mono 12px / color-fg-tertiary)        │  
├──────────────────────────────────────────────────────────────────────┤  
│                                                                      │  
│  ┌─ ChatWindow (max-w-960, mx-auto, px-6, bg bg-elevated) ────────┐  │  
│  │  [EmptyState 首次进入]                                          │  │  
│  │    ── 4 个快捷问题卡 (QuickActionBar, 2×2 网格, gap-4)         │  │  
│  │  ┌──────────────────┐  ┌──────────────────┐                    │  │  
│  │  │ 📘 概念引导        │  │ 🩺 学习诊断        │                    │  │  
│  │  │ 苏格拉底式教学     │  │ 4 层根因链         │                    │  │  
│  │  │ 边条: node-info   │  │ 边条: node-warn   │                    │  │  
│  │  └──────────────────┘  └──────────────────┘                    │  │  
│  │  ┌──────────────────┐  ┌──────────────────┐                    │  │  
│  │  │ 📅 成长规划        │  │ 🎯 考研导航        │                    │  │  
│  │  │ 个性化周计划       │  │ 数据驱动院校推荐   │                    │  │  
│  │  │ 边条: node-active │  │ 边条: node-weak   │                    │  │  
│  │  └──────────────────┘  └──────────────────┘                    │  │  
│  │                                                                │  │  
│  │  [节点轴线消息流]                                               │  │  
│  │  ●─ 12:34  user: MOSFET 阈值电压怎么推导？(right, bg ink-100)  │  │  
│  │  │                                                              │  │  
│  │  ●─ 12:34  agent: ## 1. 前置知识检查 …(left, bg bg-elevated)   │  │  
│  │  │  左侧色条: node-info (导师)                                  │  │  
│  │  │  [RAGPanel 折叠条 ▾ 命中 3 条引用]                           │  │  
│  └────────────────────────────────────────────────────────────────┘  │  
│                                                                      │  
│  ┌─ InputBar (sticky bottom, h-72, bg bg-elevated) ────────────────┐  │  
│  │  ▸ [textarea 自适应 1-4 行, --font-mono 14px]            [发送 ➤] │  │  
│  │  提示：「Enter 发送 / Shift+Enter 换行 / Esc 取消当前生成」        │  │  
│  └────────────────────────────────────────────────────────────────┘  │  
└──────────────────────────────────────────────────────────────────────┘
</callout>

### 3.2 关键 Token 与组件引用

- **页面标题**：`--font-serif 32px / line-height 1.2 / weight 700 / color-fg-primary (ink-900)` · 下间距 `--space-2 (8px)` · 衬线学术感
- **副标题**：`--font-sans 14px / color-fg-secondary` · 下间距 `--space-8 (32px)`
- **路径条**：`--font-mono 12px / color-fg-tertiary` · 前置终端命令行提示符 `▸`（如 `▸ home ▸ tutor`）
- **ChatWindow 容器**：`max-w-960 mx-auto px-6` · 上下 `--space-6 (24px)` 呼吸 · `bg --color-bg-elevated` · 背景嵌流动节点连线 SVG（4% 透明）
- **节点轴线消息流**：每条消息左侧 16px 处渲染节点圆点（8px 圆，对应 Agent 节点状态色）+ 垂直连线（1px `--color-border-default`，节点间贯穿），形成"思维路径"视觉
- **用户气泡**：`bg --color-ink-100 / color-fg-primary / radius-lg (12px) / padding --space-3 --space-4 / self-flex-end / max-w-70%` · 节点圆点用 `--color-ink-300`
- **Agent 气泡**：`bg --color-bg-elevated / border 1px --color-border-subtle / radius-lg / padding --space-4 / self-flex-start / max-w-85%` · 左侧 3px 色条对应 Agent 节点状态色 · 节点圆点用对应节点状态色 + `--shadow-node` 光晕
- **QuickActionBar 4 卡**：2×2 网格 · `gap --space-4 (16px)` · 单卡 `padding --space-4 (16px) / radius-lg / border 1px --color-border-subtle / shadow-sm / hover: shadow-md + border --color-ink-300` · 每卡左侧 3px 色条对应 4 节点状态色（导师=钢蓝/诊断=琥珀/规划=青绿/择校=珊瑚红）
- **InputBar**：`position: sticky / bottom: 0 / bg --color-bg-elevated / border-top 1px --color-border-subtle / padding --space-3 --space-4` · 内部 textarea `--font-mono 14px` 高度自适应 1-4 行 · 前置提示符 `▸`
- **发送按钮**：Primary CTA，`bg --color-ink-700 / color white / h-10 px-4 / radius-md` · disabled 态 `opacity: 0.5 / cursor: not-allowed`（禁渐变，纯墨蓝节点风）

### 3.3 RAGPanel（Top-K 引用面板）

v1 简易 RAG 关键词检索 + Top-K，命中结果以折叠条形式挂在 Agent 气泡下方，点击展开。

- **收起态**：`h-8 px-3` · `bg --color-bg-sunken / radius-sm / --font-mono 12px / color-fg-secondary` · 文字「📚 引用 3 条 ▾」· 前置提示符 `▸`
- **展开态**：每条 `h-auto px-3 py-2` · 左侧 2px `--color-ink-500` 边条 · 顶部 `--font-mono 12px / color-fg-tertiary` 显示来源（如"教材-半导体物理-第3章"）· 下方 `--font-sans 14px` 引用前 80 字 · hover 整条 `bg --color-bg-sunken`
- **无命中态**：「📚 无知识库命中」灰色提示条（`--color-fg-muted`）+ 引导"换个关键词"

## 4. 页面 2：ProfileView（学生画像）

v1 画像含 9 个字段（user_id / weak_topics / mastered_topics / last_diagnosis_score / 等），UI 用 ProfileCard + TopicChips 两类组件呈现。

### 4.1 布局

<callout emoji="💡">
┌──────────────────────────────────────────────────────────────────────┐  
│  TopBar (bg bg-deep, 节点连线 SVG)                                      │  
├──────────────────────────────────────────────────────────────────────┤  
│  ▸ home ▸ profile  (路径条 --font-mono 12px / color-fg-tertiary)        │  
│  ┌─ ProfileCard (max-w-960, mx-auto, p-6, bg bg-elevated, shadow-md) ┐│  
│  │  ┌─ Avatar 80px ─┐  余明昌  (--font-serif 22px / weight 600)       ││  
│  │  │  YM 圆形      │  微电子 · 大三 · 复旦微电子 目标                 ││  
│  │  │  bg ink-500   │  (--font-sans 14px / color-fg-secondary)        ││  
│  │  └───────────────┘  备考阶段：[initial]  初始 → 基础 → 强化 → 冲刺 ││  
│  │                  (进度条 h-2, 当前位 25%, fill --color-node-info)   ││  
│  │                                                                   ││  
│  │  最近一次诊断  2026-07-26   55 / 100  (--color-node-weak)           ││  
│  │  ──────────────────────────────────────────────────────          ││  
│  │  薄弱知识点 (TopicChips, weak 系, 边条 node-weak)                   ││  
│  │  [MOSFET C-V]  [短沟道效应]  [强反型判据]                          ││  
│  │  ──────────────────────────────────────────────────────          ││  
│  │  已掌握 (TopicChips, active 系, 边条 node-active)                   ││  
│  │  [能带基础]  [PN 结]  [费米势]                                       ││  
│  │  ──────────────────────────────────────────────────────          ││  
│  │  [✏️ 编辑画像]  (outline btn)  [🗑 重置]  (ghost danger btn)        ││  
│  └───────────────────────────────────────────────────────────────────┘│  
└──────────────────────────────────────────────────────────────────────┘
</callout>

### 4.2 TopicChips 状态矩阵（复用 Badge 规范 §3.4）

- **薄弱点**：`bg --color-node-weak + opacity 0.12 / color --color-node-weak / border 1px --color-node-weak` · hover 加深 4%（节点状态色 = 珊瑚红）
- **已掌握**：`bg --color-node-active + opacity 0.12 / color --color-node-active / border 1px --color-node-active`（节点状态色 = 青绿）
- **已掌握后又被移入薄弱**（冲突态）：`bg --color-node-warn + opacity 0.12 / color --color-node-warn / border 1px --color-node-warn` + 角标 ⚠️（节点状态色 = 琥珀）
- **新增 chip（动画）**：`transform: scale(0.8→1) opacity: 0→1` 200ms ease-out · 配 `--shadow-node` 光晕淡入

**操作**：点 chip 弹 Popover 提供"标记掌握 / 标记薄弱 / 移除"3 个按钮（轻量 Popover，无遮罩）· Popover 头部用 `--font-serif` 衬线小标题。

## 5. 页面 3：HistoryView（诊断历史）

v1 仅做历史列表（v2 才上"5 轮对比"功能）。

- **列表容器**：max-w-960 mx-auto · 单卡间距 `--space-3 (12px)` · 容器左侧渲染节点时间轴（每个 DiagnosisCard 对应一个节点圆点 + 垂直连线，形成"诊断历程"思维路径）
- **DiagnosisCard（v1 列表项）**：  

  - 整体：`padding --space-5 (20px) / radius-lg / shadow-sm / bg --color-bg-elevated / border 1px --color-border-subtle` · hover `shadow-md` 层叠抬起感
  - 顶部：左 8 字大字分数（`--font-serif 32px / weight 700` · 分数 < 60 用 `--color-node-weak` · 60-75 用 `--color-node-warn` · >75 用 `--color-node-active`）· 右侧日期 `--font-mono 12px / color-fg-tertiary`
  - 中部：薄弱点 3-5 个 TopicChips（复用 §4.2 规范）
  - 底部：操作行 [📄 查看完整诊断] (ghost) [🗑 删除] (ghost danger, 二次确认 Modal)
- **空态**：EmptyState 组件，`icon size 64px / color-fg-tertiary` + `--font-serif` 衬线"还没有诊断记录" + "现在去做一次诊断" CTA 按钮跳回首页

## 6. 页面 4：PlanView（计划管理）

- **顶部摘要条**：PlanCard · `padding --space-6 (24px) / bg --color-bg-elevated / shadow-md` · 衬线标题 `--font-serif 22px` · 显示计划版本 `currentVersion`（v1 = 0，初次生成时 +1）· 目标院校 · 4 周目标
- **周计划列表**：每周一个折叠卡（`<details><summary>` 原生，无 ARIA 自找麻烦）· 默认展开第 1 周 · 折叠态只显示周次 + 任务计数 · 卡片左侧渲染节点轴线（每周一个青绿节点圆点 + 连线，对应 planner Agent 节点状态色 `--color-node-active`）
- **每日安排**：每条 `h-10 px-3` · 左侧时间段（`--font-mono 14px / color-fg-secondary`，宽 80px，前置提示符 `▸`）· 中间任务 · 右侧状态徽章（待办 / 完成 / 跳过，3 态用 `bg --color-bg-sunken / bg --color-node-active + opacity 0.12 / bg --color-node-weak + opacity 0.12`）
- **操作**：[🔄 重新生成计划] 主 CTA（`bg --color-node-active / color white`，调用 planner Agent）· [📥 导出] outline 按钮（v1 仅导出 Markdown）

## 7. 4 个业务 Agent 卡的差异化呈现

AgentSwitchBar 切换 + ChatWindow 内不同 Agent 气泡采用 4 节点状态色区分（v1 骨架版规范）——每个 Agent 在"Agent 星座"中对应一个固定颜色节点，气泡左侧 3px 色条 + 节点轴线圆点 + `--shadow-node` 光晕共同构成视觉身份。

<grid>
<column width-ratio="0.500000">
### 专业导师（tutor） · 钢蓝节点
- 节点状态色：`--color-node-info: #4d9de0`（钢蓝，信息/中性）
- 气泡左侧 3px `--color-node-info` 边条 · 节点圆点 `--color-node-info` + `--shadow-node` 钢蓝光晕
- Header 图标 📘 + "专业导师"（标题 `--font-serif`）
- 回答结构：前置知识检查 → 阶梯引导 → 关键提示
- 学生可点阶梯任一步直接给答案（演示时操作）
</column>
<column width-ratio="0.500000">
### 学习诊断（diagnose） · 琥珀节点
- 节点状态色：`--color-node-warn: #ffd166`（琥珀，警告/进行中）
- 气泡左侧 3px `--color-node-warn` 边条 · 节点圆点 `--color-node-warn` + `--shadow-node` 琥珀光晕
- Header 图标 🩺 + "学习诊断"（标题 `--font-serif`）
- 回答结构：L1 表面 → L2 直接 → L3 中间 → L4 根本 → 补强方案
- 完成后自动写入 `profile.weak_topics`，Toast 提示"画像已更新"
</column>
</grid>

<grid>
<column width-ratio="0.500000">
### 成长规划（planner） · 青绿节点
- 节点状态色：`--color-node-active: #00d4aa`（青绿，已掌握/活跃/成功）
- 气泡左侧 3px `--color-node-active` 边条 · 节点圆点 `--color-node-active` + `--shadow-node` 青绿光晕
- Header 图标 📅 + "成长规划"（标题 `--font-serif`）
- 回答结构：本版本调整 → 总目标 → 周计划 → 每日安排 → 检查点
- v1 简化版，无 keep/strengthen/abandon 段（v2 才上）
</column>
<column width-ratio="0.500000">
### 考研导航（admission） · 珊瑚红节点
- 节点状态色：`--color-node-weak: #ff6b6b`（珊瑚红，薄弱/风险）
- 气泡左侧 3px `--color-node-weak` 边条 · 节点圆点 `--color-node-weak` + `--shadow-node` 珊瑚红光晕
- Header 图标 🎯 + "考研导航"（标题 `--font-serif`）
- 回答结构：6 所院校（冲刺 2 / 稳妥 2 / 保底 2）· 每所 1 张 AdmissionCard
- 每张 AdmissionCard：校名 + 报录比 + 复试线 + 录取概率 + 数据来源 URL
</column>
</grid>

## 8. 核心交互流程（4 业务 Agent + 1 级联）

1. **概念问题**：用户在 HomeView 输入 → 主控编排器识别 `concept` → tutorAgent 返回苏格拉底式引导 → 用户点阶梯 → 关键提示 → 结束（不写画像）
2. **学习诊断**：输入分数+错题 → 识别 `diagnose` → diagnoseAgent 返回 4 层根因链 → 解析 L2 知识点写入 `profile.weak_topics` → Toast 提示并显示新 chip 动画 → 用户可跳 ProfileView 确认
3. **成长规划**：输入时间范围 → 识别 `plan` → plannerAgent 读取 profile + 当前 plan_version → 返回周计划 → 写入 `usePlanStore` → 跳 PlanView 查完整版
4. **考研导航**：输入背景+需求 → 识别 `admission` → admissionAgent 调 RAG 检索院校数据 → 返回 6 所 → 渲染 3 档 AdmissionCard
5. **级联**（`cascade`）：输入"先诊断再规划" → 路由到 cascade.js → 先跑 diagnoseAgent → 写画像 → 跳 plannerAgent（自动传入诊断结果）→ 生成计划 → Toast 通知"诊断 + 规划已完成"

## 9. 响应式与无障碍

### 9.1 响应式断点

- **≥ 1280px**：TopBar 4 个 Tab 等宽 + 演示状态条同排 + ChatWindow max-w-960
- **768-1279px**：Tab 改为下拉选择（AgentSwitchBar 用 Element Plus Select）· 演示状态条换行到第二行
- **< 768px**：TopBar Logo + 用户入口保留，Agent 切到汉堡菜单 · ChatWindow 气泡 max-w 100% · InputBar 高度 56px（h-14）

### 9.2 无障碍（对齐知识图谱风设计系统 v2.0）

- 所有交互元素支持键盘 Tab · 焦点环 `--shadow-focus`（3px `--color-ink-500` 30% 透明）
- ChatWindow 节点轴线消息流 `role="log" aria-live="polite"` · 新消息时屏幕阅读器播报
- RAGPanel 折叠条 `<button aria-expanded>` · Tab 组 `role="tablist"`
- 颜色对比度：所有文字 ≥ 4.5:1（AA）· 墨蓝主文字 `--color-ink-900` on `--color-bg-elevated` 达 16:1（AAA）
- 触摸目标 ≥ 44×44px（移动端）· 按钮间距 ≥ 8px
- 键盘快捷键：`Enter` 发送 · `Shift+Enter` 换行 · `Esc` 取消当前生成 · `Cmd/Ctrl+K` 聚焦输入框
- 节点状态色对比度：4 节点状态色在 `--color-bg-elevated` 上均 ≥ 3:1（图形元素 AA）

## 10. 评审演示包装（v1 专有）

v1 没有"学科解耦"和"评审风险预案"（v3 才有），但作为基础可发布版，UI 须保证评审现场 5 个标准对话可演示。

- **演示模式开关**：TopBar 演示状态条右侧加 1 个 [🎬 演示模式] 开关，启用后：  

  - InputBar 上方加 1 行快捷问题（5 个标准对话直接点选）
  - Loading 时 Agent 气泡显示"模拟 DeepSeek 输出"字样（避免现场 API 超时翻车）
  - 所有按钮禁用 Toast 提示，确保演示节奏稳定
- **录屏按钮**：演示模式启用后右下角出现 [⏺ 开始录屏] 按钮（v1 仅占位，不实现真实录制，靠 OBS）
- **演示数据预热**：首次启动时检测 localStorage，若空则种入 1 份演示画像（微电子/大三/复旦微电子）+ 1 份演示计划（4 周）+ 1 条演示诊断（55 分），评审现场直接用

## 11. v1 UI 验收清单（与 38 天计划对齐）

- <input type="checkbox" checked="false" /> TopBar 4 Tab 切换正常，演示状态条 + 用户入口对齐 · 顶部高光线 + 节点连线 SVG 背景可见
- <input type="checkbox" checked="false" /> HomeView ChatWindow 5 个标准对话全部走通 · 节点轴线消息流（圆点 + 连线）渲染正确
- <input type="checkbox" checked="false" /> Hero 首屏衬线大标题（`--font-serif 32px`）+ 终端命令行路径条（`▸ home ▸ xxx`）就位
- <input type="checkbox" checked="false" /> QuickActionBar 4 卡可点击并自动填入问题 · 4 卡左侧色条对应 4 节点状态色
- <input type="checkbox" checked="false" /> RAGPanel 折叠/展开命中 0/1/3 三种态都有 · 折叠条用 `--font-mono` + 提示符 `▸`
- <input type="checkbox" checked="false" /> ProfileView TopicChips 三种状态（薄弱=珊瑚红/掌握=青绿/冲突=琥珀）显示正确
- <input type="checkbox" checked="false" /> HistoryView 空态 + 1 条 + 多条三种态都可 · 左侧节点时间轴连线贯穿
- <input type="checkbox" checked="false" /> PlanView 周计划默认展开第 1 周，第 2-4 周可折叠 · 每周青绿节点圆点 + 连线
- <input type="checkbox" checked="false" /> 4 业务 Agent 节点状态色 + 节点轴线统一（导师=钢蓝/诊断=琥珀/规划=青绿/择校=珊瑚红）
- <input type="checkbox" checked="false" /> 卡片悬浮层叠感（`shadow-md` + `radius-lg` + `--color-bg-elevated`）全局一致
- <input type="checkbox" checked="false" /> 768px 断点 Tab 切下拉，演示状态条换行
- <input type="checkbox" checked="false" /> 键盘 Tab 顺序与视觉顺序一致 · 焦点环可见（墨蓝 30%）
- <input type="checkbox" checked="false" /> 演示模式：快捷问题 + Loading 字样 + 演示画像预热全部就位

---

<callout emoji="📌">
**v2 演进预告**：v1 完成后进入 v2 业务闭环版，将在 ProfileView 加 5 轮对比组件、PlanView 加 keep/strengthen/abandon 3 类调整段、HomeView 加 RAG 类型权重标签与 5 类文件来源标注。详见 v2 文档「前端 UI 设计」章节。
</callout>