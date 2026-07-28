# v2.5 交付清单 · 教师侧 + 账号 UI 视图层

> Base: `main @ 349e43a` (v2.0 数据层)
> 作者: 前端开发工程师
> 日期: 2026-07-28

## 6 个 UI 视图（新建 10 文件）

| # | 文件 | 视图 | 数据层接线 |
|---|------|------|------------|
| 1 | `src/views/LoginView.vue` | 登录页 /login | AuthModal inline 模式；登录后按双源分发 |
| 2 | `src/components/AuthModal.vue` | 手机号 OTP 弹窗 | supabase.auth.signInWithOtp / verifyOtp；微信留占位 |
| 3 | `src/views/teacher/ClassListView.vue` | 教师班级列表 | `realListClasses` / `realCreateClass` / `realUpdateClass` / `realDeleteClass` |
| 4 | `src/views/teacher/StudentProfileView.vue` | 学生画像详情 | `realGetStudentProfile` 5 维能力星 / weak / mastered |
| 5 | `src/views/teacher/ClassStatsView.vue` | 班级统计 dashboard | `realGetClassStats` 4 卡 + 3 ECharts 图 |
| 6 | `src/components/SyncStatusBar.vue` | 同步状态条 | `useSyncStore` 5 态 + online/offline + 手动同步 |
| 7 | `src/components/ConflictResolveModal.vue` | 冲突解决弹窗 | 30s 倒计时 + 字段级 diff + 批量选择 |

## 工具/Store 层（新建 3 文件）

| 文件 | 用途 |
|------|------|
| `src/utils/authReady.js` | bootstrap 准备就绪门闩；router guard 等待 `whenAuthReady()` |
| `src/utils/conflictMerge.js` | 字段级合并规则（LWW / union / max / starMax） |
| `src/stores/sync.js` | UI 层 Pinia store：状态机 / syncNow / resolveConflict |

## 接线修改（5 文件）

| 文件 | 改动 |
|------|------|
| `src/router/index.js` | + /login + /teacher/classes + /teacher/classes/:id/stats + /teacher/students/:studentId；beforeEach 守卫：等 bootstrap → requireAuth → requireTeacher |
| `src/main.js` | + `bootstrapAuth()`：getSession → setSession → onAuthStateChange 订阅 → setAuthReady() |
| `src/App.vue` | + `<SyncStatusBar />` + `<ConflictResolveModal />` 挂载；登录页 `hideTopBar` 模式 |
| `src/styles/main.css` | + `--sync-{idle,syncing,success,conflict,offline}` 5 色 + `--role-{student,teacher}` 2 色（Design Token v2） |
| `package.json` | 无改动（依赖 v2.0 已就位） |

## 验收

- ✅ `npm install && npm run build` 通过（vite build 无 error，2336 modules transformed）
- ✅ 6 视图全部渲染，接真实 services（realXxx），不接 mock
- ✅ 无 anon key 时优雅降级（`isSupabaseConfigured` false → 跳过 auth guard、显示"未配置 Supabase"）
- ✅ Design Token v2 同步状态 5 色 + 角色 2 色落地；组件至少覆盖 default/hover/active/disabled/loading 5 态
- ✅ 用 Element Plus（el-dialog / el-button / ElMessage / ElMessageBox），不引入新 UI 库
- ✅ 所有新增 `.js` 通过 `node --check`
- ✅ 路由 `/login` + `/teacher/*` + auth guard 完成
- ✅ 教师双源判定：`isTeacher`（user_metadata.role）∪ `hasTeacherClasses`（fresh load）

## 边界遵守

- ❌ 未改数据层 6 文件（`stores/auth.js` / `services/sync.js` / `services/teacher.js` / `services/student.js` / `services/supabase.js` / `services/persist.js`）
- ❌ 未做 PWA / 计费 / 同伴社群
- ❌ 未动 Agent / Prompt / 后端 `api/chat.js`

## ⚠️ 已知 gap（已在评论中报）

派发描述说"合并规则 LWW / union / max 已在 sync.js"——实际 `services/sync.js` 只有 `pullAndMerge`（远端覆盖），无字段级合并。按边界"不改数据层 6 文件"在 UI 层 `utils/conflictMerge.js` 补齐 LWW / union / max / starMax 规则。建议 v2.6 后续把合并规则下沉到 `services/sync.js` 与 RLS 校验同处管理。

## 构建

```bash
cd /tmp/yxt-check
npm install  # 99 packages
npm run build  # ✓ built in 13.37s
```

构建产物总大小：~1.4MB（gzip ~450KB）；6 视图已 code-split。
