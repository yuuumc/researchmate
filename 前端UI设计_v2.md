<title>前端 UI 设计（v2 增量）</title>

# 研芯通迭代方案 v2 — 完整业务闭环版（Trae 自建全栈）

> **版本**：v2.0 | 2026-07-27  
> **定位**：完整业务闭环——v1 之上 + 4 个业务 Agent Prompt 深度优化 + RAG 策略升级 + 完整数据通路  
> **技术栈**：Vue 3 + Element Plus + Vite + DeepSeek-V4 API + localStorage  
> **上游文档**：研芯通迭代方案 v1  
> **下游版本**：v3（参赛级全套材料）

---

## 修改说明（相对 v1 的取舍）

| 编号 | 修改点 | 取舍理由 |
|-|-|-|
| V1 | 4 个业务 Agent Prompt 深度重写（6.2-6.5） | v1 是骨架版，v2 按用户既定的优化结果落地 |
| V2 | RAG 策略升级：关键词 → TF-IDF + Top-K + 阈值 + 重排序 | 评审演示需要 hit@5 ≥ 0.8；**tokenize 中文分词依赖待定**（Intl.Segmenter vs nodejieba，第 1 周用 20 题对拍） |
| V3 | 5 类文件差异化切片策略 | v1 统一按页切片，v2 按类型差异化（教材 / 表格 / 真题 / 经验帖 / 政策） |
| V4 | localStorage 完整接通：diagnosis_history + plan_version 正式接入 | v1 已用 Pinia，v2 把 2 个新 store 完整实现 |
| V5 | 字段级合并 + 冲突消解 + 快照累加 | v1 简单 add/remove，v2 实现完整合并逻辑 |
| V6 | 4-Agent 协作完整测试（6 场景） | v1 只测 5 个标准对话，v2 测 6 个端到端场景 |
| V7 | 跨 Agent 状态一致性测试 | 级联管道 N5→N6 的状态保持 |
| V8 | 演示时间统计（≤ 15 分钟总时长） | 评审 5 分钟硬限制，6 场景必须控制时长 |
| V9 | 保留 v1 的"自定义 API 接入点" | 后期扩展点不变 |
| V10 | 保留 v1 的"主控编排器"逻辑 | 核心创新，逻辑保留 |

---

## 第 3 章补完：知识库切片 / RAG 策略

### 3.5 切片策略（v2 升级版）

**5 类文件差异化切片**：

| 文件类型 | 切片单位 | 切片大小 | 保留元数据 |
|-|-|-|-|
| 教材 PDF | 1 节（约 1500-2500 字） | \~2000 字 | 章节名 / 页码 / 公式 / 例题 |
| 院校表格 | 1 所院校 1 行 | \~200 字 | 校名 / 报录比 / 分数线 / 年份 |
| 真题 | 1 道题 | \~300 字 | 年份 / 科目 / 难度 / 答案 |
| 经验帖 | 1 个主题段（约 800 字） | \~800 字 | 作者 / 学校 / 录取结果 / 关键词 |
| 政策文件 | 1 条政策 | \~500 字 | 发文机构 / 年份 / 适用范围 |

**切片脚本**（v2 升级版）：

```javascript
// src/scripts/splitKnowledge.js
export function splitTextbook(pdfText) {
  // 按"第 X 章"分割
  const chapters = pdfText.split(/(?=第[一二三四五六七八九十]+章)/)
  return chapters.flatMap(chapter => {
    const title = chapter.match(/^第[一二三四五六七八九十]+章\s*([^\n]+)/)?.[1] || ''
    // 每章按"X.Y"小节分割
    const sections = chapter.split(/(?=^\d+\.\d+)/m)
    return sections.slice(1).map(section => ({
      id: `textbook-${title}-${section.match(/^\d+\.\d+/)?.[0]}`,
      type: 'textbook',
      source: `教材-${title}`,
      title: section.match(/^(\d+\.\d+\s*[^\n]+)/)?.[1] || '',
      content: section.trim(),
      keywords: extractKeywords(section),
      formulas: extractFormulas(section), // 提取 LaTeX 公式
      examples: extractExamples(section)  // 提取例题
    }))
  })
}

export function splitUniversity(jsonData) {
  // 院校数据按行切片
  return jsonData.map(row => ({
    id: `university-${row.school}-${row.year}`,
    type: 'university',
    source: `院校数据-${row.school}`,
    content: `${row.school} ${row.major} ${row.year} 年报录比 ${row.ratio}，复试线 ${row.score}`,
    school: row.school,
    major: row.major,
    ratio: row.ratio,
    score: row.score,
    year: row.year,
    url: row.url, // 数据来源
    keywords: [row.school, row.major, row.year.toString()]
  }))
}
```

### 3.6 RAG 策略（v2 升级版）

**算法**：TF-IDF + Top-K + 阈值 + 重排序

```javascript
// src/utils/rag.js (v2 升级版)

// 0. 中文分词（v1 黑箱问题的延续修复，详见 v1 §3.3 注释）
function tokenize(text) {
  // 优先用 Intl.Segmenter，浏览器原生零依赖
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const seg = new Intl.Segmenter('zh', { granularity: 'word' })
    return Array.from(seg.segment(text)).map(s => s.segment).filter(Boolean)
  }
  // 退化方案：英文按空格，中文按 1-2 字滑窗（精度差但不至于命中率≈0）
  return text.split(/[\s,.!?;:()\[\]{}"']+/).filter(t => t.length >= 1)
}

// 1. 关键词粗筛（v2 补全：之前 v2 §3.6 引用了 keywordFilter 但未定义）
function keywordFilter(query, documents, topN = 30) {
  const qTokens = new Set(tokenize(query.toLowerCase()))
  return documents
    .map(d => {
      const dTokens = new Set(tokenize((d.title || '') + ' ' + (d.content || '').slice(0, 500)).map(t => t.toLowerCase()))
      let hit = 0
      qTokens.forEach(t => { if (dTokens.has(t)) hit++ })
      return { doc: d, hit }
    })
    .filter(x => x.hit > 0)
    .sort((a, b) => b.hit - a.hit)
    .slice(0, topN)
    .map(x => x.doc)
}

// 2. TF-IDF 计算
function computeTFIDF(query, documents) {
  const queryTerms = tokenize(query)
  const docTermsList = documents.map(d => tokenize((d.title || '') + ' ' + (d.content || '')))

  // 计算 IDF
  const idf = {}
  const allTerms = new Set(docTermsList.flat())
  allTerms.forEach(term => {
    const df = docTermsList.filter(terms => terms.includes(term)).length
    idf[term] = Math.log(documents.length / (df + 1)) + 1
  })

  // 计算 TF-IDF 相似度
  return documents.map((doc, idx) => {
    const docTerms = docTermsList[idx]
    const score = queryTerms.reduce((sum, term) => {
      const tf = docTerms.filter(t => t === term).length / docTerms.length
      return sum + tf * (idf[term] || 0)
    }, 0)
    return { ...doc, score }
  })
}

// 3. 检索主函数
export function retrieve(query, knowledgeBase, options = {}) {
  const { topK = 5, threshold = 0.1 } = options

  // 3.1 粗筛：关键词匹配（topN=30 减少精排压力）
  const keywordMatched = keywordFilter(query, knowledgeBase, 30)

  // 3.2 精排：TF-IDF 打分
  const scored = computeTFIDF(query, keywordMatched)

  // 3.3 阈值过滤
  const filtered = scored.filter(item => item.score >= threshold)

  // 3.4 Top-K 选取
  return filtered
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

// 4. 重排序（按类型加权）
export function rerank(query, retrieved, options = {}) {
  const typeWeights = {
    textbook: 1.0,    // 教材权重最高
    question: 0.8,    // 真题次之
    university: 0.7,  // 院校数据
    essay: 0.6,       // 经验帖
    policy: 0.9       // 政策文件
  }

  return retrieved
    .map(item => ({
      ...item,
      finalScore: item.score * (typeWeights[item.type] || 0.5)
    }))
    .sort((a, b) => b.finalScore - a.finalScore)
}
```

### 3.7 知识库检索质量验证

**题量升级（评审补充）**：v2 §3.7 原列 5 题（UT-2.5-A 到 E），样本量太小，hit@5 ≥ 0.8；**tokenize 中文分词依赖待定**（Intl.Segmenter vs nodejieba，第 1 周用 20 题对拍） 的指标**统计意义弱**（5 题对 1 题就是 0.6，无法稳定判断质量）。第 1 周用**20 条真实问题**验收（5 类各 4 条），不达标（hit@5 < 0.8）则按 v1 §3.3 预案降级为"按章节手动挂标签"。

**v2.5 验收用例**（5 个）：

- UT-2.5-A 教材检索：问"MOSFET 阈值电压"，命中教材第 X 章
- UT-2.5-B 真题检索：问"2024 年半导体物理真题第 5 题"，命中真题
- UT-2.5-C 院校检索：问"电子科大微电子报录比"，命中院校数据
- UT-2.5-D 经验帖检索：问"考研复习经验"，命中经验帖
- UT-2.5-E 政策检索：问"考研报名时间"，命中政策文件

**质量指标**：hit@5 ≥ 0.8；**tokenize 中文分词依赖待定**（Intl.Segmenter vs nodejieba，第 1 周用 20 题对拍）（5 个问题中至少 4 个的前 5 个结果包含正确答案）

---

## 第 4 章补完：学生画像 JSON 选型 + 完整数据通路

### 4.4 画像 JSON 方案选型（v2 落地）

**方案对比**：

| 方案 | 描述 | 优点 | 缺点 | 选型结论 |
|-|-|-|-|-|
| 方案 A：JSON 字符串 + Code 节点 | localStorage 存 JSON 字符串，前端用 try-catch 解析 | 灵活、易扩展 | 解析失败需兜底 | **推荐** |
| 方案 B：拆分多个键 | 每个字段一个 key | 读写简单 | 字段多时管理复杂 | 不推荐 |
| 方案 C：IndexedDB | 浏览器原生数据库 | 支持复杂查询 | API 复杂、过度设计 | 不推荐 |

**选型理由**（方案 A）：

1. 灵活：JSON 嵌套结构，易扩展
2. 易读：localStorage 调试时可直接查看
3. 兜底：try-catch 天然支持解析失败
4. 迁移：后期切到 Supabase / MySQL 时，只需把 JSON.stringify 改为 SQL 插入

### 4.5 字段级合并 + 冲突消解 + 快照累加

```javascript
// src/core/profileUpdater.js (v2 完整版，评审补充：移除 master 之前的实现漏洞)
// 冲突消解：mastered 优先级 > weak（一旦标记掌握，从 weak 移除）
export function updateProfile(oldProfile, newData) {
  // 1) 先合并 mastered，再决定 weak（v2 原实现是并行合并，weak 不会真正减少）
  const newMastered = mergeMasteredTopics(oldProfile.mastered_topics, newData.mastered_topics)
  const newWeak = mergeWeakTopics(oldProfile.weak_topics, newData.weak_topics, newMastered)
  return {
    ...oldProfile,
    ...newData,
    mastered_topics: newMastered,
    weak_topics: newWeak,
    updated_at: new Date().toISOString()
  }
}

// v2 修复：masteredArr 是数组（mergeMasteredTopics 修复后已返回数组），函数内部转 Set 查重，
// 避免把 Set 漏到 profile 字段（会破坏 JSON 序列化）
function mergeWeakTopics(oldWeak, newWeak, masteredArr) {
  const masteredSet = new Set(masteredArr || [])
  const merged = [...new Set([...(oldWeak || []), ...(newWeak || [])])]
  // 关键修复：从 weak 移除已掌握的（v2 原代码只 merge 不移除，违反冲突消解规则）
  return merged.filter(t => !masteredSet.has(t))
}

function mergeMasteredTopics(oldMastered, newMastered) {
  // v2 修复：必须返回数组。Set 赋给 mastered_topics 后 localStorage.setItem
  // 调用 JSON.stringify 会得到 {}，下次读取即丢失所有已掌握主题（数据丢失事故）。
  return [...new Set([...(oldMastered || []), ...(newMastered || [])])]
}

// 快照累加（5 轮诊断对比）
export function appendDiagnosisSnapshot(profile, newSnapshot) {
  const history = storage.get('yanxintong_diagnosis_history') || []
  history.push({
    snapshot_id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    score: newSnapshot.score,
    weak_topics: newSnapshot.weak_topics,
    mastered_topics: newSnapshot.mastered_topics
  })
  storage.set('yanxintong_diagnosis_history', history)
  return history
}
```

### 4.6 diagnosis_history 完整接通

**Pinia store**：

```javascript
// src/stores/diagnosis.js
import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'

const STORAGE_KEY = 'yanxintong_diagnosis_history'

export const useDiagnosisStore = defineStore('diagnosis', {
  state: () => ({
    history: storage.get(STORAGE_KEY) || []
  }),
  actions: {
    addSnapshot(snapshot) {
      const newSnapshot = {
        snapshot_id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...snapshot
      }
      this.history.push(newSnapshot)
      storage.set(STORAGE_KEY, this.history)
    },
    getTrend() {
      // 计算趋势（连续 5 轮）
      const last5 = this.history.slice(-5)
      return {
        scores: last5.map(s => s.score),
        trend: computeTrend(last5) // 'improving' | 'stable' | 'declining'
      }
    }
  }
})
```

### 4.7 plan_version 完整接通

**Pinia store**：

```javascript
// src/stores/plan.js
import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'

const STORAGE_KEY = 'yanxintong_plan_version'

export const usePlanStore = defineStore('plan', {
  state: () => ({
    currentVersion: storage.get(STORAGE_KEY)?.currentVersion || 0,
    plans: storage.get(STORAGE_KEY)?.plans || []
  }),
  actions: {
    createNewPlan(planData) {
      this.currentVersion += 1
      const newPlan = {
        plan_id: crypto.randomUUID(),
        version: this.currentVersion,
        created_at: new Date().toISOString(),
        ...planData,
        // 动态调整段（v2 升级）
        adjustments: this.currentVersion > 1 
          ? this.computeAdjustments(planData, this.plans[this.plans.length - 1])
          : null
      }
      this.plans.push(newPlan)
      this.persist()
      return newPlan
    },
    computeAdjustments(newPlan, oldPlan) {
      return {
        keep: computeKeep(newPlan, oldPlan),
        strengthen: computeStrengthen(newPlan, oldPlan),
        abandon: computeAbandon(newPlan, oldPlan)
      }
    },
    persist() {
      storage.set(STORAGE_KEY, {
        currentVersion: this.currentVersion,
        plans: this.plans
      })
    }
  }
})
```

---

**辅助函数实现**（§4.6 / §4.7 引用的 computeTrend / computeKeep / computeStrengthen / computeAbandon 必须在 src/core/planDiff.js 一并实现，否则 store 在第一次调用时即抛 ReferenceError；下面的实现以「主题级差集 + 趋势斜率」为基础，第 1 周用 5 个真实诊断序列对拍验证）：

```javascript
// src/core/planDiff.js (v2 补完：computeTrend / computeKeep / computeStrengthen / computeAbandon)
// §4.6 diagnosis_history 趋势：最近 5 轮 score 简单线性回归斜率
export function computeTrend(snapshots) {
  if (!snapshots || snapshots.length < 2) return 'stable'
  const xs = snapshots.map((_, i) => i)
  const ys = snapshots.map(s => Number(s.score) || 0)
  const n = xs.length
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  const num = xs.reduce((acc, x, i) => acc + (x - meanX) * (ys[i] - meanY), 0)
  const den = xs.reduce((acc, x) => acc + (x - meanX) ** 2, 0) || 1
  const slope = num / den
  if (slope > 1.5) return 'improving'
  if (slope < -1.5) return 'declining'
  return 'stable'
}

// §4.7 plan_version 主题级差集（new vs old）
function diffTopics(newSet, oldSet) {
  const a = new Set(newSet || []), b = new Set(oldSet || [])
  return {
    added: [...a].filter(t => !b.has(t)),
    removed: [...b].filter(t => !a.has(t)),
    kept: [...a].filter(t => b.has(t))
  }
}

export function computeKeep(newPlan, oldPlan) {
  if (!oldPlan) return []
  return diffTopics(newPlan.weak_topics, oldPlan.weak_topics).kept
}

export function computeStrengthen(newPlan, oldPlan) {
  if (!oldPlan) return []
  const { kept } = diffTopics(newPlan.weak_topics, oldPlan.weak_topics)
  const oldScore = new Map((oldPlan.topic_scores || []).map(t => [t.topic, t.score]))
  return kept.filter(t => (oldScore.get(t) ?? 100) > (newPlan.topic_scores?.find(x => x.topic === t)?.score ?? 0))
}

export function computeAbandon(newPlan, oldPlan) {
  if (!oldPlan) return []
  const { removed } = diffTopics(newPlan.weak_topics, oldPlan.weak_topics)
  return removed.filter(t => {
    const m = newPlan.mastery?.find(x => x.topic === t)
    return m && m.score >= 0.8
  })
}
```

## 第 6 章补完：4 个业务 Agent Prompt 深度优化版

### 6.2 专业导师 Prompt（v2 深度优化版）

```markdown
# 角色
你是研芯通的专业导师，资深工科教授，擅长用苏格拉底式教学法引导学生推导。

# 教学风格
- **不直接给答案**：用 3-5 个阶梯问题引导学生
- **先检查前置知识**：未掌握先补，不假设学生会
- **每步带判断问题**："你能想到下一步吗？"
- **关键提示而非答案**：给思路，不给结论
- **鼓励探索**：答错也肯定"思路对了一半"

# 反模式约束（禁止行为）
- 禁止直接写出最终公式
- 禁止说"答案是 X"
- 禁止跳过阶梯直接给推导
- 禁止长篇大论（每次回答 ≤ 500 字）

# 输入
- 学生问题
- 学生画像（已掌握 / 薄弱点 / 学习阶段）

# 输出格式
Markdown 严格按以下结构：

## 1. 前置知识检查（≤ 100 字）
- 列出 2-3 个前置知识点
- 每点带 1 个自检问题

## 2. 阶梯引导（3-5 个阶梯）
- 第 1 阶梯：[问题]（最基础）
- 第 2 阶梯：[问题]（推进一步）
- ...
- 第 N 阶梯：[问题]（接近答案）

## 3. 关键提示（≤ 100 字）
- 给 2-3 个关键提示
- 提示是思路，不是答案

# 示例
学生：MOSFET 阈值电压怎么推导？

回答：
## 1. 前置知识检查
- 半导体表面势是什么？能否用一句话解释？
- 能带弯曲的物理意义是什么？
- 费米势 φ_F 与掺杂浓度的关系是什么？

## 2. 阶梯引导
- 第 1 阶梯：MOSFET 阈值电压的定义是什么？（提示：临界条件）
- 第 2 阶梯：强反型层的判据是什么？（提示：表面少子浓度 = 体内多子浓度）
- 第 3 阶梯：表面势 ψ_s = 2φ_F 时，对应的栅压是什么？
- 第 4 阶梯：求解 ψ_s = 2φ_F 时的 V_GS，就是阈值电压。能否写出泊松方程？

## 3. 关键提示
- 强反型判据是 ψ_s = 2φ_F，不是 ψ_s = φ_F
- 衬底偏置效应会影响阈值电压
- 求解泊松方程时，电荷密度 q(x) = q(N_D - n + p) 在不同区域近似不同
```

### 6.3 学习诊断 Prompt（v2 深度优化版）

```markdown
# 角色
你是研芯通的学习诊断专家，资深工科教师，擅长从错题挖出知识断层。

# 诊断方法：4 层根因链

## L1 表面问题（学生直接表现）
- 哪几道题错？哪几章错？分数多少？

## L2 直接原因（具体知识缺陷）
- 哪些公式不会？哪些概念混淆？哪些计算步骤错？

## L3 中间原因（上游知识点不牢）
- 直接原因的前置是什么？为什么这部分没掌握？

## L4 根本原因（知识图谱上游）
- 中间原因再往上挖？是学习方法问题还是时间投入问题？

# 输出格式
Markdown 严格按以下结构：

## L1 表面问题
- 分数：XX / 100
- 错题章节：第 X 章 / 第 Y 章
- 错题数量：N 道

## L2 直接原因
- 知识点 1：[名称]（[掌握度：0-100%]）
- 知识点 2：[名称]（[掌握度：0-100%]）
- ...

## L3 中间原因
- 知识点 A：[名称]（L2 中多个缺陷的共同前置）
- 知识点 B：[名称]

## L4 根本原因
- 学习方法：[评估]
- 时间投入：[评估]
- 知识图谱断裂点：[评估]

## 补强方案
### 紧急（本周）
- [具体任务 1：教材 X 章 Y 节 / 真题 Z 题]
- [具体任务 2]

### 重要（本月）
- [具体任务 3]
- [具体任务 4]

### 长期（3 个月内）
- [具体任务 5]

# 反模式约束
- 禁止只说"你 X 不会"，必须挖到 L4
- 禁止泛泛建议（如"多做题"），必须具体到页码 / 题号
- 禁止打击学生，必须先肯定做得好的部分

# 输入
- 考试科目 / 分数 / 错题列表
- 学生画像（已掌握 / 薄弱 / 学习阶段）
- 历次诊断历史（v2 接入）
```

### 6.4 成长规划 Prompt（v2 深度优化版）

```markdown
# 角色
你是研芯通的成长规划师，资深考研规划专家，擅长根据学生情况生成个性化计划。

# 规划原则
- **紧急度分档**：P0（紧急）/ P1（重要）/ P2（长期）
- **动态调整 3 类**：
  - 保留（keep）：上一版本完成率 ≥ 70% 的任务
  - 强化（strengthen）：完成率 30-70% 的任务，加量
  - 放弃（abandon）：完成率 < 30% 的任务，砍掉或换形式

# 输入
- 学生画像（薄弱点 / 已掌握 / 备考阶段 / 目标院校）
- 历次诊断（v2 接入）
- 上一版本计划（v2 接入）
- 时间范围（如"下个月"）

# 输出格式
Markdown 严格按以下结构：

## 一、本版本调整（仅 v2+）
- **保留**：[任务 1]（[完成率]%）
- **强化**：[任务 2]（[完成率]% → 加量到 X）
- **放弃**：[任务 3]（[完成率]% → 改为 Y）

## 二、本版本总目标
- 1 句话描述本版本核心目标

## 三、周计划
### 第 1 周
- **P0 任务**：
  - [任务 1]（[时间]）[紧急]
  - [任务 2]（[时间]）[紧急]
- **P1 任务**：
  - [任务 3]（[时间]）[重要]
- **P2 任务**：
  - [任务 4]（[时间]）[长期]

### 第 2 周
...

## 四、每日安排（示例）
- 08:00-09:00 [任务]
- 09:00-10:00 [任务]
- ...

## 五、检查点
- 第 1 周检查：[指标]
- 第 2 周检查：[指标]
- 月度检查：[指标]

# 反模式约束
- 禁止每天安排超过 8 小时学习（避免倦怠）
- 禁止连续 3 天 P0 任务（避免压力过大）
- 禁止忽略身体锻炼（每周至少 2 次）

# 输入
- 学生画像
- 上一版本计划（plan_version 接入）
- 时间范围
```

### 6.5 考研导航 Prompt（v2 深度优化版）

**⚠️ P2 硬约束（v2 评审补充：禁止 LLM 编造数字）**：上面 Prompt 模板里允许 LLM 自行生成报录比 / 复试线 / 录取概率 / 数据来源 URL，实践中 LLM 会以假乱真地编造这些字段（如给一所不存在的学校拼出"12:1 报录比 + 看似合理的研究生院 URL"），用户难以辨别。

硬约束（写入代码侧 system prompt + 前端 schema 校验两道防线）：

1. 数字字段（报录比、复试线、录取概率、招生人数、学费）**严禁 LLM 生成**，必须从 `src/data/university/*.json` 本地数据读取并渲染。

2. URL 字段（数据来源）**严禁 LLM 生成**，只能从本地数据的 `source_url` 字段透传。

3. LLM 的输出 schema 限定为「匹配 + 推荐理由」：`{matched_school_id, tier (chase|safe|fallback), reason}`，其中 `school_id` 必须命中本地白名单（前端拿到后用 school_id 反查 university 详情）。

4. 前端兜底：AdmissionPanel 拿到 LLM 输出后，逐字段校验 school_id 必须在白名单、tier 必须在枚举内，否则回退到「院校数据已更新，请重新检索」并保留 LLM 推荐的 tier 但隐藏具体数字。

```markdown
# 角色
你是研芯通的考研导航专家，资深考研咨询师，擅长数据驱动推荐院校。

# 推荐方法
1. **录取概率公式化**：
   - 录取概率 = f(学生排名, 院校报录比, 复试线, 学生本科背景)
   - 冲刺档：概率 20-40%
   - 稳妥档：概率 40-60%
   - 保底档：概率 60-80%

2. **数据来源必带 URL**：
   - 每条院校数据必须标注来源 URL
   - 必须标注数据年份

# 输出格式
Markdown 严格按以下结构：

## 一、推荐院校（3 档 × 2 所 = 6 所）

### 冲刺档（概率 20-40%）
#### 1. [校名]
- **专业**：微电子学与固体电子学
- **报录比**：12:1（2025）
- **复试线**：330 分（2025）
- **录取概率**：约 25%
- **数据来源**：[URL]
- **推荐理由**：[1 句话]

#### 2. [校名]
- ...

### 稳妥档（概率 40-60%）
...

### 保底档（概率 60-80%）
...

## 二、择校策略
- 1 段话说明为什么推荐这 3 档
- 给出 1-2 个关键建议

## 三、风险提示
- 数据时效性（建议核实 2026 年最新数据）
- 招生政策变动（建议关注目标院校研究生院官网）

# 反模式约束
- 禁止无数据推荐（如"推荐 X 校"不带报录比）
- 禁止无来源推荐（每条数据必须带 URL）
- 禁止一刀切（必须分 3 档）

# 输入
- 学生背景（学校 / 排名 / 目标地区 / 兴趣方向）
- 学生需求（冲刺 / 稳妥 / 保底）
- 院校数据（从 RAG 检索）
```

---

## 第 7 章补完：4-Agent 协作完整测试

### 7.4 6 个端到端演示场景

| 场景 | 输入 | 预期 | 时长 |
|-|-|-|-|
| 场景 1：初始化 | 新用户首次进入 | 完成 3 个问题（专业 / 年级 / 目标） | 1 min |
| 场景 2：概念问题 | "MOSFET 阈值电压怎么推导？" | 苏格拉底式引导，3-5 阶梯 | 2 min |
| 场景 3：诊断 | "我半导体物理考了 55 分" | 4 层根因链 + 补强方案 | 2 min |
| 场景 4：规划 | "帮我做下个月复习计划" | 周计划 + 每日安排 | 2 min |
| 场景 5：择校 | "我双非前 30%，想去长三角" | 3 档 6 所 + 概率 + 来源 | 3 min |
| 场景 6：级联 | "先诊断再规划" | 诊断完成自动进入规划 | 3 min |

**总时长**：≤ 15 分钟（含切换时间）

### 7.5 跨 Agent 状态一致性测试

| 测试点 | 验证 | 通过条件 |
|-|-|-|
| 诊断后画像更新 | 诊断完成后检查 profile.weak_topics | 包含诊断报告的薄弱点 |
| 规划后 plan_version 递增 | 规划完成后检查 plan.currentVersion | 版本 +1 |
| 级联状态保持 | 诊断→规划过程不丢失 profile | profile 完整传递 |
| 多次诊断对比 | 5 轮诊断后检查 history 长度 | history.length === 5 |

---

## 第 8 章补完：6 场景演示脚本

**⚠️ 演示前 30 秒自检清单（v2 评审补充：serverless 代理上线后必做）**：

1. 打开 DevTools Network，确认 DeepSeek 域名（api.deepseek.com）**不出现在前端请求列表**（仅 /api/chat 出现）；如出现说明 key 漏到 bundle，必须回退部署
2. 检查 Vercel 环境变量 `DEEPSEEK_API_KEY` 已设置；缺失则 /api/chat 返回 500
3. 本地运行 `npm run dev` 打开 http://localhost:5173，发送 1 条测试问题验证端到端
4. 如离线演示，提前 mock /api/chat（用 msw 拦截），避免 Vercel cold start 影响节奏

### DEMO-2.1：初始化（1 min）

**操作**：

1. 打开 `http://localhost:5173`
2. 系统弹出初始化对话
3. 依次回答：微电子 / 大三 / 复旦微电子
4. 画像初始化完成，显示"现在可以问我一个专业课问题"

---

### DEMO-2.2：概念问题（2 min）

**操作**：

1. 输入"MOSFET 阈值电压怎么推导？"
2. 等待 5 秒，AI 返回苏格拉底式引导（3-5 阶梯）
3. 学生按阶梯回答（演示时直接给答案）
4. AI 给出关键提示

---

### DEMO-2.3：诊断（2 min）

**操作**：

1. 输入"我半导体物理期中考了 55 分，第 5-7 章错"
2. 等待 5 秒，AI 返回 4 层根因链
3. 显示补强方案（具体到教材页码和题号）
4. 验证画像更新（profile.weak_topics 增加 MOSFET C-V / I-V / 短沟道）

---

### DEMO-2.4：规划（2 min）

**操作**：

1. 输入"帮我做下个月复习计划"
2. 等待 5 秒，AI 返回周计划
3. 显示每日安排（具体到时间段）
4. 验证 plan_version 递增（v1 → v2）

---

### DEMO-2.5：择校（3 min）

**操作**：

1. 输入"我双非前 30%，想去长三角微电子"
2. 等待 8 秒，AI 返回 6 所院校（3 档）
3. 显示每所的报录比 / 复试线 / 录取概率 / 数据来源
4. 验证院校数据带 URL

---

### DEMO-2.6：级联（3 min）

**操作**：

1. 输入"我半导体物理考了 60 分，先帮我诊断，诊断完给我做个计划"
2. 等待 5 秒，AI 完成诊断
3. 自动级联进入规划（plan_version=1）
4. 验证诊断结果传递到规划

---

## 现状基线（v2 累计）

| 维度 | 状态 | 说明 |
|-|-|-|
| 4 个业务 Agent Prompt | v2 深度优化版完成 | 6.2-6.5 全部落地 |
| 知识库切片 | 5 类文件差异化 | 教材 / 表格 / 真题 / 经验帖 / 政策 |
| RAG 策略 | TF-IDF + Top-K + 阈值 + 重排序 | hit@5 ≥ 0.8；**tokenize 中文分词依赖待定**（Intl.Segmenter vs nodejieba，第 1 周用 20 题对拍） |
| 画像 JSON | 方案 A 落地 | localStorage + try-catch |
| 字段级合并 | 完成 | mastered 优先级 > weak |
| 诊断历史 | diagnosis_history 接通 | 5 轮对比可演示 |
| 计划版本 | plan_version 接通 | v1 → v2 → v3 迭代可演示 |
| 级联管道 | N5→N6 接通 | cascade.js 实现 |
| 6 演示场景 | 完成 | 总时长 ≤ 15 分钟 |
| 自定义 API 接入点 | 保留 | 后期扩展点 |
| 主控编排器 | 完成 | router.js + 4 个 Agent |

---

*v2 完整业务闭环版 · 文档结束*

# 前端 UI 设计（v2 增量）

<callout emoji="🎨">
**设计基线**：v2 UI 完全继承 v1 已迁移的**知识图谱风设计系统 v2.0**——墨蓝学术调色板（`--color-ink-900/700/500/300/100`）+ 衬线学术字体（`--font-serif`）标题 + 等宽字体（`--font-mono`）数据条 + 浅灰冷底（`--color-bg-base #f4f6fa`）+ 流动节点连线 SVG 背景 + 卡片悬浮层叠感（shadow-md + radius-lg）。4 业务 Agent 沿用 4 节点状态色（导师=钢蓝 `--color-node-info` / 诊断=琥珀 `--color-node-warn` / 规划=青绿 `--color-node-active` / 择校=珊瑚红 `--color-node-weak`），消息流保持节点轴线（每条消息左侧节点圆点 + 连线），路径条保持终端命令行提示符 ▸。本节只列 v2 在 v1 之上 **新增 / 改动** 的部分——5 类文件切片来源标注、4 层根因链诊断详情页、计划调整 3 类段（保留/强化/放弃）、诊断历史 5 轮对比、6 场景演示话术面板、4 Agent Prompt 优化徽章。
</callout>

**改动原则**：v2 的核心命题是"4 个业务 Agent 深度优化 + RAG 策略升级 + 完整数据通路"，UI 的工作是把这些"看不见的优化"显式化（让评审一眼看到 v2 相比 v1 多了什么）——具体做法是给每处 v2 新增能力配套 1 个可视组件，且每个新组件都延续知识图谱风（衬线标题、节点轴线、卡片悬浮层叠、终端命令行提示符）。

## 1. v2 相对 v1 的 UI 改动清单

<grid>
<column width-ratio="0.333333">
### RAG 增强
- RAGPanel 加 **类型语义色徽章**（教材=墨蓝 / 真题=钢蓝 / 院校=琥珀 / 经验=青绿 / 政策=凹陷灰，对齐 4 节点状态色 + 墨蓝调）
- 每条引用加 **TF-IDF 分数条**（≥0.8 青绿 / 0.5-0.8 钢蓝 / <0.5 琥珀，3 档节点状态色）
- 类型权重重新排序可视化（`--font-mono` 等宽数字）
</column>
<column width-ratio="0.333333">
### 诊断增强
- **DiagnosisDetail 页（新增）**：4 层根因链卡片化，L1-L4 色条按"钢蓝→琥珀→珊瑚红→最深墨蓝"递进（层级越深颜色越沉）
- HistoryView 加 **5 轮对比组件**（折线图用节点状态色）
- 诊断完成后 Toast 显示新加 TopicChips 动画
</column>
<column width-ratio="0.333333">
### 规划增强
- PlanView 加 **版本切换器**（v1→v2→v3，墨蓝高亮当前版本）
- 新增 **调整段**：保留=青绿 / 强化=钢蓝 / 放弃=凹陷灰（3 类节点状态色）
- 检查点徽章按状态着色
</column>
</grid>

<grid>
<column width-ratio="0.500000">
### 演示体验增强
- 演示模式 5 个标准对话 → **6 场景（v2 升级）** + 时长进度条（终端命令行风格快捷问题条）
- 新增"级联"场景：诊断 → 自动规划
- 每场景结束后弹出 [✅ 通过 ✓] 标记（青绿节点状态色）
</column>
<column width-ratio="0.500000">
### Agent 标识增强
- 4 个 Agent 气泡 Header 加 **「v2 优化」徽章**（墨蓝调 `--color-ink-100` bg / `--color-ink-700` color）
- 从骨架版（≤ 500 字）扩到深度版（结构化输出）
- 气泡内子结构（H2/H3/列表）支持折叠/展开，气泡左侧 3px 节点状态色边条 + 节点圆点光晕
</column>
</grid>

## 2. 5 类文件切片来源标注（HomeView RAGPanel 升级）

v2 RAG 策略升级为 TF-IDF + Top-K + 阈值 + 重排序 + 5 类文件差异化切片。RAGPanel 须显式呈现这些信息，否则评审看不到升级。面板整体延续知识图谱风：浅灰冷底卡片悬浮层叠（shadow-md + radius-lg），标题用 `--font-serif` 衬线小标题，命中数 / 平均分用 `--font-mono` 等宽。

### 2.1 RAGPanel 展开态结构（v2）

<callout emoji="💡">
┌─ RAGPanel 展开 ─ 命中 3 条 · 平均分 0.78 ─────────────────────┐  
│  (Card, bg --color-bg-elevated, shadow-md, radius-lg)              │  
│  (标题 --font-serif 16px / 命中数 --font-mono 12px color-fg-tertiary)│  
│                                                                    │  
│  ┌─ 引用 1 ─────────────────────────────────────────────────────┐ │  
│  │ [教材]  半导体物理-第3章-3.2节  · TF-IDF 0.92  · 类型权重 1.0 │ │  
│  │  (徽章 bg --color-ink-100 / color --color-ink-700, 📘)        │ │  
│  │                                                              │ │  
│  │  MOSFET 阈值电压定义：当栅压增大到使表面出现强反型层时的 VGS… │ │  
│  │                                                              │ │  
│  │  📊 分数条：████████████░░░░  92%                            │ │  
│  │  (轨道 bg --color-bg-sunken, 填充 --color-node-active 青绿)   │ │  
│  └──────────────────────────────────────────────────────────────┘ │  
│  ┌─ 引用 2 ─────────────────────────────────────────────────────┐ │  
│  │ [真题]  2024-半导体物理-第5题  · TF-IDF 0.81  · 类型权重 0.8  │ │  
│  │  (徽章 bg --color-info-bg / color --color-node-info 钢蓝, 📝) │ │  
│  │  …(同上结构, 分数条 ≥0.8 青绿)                                │ │  
│  └──────────────────────────────────────────────────────────────┘ │  
│  ┌─ 引用 3 ─────────────────────────────────────────────────────┐ │  
│  │ [经验帖]  复旦上岸学长-复试经验  · TF-IDF 0.62  · 类型权重 0.6 │ │  
│  │  (徽章 bg --color-success-bg / color --color-node-active 青绿,💬)│ │  
│  │  …(分数条 0.5-0.8 钢蓝)                                       │ │  
│  └──────────────────────────────────────────────────────────────┘ │  
│                                                                    │  
│  [▾ 收起面板]   [📊 查看重排序详情]   (按钮 --font-mono 12px)     │  
└────────────────────────────────────────────────────────────────────┘
</callout>

### 2.2 5 类文件类型徽章（统一规范，复用 Badge §3.4）

5 类文件徽章对齐 4 节点状态色 + 墨蓝调语义（教材属权威基底用墨蓝，政策属中性背景用凹陷灰）：

- **教材**：`bg --color-ink-100 / color --color-ink-700` · 📘 图标（墨蓝调，权威基底）
- **真题**：`bg --color-info-bg / color --color-node-info` · 📝 图标（钢蓝，对应 info 节点色）
- **院校**：`bg --color-warning-bg / color --color-node-warn` · 🏛️ 图标（琥珀，对应 warn 节点色）
- **经验帖**：`bg --color-success-bg / color --color-node-active` · 💬 图标（青绿，对应 active 节点色）
- **政策**：`bg --color-bg-sunken / color --color-fg-primary` · 📋 图标（凹陷灰，中性背景）

**权重标签**：徽章右侧追加小字 "×1.0" / "×0.8" 等，`--font-mono 12px / color --color-fg-tertiary`，鼠标 hover 显示"重排序规则"。

### 2.3 TF-IDF 分数条（v2 新组件）

- 轨道：`h-1.5 / radius-full / bg --color-bg-sunken`
- 填充：3 档节点状态色——分数 ≥ 0.8 用 `--color-node-active`（青绿）· 0.5-0.8 用 `--color-node-info`（钢蓝）· < 0.5 用 `--color-node-warn`（琥珀）（与 v1 §3.6 Progress 节点状态色着色规则一致）
- 文字：分数百分比右对齐，`--font-mono 12px / color --color-fg-secondary`

## 3. 诊断详情页：DiagnosisDetail（v2 新增）

v1 HistoryView 只显示诊断列表，v2 新增独立详情路由 `/history/:id`，把"4 层根因链"从气泡 Markdown 升级为可交互卡片化呈现。整页延续知识图谱风：浅灰冷底（`--color-bg-base`）+ 卡片悬浮层叠（shadow-md + radius-lg），标题用 `--font-serif` 衬线（"诊断报告" / "L1 表面问题" 等），4 层根因链卡之间用节点轴线串联（每层左侧节点圆点 + 竖直连线，对应 diagnose Agent 琥珀节点状态色），路径条 `▸ history ▸ :id` 用 `--font-mono`。

### 3.1 路由

### 3.2 4 层根因链布局

<callout emoji="💡">
┌─ DiagnosisDetail (max-w-960 mx-auto px-6, bg --color-bg-base) ──┐  
│  ◉───◉───◉───◉  (顶部节点轴线, --color-node-warn 琥珀, diagnose Agent)│  
│  ← 返回历史    2026-07-26 诊断报告 (--font-serif 22px)  [📥][🗑]   │  
│  大字分数 55/100  (color --color-node-weak 珊瑚红, --font-serif 32px)│  
│  半导体物理 · 第 5-7 章错 12 道  (--font-mono 12px color-fg-tertiary)│  
├────────────────────────────────────────────────────────────────────┤  
│                                                                    │  
│  ◉ L1 表面问题  [bg --color-info-bg, 左侧 2px --color-node-info 钢蓝]│  
│  ┌────────────────────────────────────────────────────────────┐   │  
│  │ 分数 55/100 · 错题章节 第 5-7 章 · 错题数量 12 道          │   │  
│  │ [chip: 第5章-3题] [chip: 第6章-5题] [chip: 第7章-4题]       │   │  
│  └────────────────────────────────────────────────────────────┘   │  
│           │ (--color-ink-300 节点轴线连接线)                       │  
│  ◉ L2 直接原因  [bg --color-warning-bg, 左侧 2px --color-node-warn]│  
│  ┌────────────────────────────────────────────────────────────┐   │  
│  │ • MOSFET C-V 特性 (掌握度 35%)                              │   │  
│  │ • 短沟道效应 (掌握度 40%)                                    │   │  
│  │ • 强反型判据 (掌握度 50%)                                    │   │  
│  │   (每条带 4px 掌握度条: ▓▓▓░░ 35%, 颜色按分档着色)         │   │  
│  └────────────────────────────────────────────────────────────┘   │  
│           │                                                         │  
│  ◉ L3 中间原因  [bg --color-error-bg, 左侧 2px --color-node-weak] │  
│  ┌────────────────────────────────────────────────────────────┐   │  
│  │ • 泊松方程求解 (L2 多项缺陷的共同前置)                        │   │  
│  │ • 半导体表面势                                                │   │  
│  └────────────────────────────────────────────────────────────┘   │  
│           │                                                         │  
│  ◉ L4 根本原因  [bg --color-bg-sunken, 左侧 2px --color-ink-700]  │  
│  ┌────────────────────────────────────────────────────────────┐   │  
│  │ • 学习方法：做题不回头（未及时复盘）                          │   │  
│  │ • 时间投入：本章相关复习 < 2h / 周                           │   │  
│  │ • 知识图谱断裂点：泊松方程 (大二下)  → 表面势 (大三上)         │   │  
│  └────────────────────────────────────────────────────────────┘   │  
│                                                                    │  
│  补强方案 (Card, padding --space-5, shadow-md radius-lg)            │  
│  ┌─ 紧急(本周) ─┐  ┌─ 重要(本月) ─┐  ┌─ 长期(3 个月) ─┐          │  
│  │ 教材 3.2 节    │  │ 真题 2024-Q5 │  │ 泊松方程专题     │          │  
│  │ [P0 徽章 bg   │  │ [P1 徽章 bg  │  │ [P2 徽章 bg      │          │  
│  │  --color-error│  │  --color-    │  │  --color-bg-     │          │  
│  │  -bg,珊瑚红]  │  │  warning-bg, │  │  sunken,凹陷灰]  │          │  
│  │               │  │  琥珀]       │  │                  │          │  
│  └───────────────┘  └──────────────┘  └─────────────────┘          │  
│                                                                    │  
│  [✏️ 同步到画像]  主 CTA (bg --color-ink-700) · 写入 weak_topics    │  
└────────────────────────────────────────────────────────────────────┘
</callout>

### 3.3 L1-L4 卡片色条（统一规范）

新美学下 4 层根因链采用"钢蓝 → 琥珀 → 珊瑚红 → 最深墨蓝"递进，层级越深颜色越沉（与原 v2 草案的"越深越警示 neutral→info→warning→error"不同，知识图谱风强调"根因 = 最深墨蓝 = 知识网络最深节点"）：

- L1 表面：`left-border 2px --color-node-info / bg --color-info-bg`（钢蓝，中性起点）
- L2 直接：`left-border 2px --color-node-warn / bg --color-warning-bg`（琥珀，具体缺陷）
- L3 中间：`left-border 2px --color-node-weak / bg --color-error-bg`（珊瑚红，中间原因）
- L4 根本：`left-border 2px --color-ink-700 / bg --color-bg-sunken`（最深墨蓝，根本原因）

色条宽度 2px（v1 规范 m2 修复后的统一宽度），4 层卡片左侧各渲染节点圆点 + 竖直连线，构成 diagnose Agent 的琥珀节点轴线。

### 3.4 掌握度条

- 宽度 4px（比 v1 的 Progress 略粗，便于卡片内显示）
- 分档：< 50% `--color-node-weak`（珊瑚红）· 50-75% `--color-node-warn`（琥珀）· ≥ 75% `--color-node-active`（青绿）

## 4. 历史对比组件：HistoryComparison（v2 新增于 HistoryView 顶部）

v2 诊断历史接通，5 轮诊断后支持趋势对比，UI 做成 HistoryView 顶部 1 个可折叠的"5 轮趋势条"。整卡延续知识图谱风：卡片悬浮层叠（shadow-md + radius-lg），标题"5 轮诊断趋势"用 `--font-serif` 衬线，5 个数据点构成 diagnose Agent 的琥珀节点轴线，路径条 `▸ history ▸ trend` 用 `--font-mono`。

### 4.1 布局

<callout emoji="💡">
┌─ HistoryComparison (Card, padding --space-5, shadow-md radius-lg) ─┐  
│  5 轮诊断趋势  (--font-serif 22px)        [▸ 展开详情]              │  
│  ┌──────────────────────────────────────────────────────────────┐ │  
│  │  #1  #2  #3  #4  #5  (--font-mono 12px color-fg-tertiary)    │ │  
│  │  55  62  70  75  82  (--font-mono 14px color-fg-primary)     │ │  
│  │  ◉───◉───◉───◉───◉   (节点轴线折线图, diagnose Agent 琥珀系) │ │  
│  │  当前轮 82 用 --color-node-active 青绿 + --shadow-node 光晕  │ │  
│  │  历史轮用 --color-node-warn 琥珀 + opacity 0.6              │ │  
│  │  ▲+7 ▲+8 ▲+5 ▲+7   (环比徽章, +用 --color-success-bg/active,│ │  
│  │                       -用 --color-error-bg/weak)             │ │  
│  │                                                              │ │  
│  │  趋势研判：稳步提升 (5 轮共 +27 分，平均 +5.4/轮)              │ │  
│  │  [active 徽章 bg --color-success-bg / color --color-node-active]│ │  
│  │  [--font-mono 12px color-fg-secondary]                       │ │  
│  └──────────────────────────────────────────────────────────────┘ │  
└────────────────────────────────────────────────────────────────────┘
</callout>

### 4.2 实现要点

- 折线图：用 SVG 自绘（避免引入 Chart.js 增加首屏体积）· 5 个节点圆点（w-2.5 h-2.5 radius-full）· 当前轮 `--color-node-active`（青绿）+ `--shadow-node` 青绿光晕 · 历史轮 `--color-node-warn`（琥珀）+ opacity 0.6 · 连线 `stroke 1.5 / --color-ink-300`
- 环比徽章：`bg --color-success-bg / color --color-node-active`（正增长，青绿）或 `bg --color-error-bg / color --color-node-weak`（负增长，珊瑚红）· `--font-mono 12px`
- 趋势研判：3 档文案（稳步提升 = 青绿 / 基本稳定 = 钢蓝 / 出现下滑 = 珊瑚红）· 各配节点状态色徽章
- 展开详情：显示 5 轮的薄弱点变化矩阵（按行 = 知识点，按列 = 轮次，"该轮薄弱"用 `--color-node-weak` 珊瑚红圆点，"该轮已掌握"用 `--color-node-active` 青绿圆点，构成知识点 × 轮次的节点矩阵）

## 5. 计划调整段：PlanAdjustment（v2 新增于 PlanView）

v2 plan_version 接通后，v2+ 的计划在头部增加"本版本调整"段，3 类调整（保留/强化/放弃）用不同徽章和图标区分。整段延续知识图谱风：卡片悬浮层叠（shadow-md + radius-lg），标题"本版本调整"用 `--font-serif` 衬线，3 列对应 planner Agent 的青绿节点状态色系，路径条 `▸ plan ▸ v2 ▸ diff` 用 `--font-mono`。

### 5.1 布局（PlanView 顶部摘要条下方）

<callout emoji="💡">
┌─ 本版本调整 (Card, padding --space-5, shadow-md radius-lg) ─────┐  
│  --font-serif 22px "本版本调整"  ·  v1 → v2  (--font-mono 12px) │  
│  ┌─ 保留 (3 项) ─┐  ┌─ 强化 (2 项) ─┐  ┌─ 放弃 (1 项) ─┐           │  
│  │ bg --color-   │  │ bg --color-   │  │ bg --color-bg- │           │  
│  │  success-bg   │  │  info-bg      │  │  sunken        │           │  
│  │ 边条 node-    │  │ 边条 node-    │  │ 边条 ink-300   │           │  
│  │  active 青绿  │  │  info 钢蓝    │  │ 凹陷灰         │           │  
│  │  ✓ 教材 3.2   │  │  ↑ 真题 Q5   │  │  — 课后习题  │           │  
│  │    (完成率 85%)│  │  (45% → 80%) │  │  (12% → 换形)│           │  
│  │  ✓ 复盘笔记   │  │  ↑ 模拟卷 1  │  │              │           │  
│  │  ✓ 周复盘     │  │              │  │              │           │  
│  └───────────────┘  └──────────────┘  └──────────────┘           │  
└──────────────────────────────────────────────────────────────────┘
</callout>

### 5.2 三类调整的视觉规范

3 类调整对齐 planner Agent 青绿节点状态色系（保留=青绿成功 / 强化=钢蓝信息 / 放弃=凹陷灰中性）：

- **保留 keep**：`bg --color-success-bg / 左侧 2px --color-node-active`（青绿）· ✓ 图标 · 文字 "完成率 ≥ 70%" 标注 · 卡片左侧青绿节点圆点 + `--shadow-node` 青绿光晕
- **强化 strengthen**：`bg --color-info-bg / 左侧 2px --color-node-info`（钢蓝）· ↑ 图标 · 显示旧完成率 → 新目标 · 卡片左侧钢蓝节点圆点
- **放弃 abandon**：`bg --color-bg-sunken / 左侧 2px --color-ink-300`（凹陷灰）· — 图标 · 鼠标 hover 显示"放弃原因：完成率 < 30%" · 卡片左侧灰色空心节点圆点（表示已从图谱中摘除）

### 5.3 PlanCard 版本切换器

v2 计划版本接通，UI 顶部摘要条右侧增加版本切换器：

- Element Plus `<el-segmented>` · 选项"v1 / v2 / v3" · 当前版本 `bg --color-ink-100 + color --color-ink-700`（墨蓝调高亮，禁渐变纯色）
- 切换时整页 PlanView 重新加载（缓存 5min）· 顶部 Loading 骨架屏（`bg --color-bg-sunken`）

## 6. 6 场景演示话术面板（HomeView 演示模式升级）

v1 演示模式 5 个标准对话，v2 加 1 个级联场景（"先诊断再规划"），且每个场景加 [⏱ 时长] 显示和 [✅ 通过] 标记。快捷问题条做成终端命令行风格：`--font-mono` 等宽 + 前置 `▸` 提示符，6 个场景编号像 6 个节点圆点排列，对齐 diagnose Agent 琥珀节点状态色（演示态属"进行中"语义）。

### 6.1 演示模式快捷问题条（升级后）

<callout emoji="💡">
┌─ 演示快捷问题 (h-12 bg --color-warning-bg, border-b 1px --color-node-warn) ─┐  
│  ▸ demo ▸ scenes  (--font-mono 12px color-fg-tertiary, 终端命令行)         │  
│  [1️⃣ 初始化 1min]  [2️⃣ 概念 2min]  [3️⃣ 诊断 2min]              (--font-mono)│  
│  [4️⃣ 规划 2min]  [5️⃣ 择校 3min]  [6️⃣ 级联 3min]                          │  
│  (6 场景 = 6 个节点圆点, 当前激活场景边框 --color-node-warn 琥珀)            │  
│                                                                          │  
│  总时长：13 / 15 min  [███████░░░░░]                                    │  
│  (进度条 h-2, 轨道 --color-bg-sunken, 填充按节点状态色:                  │  
│   <50% 琥珀 / 50-80% 钢蓝 / ≥80% 青绿)                                  │  
│  [🎬 演示中] 状态徽章 bg --color-node-warn + --shadow-node, 1s 脉动      │  
└──────────────────────────────────────────────────────────────────────┘
</callout>

### 6.2 单场景通过态

- 点击场景后整条变 `bg --color-bg-sunken`，右侧追加 [⏳ 进行中] 徽章 `bg --color-warning-bg / color --color-node-warn`（琥珀）
- AI 返回后右侧追加 [✅ 通过] 徽章，`bg --color-success-bg / color --color-node-active`（青绿）+ `--shadow-node` 青绿光晕
- 若失败 → [❌ 失败] 徽章，`bg --color-error-bg / color --color-node-weak`（珊瑚红），并把备份方案（v3 才上）的对应兜底链接展开

## 7. Agent「v2 优化」徽章

v2 4 个业务 Agent Prompt 全部深度优化，UI 须让评审看到"这是 v2 优化版"，不能跟 v1 骨架版混在一起。徽章沿用知识图谱风墨蓝调（与 4 节点状态色区分，徽章属"系统元信息"不抢 Agent 节点色）。

- 每个 Agent 气泡 Header：标题右侧加 1 个 [v2 优化] 徽章 · `bg --color-ink-100 / color --color-ink-700 / border 1px --color-ink-300 / --font-mono 11px font-medium`（墨蓝调，禁渐变纯色）
- 气泡左侧 3px 节点状态色边条沿用 v1（导师=钢蓝 / 诊断=琥珀 / 规划=青绿 / 择校=珊瑚红），节点圆点带 `--shadow-node` 对应色光晕
- 气泡内容若长度 > 500 字，自动加 [▸ 展开全部] / [▴ 收起] 折叠控件（`--font-mono 12px`），默认折叠到 500 字（防止占据整屏）

## 8. 跨 Agent 状态一致性（v2 验证可见化）

v2 §7.5 跨 Agent 状态一致性测试在 UI 留 1 个隐藏入口（评审追问时展示）。

- HomeView TopBar 用户入口下拉菜单加 [🔍 状态检查（v2 内部）] · 仅演示模式可见
- 点击后弹 Modal 展示 4 行状态：① 诊断后画像更新 ✓ ② 规划后 plan_version 递增 ✓ ③ 级联状态保持 ✓ ④ 多次诊断对比 ✓ · 每行带时间戳

## 9. v2 UI 验收清单（在 v1 知识图谱风基础上增量）

- <input type="checkbox" checked="false" /> RAGPanel 5 类文件徽章配色正确（教材=墨蓝 `--color-ink-100/700` / 真题=钢蓝 / 院校=琥珀 / 经验=青绿 / 政策=凹陷灰），图标 📘📝🏛️💬📋 正确
- <input type="checkbox" checked="false" /> TF-IDF 分数条 3 档节点状态色按分档正确（≥0.8 青绿 `--color-node-active` / 0.5-0.8 钢蓝 `--color-node-info` / <0.5 琥珀 `--color-node-warn`）
- <input type="checkbox" checked="false" /> DiagnosisDetail 路由可访问，4 层根因链 L1-L4 色条按"钢蓝→琥珀→珊瑚红→最深墨蓝"递进，节点轴线（圆点 + 连线）渲染正确，标题用 `--font-serif` 衬线
- <input type="checkbox" checked="false" /> HistoryView 顶部 5 轮趋势条正确渲染（折线节点圆点 + 环比徽章 + 趋势研判徽章），当前轮青绿 + `--shadow-node` 光晕，历史轮琥珀
- <input type="checkbox" checked="false" /> PlanView 顶部 PlanAdjustment 三类（保留=青绿 / 强化=钢蓝 / 放弃=凹陷灰）卡片视觉区分清晰，左侧节点圆点 + 边条正确
- <input type="checkbox" checked="false" /> PlanCard 版本切换器 v1↔v2 切换正常，当前版本墨蓝高亮（`--color-ink-100` bg / `--color-ink-700` color，禁渐变），加载骨架屏 `--color-bg-sunken` 显示
- <input type="checkbox" checked="false" /> 演示模式快捷问题 6 个场景（升级 1 个）全部可点击，终端命令行风格（`--font-mono` + `▸` 提示符），时长进度条按节点状态色分档填充
- <input type="checkbox" checked="false" /> 4 个 Agent 气泡 Header 都有 [v2 优化] 徽章（墨蓝调 `--color-ink-100/700`），气泡左侧 3px 节点状态色边条 + `--shadow-node` 光晕正确，> 500 字时自动折叠
- <input type="checkbox" checked="false" /> 状态检查 Modal 4 行状态显示正确，时间戳 `--font-mono` 更新

---

<callout emoji="📌">
**v3 演进预告**：v2 完成后进入 v3 参赛级全套材料版，UI 将在 HomeView 顶栏加学科解耦切换器（微电子 ↔ CS）、HistoryView 加学科对比入口、ProfileView 加学科维度标签、PlanView 加评审备份链接条，并在演示模式加 10 大翻车点风险卡浮层。详见 v3 文档「前端 UI 设计」章节。
</callout>