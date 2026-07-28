# 研芯通 v2.0 · UI 设计规范引用

> 来源：UI 设计师交付（子任务 #64）
> 日期：2026-07-28

## 设计规范

- **7 章节设计规范**：[研芯通 v2.0 设计规范](https://larkcommunity.feishu.cn/docx/PafsdZUeoozF0ZxFV6vckxdin6b)
- **可视化原型**（妙搭，4 断点 375/768/1280/1920）：[打开原型](https://larkcommunity.feishu.cn/page/YHAemKP52dteVqaktvbckt7cnLc)

## 核心资产

- **Design Token v2** — 同步状态 5 色 + 角色 2 色 + 8 阴影 + 8 圆角 + 6 曲线
- **组件状态矩阵** — 12 组件 × 9 态（default / hover / active / disabled / focus / loading / empty / error / partial-sync）
- **多设备断点** — 375 / 768 / 1280 / 1920

## 集成说明

UI v2.0 主要是规范与原型（设计资产），与 v2.0 代码集成关系：
- 同步状态 5 色映射到 `--sync-{idle,syncing,success,conflict,offline}` CSS 变量
- 12 组件 × 9 态对照 FrontendEngineer 交付的 UI 层组件（AuthModal / ClassListView / ClassStatsView / ConflictResolveModal / SyncStatusBar）
- 角色 2 色（student / teacher）映射到 Pinia auth store 的 `role` 字段

## 后续

实际组件级集成在 v2.0 frontend 集成时由 FE 工程师按本规范实现，本仓库先落规范链接。
