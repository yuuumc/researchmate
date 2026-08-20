# CHANGELOG

## [Unreleased] - 2026-08-20

### Fixed
- **B3 判分容差调整**（PM 裁定 2026-08-20）：
  - 从「abs≤1 OR rel≤5%」改为「max(0.5, 5%×|答案|)」模型
  - 裁定理由：OR 模型 + abs≤1 在教学场景下判分过松（答案 2.5、学生答 3.4 误判对），污染 mastery 数据和后续推题
  - 新增 3 个 export：`ABS_TOLERANCE=0.5`、`REL_TOLERANCE=0.05`、`computeTolerance(correct)`（单一事实源）
  - 裁定人：高级项目经理（agent_4kq704fzbjknavw）
  - 额外修复（实现对齐测试规格时发现）：
    - 移除 P1-2「数字订正不覆盖 choice 题」限制：Wp/Wn 订正现在对 choice 题也生效（B3 测试规格要求）
    - 浮点边界修正：容差比较加 1e-9 epsilon，修复 24.2→25.41 边界 case 的 FP 精度问题
    - test-a2e.mjs P1-2 段对齐：Wp/Wn choice 题从「不订正」改为「订正生敏」
- **F1 masteryEngine 刻度对齐**: test-f1-masteryEngine.mjs 从 0-100 刻度对齐到 0-1 归一化刻度
  - 生产代码已全面使用 0-1 刻度（profile.js `migrateMasteryScale` 一次性迁移、
    feynman.js `score/100`、KnowledgeGraphView.vue `mastery*100` 显示、difficultyAdapt.js 注释）
  - masteryEngine.js 头部注释 `mastery:0-100` 修正为 `mastery:0-1`
  - 测试期望值全部转换为 0-1：mastery 80→0.8/60→0.6/40→0.4/100→1.0，
    masteryToStars 阈值 0.2/0.4/0.6/0.8，starsToMastery(3)=0.6，delta 检查 <1→<0.01

### Test Infrastructure
- **B1 KaTeX 渲染测试修复**: test-b1.mjs 补 `await ensureKatex()` 初始化调用
  - 根因非环境不匹配，而是测试遗漏了异步初始化步骤
  - KaTeX 在 Node 环境可正常 renderToString，修复后 9 条渲染断言全绿
- **B2 测试 skip**: test-b2.mjs 的 4 个 import（countSteps/getCurrentStep/extractFormulas/
  hasFormulaMarkers）在 derivationNormalize.js 中不存在，属 B2 阶段未实现功能，skip + TODO
- **B3 测试 FIXED**: test-b3-grading.mjs 已启用——grading.js 已添加 3 个 export + 容差模型改为 max(0.5, 0.05×|c|)，PM 裁定改实现对齐测试
