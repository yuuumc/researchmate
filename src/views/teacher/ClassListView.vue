<script setup>
// ============================================================
// ClassListView · 教师班级列表（v2.5）
// ============================================================
// 数据：teacher.js realListClasses（auth store teacherClasses 缓存）
// 操作：realCreateClass（6 位 invite_code 展示 + 复制）/ realUpdateClass / realDeleteClass
// 展开班级卡片内嵌学生列表（realListStudents），点击进入 StudentProfileView
// ============================================================
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import {
  realCreateClass,
  realUpdateClass,
  realDeleteClass,
  realListStudents
} from '@/services/teacher'
import { isSupabaseConfigured } from '@/services/supabase'

const router = useRouter()
const auth = useAuthStore()

const creating = ref(false)
const createForm = ref({ name: '', subject: 'microelectronics' })
const createLoading = ref(false)
const createdCode = ref('')

const renaming = ref(null) // 正在改名的班级
const renameValue = ref('')
const actionLoadingId = ref('')

const expandedId = ref('')
const studentsMap = ref({}) // classId -> { loading, list, error }

const classes = computed(() => auth.teacherClasses)
const loading = computed(() => auth.loadingTeacherClasses)

const SUBJECTS = [
  { value: 'microelectronics', label: '微电子' },
  { value: 'cs', label: '计算机' }
]

onMounted(async () => {
  try {
    await auth.loadTeacherClasses()
  } catch (e) {
    console.error('[class-list] load failed:', e)
  }
})

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code)
    ElMessage.success(`邀请码 ${code} 已复制`)
  } catch (_) {
    // clipboard 降级：选中文本提示
    ElMessage.info(`邀请码：${code}（请手动复制）`)
  }
}

async function submitCreate() {
  if (!createForm.value.name.trim() || createLoading.value) return
  createLoading.value = true
  try {
    const cls = await realCreateClass(createForm.value)
    createdCode.value = cls.invite_code
    createForm.value = { name: '', subject: 'microelectronics' }
    await auth.loadTeacherClasses()
    ElMessage.success(`班级「${cls.name}」已创建`)
  } catch (e) {
    console.error('[class-list] create failed:', e)
    ElMessage.error(e?.message || '创建班级失败')
  } finally {
    createLoading.value = false
  }
}

function startRename(cls) {
  renaming.value = cls
  renameValue.value = cls.name
}

async function submitRename() {
  if (!renaming.value || !renameValue.value.trim()) return
  actionLoadingId.value = renaming.value.id
  try {
    await realUpdateClass(renaming.value.id, { name: renameValue.value.trim() })
    await auth.loadTeacherClasses()
    ElMessage.success('已改名')
    renaming.value = null
  } catch (e) {
    console.error('[class-list] rename failed:', e)
    ElMessage.error(e?.message || '改名失败')
  } finally {
    actionLoadingId.value = ''
  }
}

async function archiveClass(cls) {
  if (!window.confirm(`确定归档班级「${cls.name}」？学生数据保留，班级不再展示。`)) return
  actionLoadingId.value = cls.id
  try {
    await realDeleteClass(cls.id)
    await auth.loadTeacherClasses()
    ElMessage.success('已归档')
  } catch (e) {
    console.error('[class-list] archive failed:', e)
    ElMessage.error(e?.message || '归档失败')
  } finally {
    actionLoadingId.value = ''
  }
}

async function toggleStudents(cls) {
  if (expandedId.value === cls.id) {
    expandedId.value = ''
    return
  }
  expandedId.value = cls.id
  if (studentsMap.value[cls.id]?.list) return
  studentsMap.value = {
    ...studentsMap.value,
    [cls.id]: { loading: true, list: null, error: null }
  }
  try {
    const list = await realListStudents(cls.id)
    studentsMap.value = {
      ...studentsMap.value,
      [cls.id]: { loading: false, list, error: null }
    }
  } catch (e) {
    console.error('[class-list] listStudents failed:', e)
    studentsMap.value = {
      ...studentsMap.value,
      [cls.id]: { loading: false, list: null, error: e?.message || '加载失败' }
    }
  }
}

function goStudent(studentId) {
  router.push(`/teacher/students/${studentId}`)
}

function goStats(cls) {
  router.push(`/teacher/classes/${cls.id}/stats`)
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('zh-CN')
}

function subjectLabel(s) {
  return SUBJECTS.find((x) => x.value === s)?.label || s || '—'
}
</script>

<template>
  <div class="class-list-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">我的班级</h1>
        <p class="page-subtitle">创建班级、分享邀请码、查看学生进展</p>
      </div>
      <button
        v-if="isSupabaseConfigured"
        class="btn btn-primary"
        :disabled="loading"
        @click="creating = true"
      >
        + 创建班级
      </button>
    </header>

    <!-- 未配置 Supabase 降级 -->
    <div v-if="!isSupabaseConfigured" class="degraded-card">
      <h3>未配置 Supabase</h3>
      <p>教师侧功能需要多用户后端支持。请配置 <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code> 后刷新。</p>
    </div>

    <!-- 加载骨架 -->
    <div v-else-if="loading && classes.length === 0" class="skeleton-grid">
      <div v-for="i in 3" :key="i" class="skeleton-card" />
    </div>

    <!-- 空态 -->
    <div v-else-if="classes.length === 0" class="empty-card">
      <div class="empty-icon">🏫</div>
      <h3>还没有班级</h3>
      <p>创建第一个班级，把邀请码发给学生即可开始使用。</p>
      <button class="btn btn-primary" @click="creating = true">+ 创建班级</button>
    </div>

    <!-- 班级卡片网格 -->
    <div v-else class="class-grid">
      <article v-for="cls in classes" :key="cls.id" class="class-card">
        <header class="class-head">
          <div class="class-title-row">
            <h3 class="class-name">{{ cls.name }}</h3>
            <span class="subject-badge">{{ subjectLabel(cls.subject) }}</span>
          </div>
          <p class="class-meta">创建于 {{ formatDate(cls.created_at) }}</p>
        </header>

        <div class="class-stats">
          <div class="stat">
            <span class="stat-num">{{ cls.student_count }}</span>
            <span class="stat-label">学生</span>
          </div>
          <div class="stat">
            <span class="stat-num">{{ cls.avg_ability !== null ? cls.avg_ability.toFixed(1) : '—' }}</span>
            <span class="stat-label">平均能力星</span>
          </div>
        </div>

        <div class="invite-row">
          <span class="invite-label">邀请码</span>
          <code class="invite-code">{{ cls.invite_code }}</code>
          <button class="btn-link" @click="copyCode(cls.invite_code)">复制</button>
        </div>

        <footer class="class-actions">
          <button class="btn btn-ghost" :disabled="actionLoadingId === cls.id" @click="toggleStudents(cls)">
            {{ expandedId === cls.id ? '收起学生' : `学生 (${cls.student_count})` }}
          </button>
          <button class="btn btn-ghost" :disabled="actionLoadingId === cls.id" @click="goStats(cls)">学情看板</button>
          <button class="btn btn-ghost" :disabled="actionLoadingId === cls.id" @click="startRename(cls)">改名</button>
          <button class="btn btn-danger-ghost" :disabled="actionLoadingId === cls.id" @click="archiveClass(cls)">归档</button>
        </footer>

        <!-- 内嵌学生列表 -->
        <div v-if="expandedId === cls.id" class="student-panel">
          <div v-if="studentsMap[cls.id]?.loading" class="panel-loading">加载学生中…</div>
          <div v-else-if="studentsMap[cls.id]?.error" class="panel-error">
            {{ studentsMap[cls.id].error }}
            <button class="btn-link" @click="toggleStudents(cls); toggleStudents(cls)">重试</button>
          </div>
          <div v-else-if="!studentsMap[cls.id]?.list?.length" class="panel-empty">还没有学生加入，分享邀请码给他们吧。</div>
          <ul v-else class="student-list">
            <li
              v-for="s in studentsMap[cls.id].list"
              :key="s.student_id"
              class="student-row"
              @click="goStudent(s.student_id)"
            >
              <span class="student-name">{{ s.name || '未命名' }}</span>
              <span class="student-meta">{{ s.phone || '—' }}</span>
              <span class="student-score" :class="{ 'score-none': s.last_diagnosis_score === null }">
                {{ s.last_diagnosis_score !== null ? `${s.last_diagnosis_score} 分` : '未诊断' }}
              </span>
            </li>
          </ul>
        </div>
      </article>
    </div>

    <!-- 创建班级弹层 -->
    <teleport to="body">
      <div v-if="creating" class="modal-overlay" @click.self="creating = false; createdCode = ''">
        <div class="modal-card">
          <h3 class="modal-title">创建班级</h3>
          <template v-if="!createdCode">
            <label class="form-label">班级名称</label>
            <input
              v-model="createForm.name"
              class="text-input"
              maxlength="30"
              placeholder="如：2026 微电子考研 1 班"
              @keyup.enter="submitCreate"
            />
            <label class="form-label">学科</label>
            <div class="subject-select">
              <button
                v-for="s in SUBJECTS"
                :key="s.value"
                class="subject-option"
                :class="{ active: createForm.subject === s.value }"
                @click="createForm.subject = s.value"
              >
                {{ s.label }}
              </button>
            </div>
            <div class="modal-actions">
              <button class="btn btn-ghost" :disabled="createLoading" @click="creating = false">取消</button>
              <button
                class="btn btn-primary"
                :disabled="!createForm.name.trim() || createLoading"
                :class="{ 'is-loading': createLoading }"
                @click="submitCreate"
              >
                {{ createLoading ? '创建中…' : '创建' }}
              </button>
            </div>
          </template>
          <template v-else>
            <div class="created-result">
              <p class="created-hint">班级创建成功！把邀请码发给学生：</p>
              <code class="created-code">{{ createdCode }}</code>
              <button class="btn btn-primary btn-block" @click="copyCode(createdCode)">复制邀请码</button>
              <button class="btn btn-ghost btn-block" @click="creating = false; createdCode = ''">完成</button>
            </div>
          </template>
        </div>
      </div>

      <!-- 改名弹层 -->
      <div v-if="renaming" class="modal-overlay" @click.self="renaming = null">
        <div class="modal-card">
          <h3 class="modal-title">班级改名</h3>
          <input v-model="renameValue" class="text-input" maxlength="30" @keyup.enter="submitRename" />
          <div class="modal-actions">
            <button class="btn btn-ghost" @click="renaming = null">取消</button>
            <button
              class="btn btn-primary"
              :disabled="!renameValue.trim() || actionLoadingId === renaming?.id"
              @click="submitRename"
            >保存</button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.class-list-page {
  flex: 1;
  padding: var(--space-6) var(--space-8);
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-6);
  gap: var(--space-4);
}

.page-title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: var(--text-section);
  color: var(--color-ink-900);
}

.page-subtitle {
  margin: var(--space-1) 0 0;
  font-size: var(--text-meta);
  color: var(--color-fg-tertiary);
}

/* 降级 / 空态 */
.degraded-card,
.empty-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-10);
  text-align: center;
}

.degraded-card code {
  font-family: var(--font-mono);
  background: var(--color-bg-sunken);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-size: var(--text-caption);
}

.empty-icon {
  font-size: 40px;
  margin-bottom: var(--space-3);
}

.empty-card h3,
.degraded-card h3 {
  margin: 0 0 var(--space-2);
  color: var(--color-ink-900);
}

.empty-card p,
.degraded-card p {
  margin: 0 0 var(--space-5);
  color: var(--color-fg-secondary);
  font-size: var(--text-body);
}

/* 骨架 */
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-4);
}

.skeleton-card {
  height: 220px;
  border-radius: var(--radius-lg);
  background: linear-gradient(90deg, var(--color-bg-sunken) 25%, var(--color-bg-elevated) 50%, var(--color-bg-sunken) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

/* 班级卡片 */
.class-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: var(--space-4);
}

.class-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--duration-base) var(--ease-out);
}

.class-card:hover {
  box-shadow: var(--shadow-md);
}

.class-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.class-name {
  margin: 0;
  font-size: var(--text-title);
  color: var(--color-ink-900);
}

.subject-badge {
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background: var(--role-teacher-bg, #f1ebfb);
  color: var(--role-teacher, #7c5cbf);
  font-size: var(--text-caption);
}

.class-meta {
  margin: var(--space-1) 0 0;
  font-size: var(--text-caption);
  color: var(--color-fg-muted);
}

.class-stats {
  display: flex;
  gap: var(--space-6);
  margin: var(--space-4) 0;
}

.stat {
  display: flex;
  flex-direction: column;
}

.stat-num {
  font-size: var(--text-section);
  font-weight: 700;
  color: var(--color-ink-700);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: var(--text-caption);
  color: var(--color-fg-tertiary);
}

.invite-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-sunken);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-4);
}

.invite-label {
  font-size: var(--text-caption);
  color: var(--color-fg-tertiary);
}

.invite-code {
  font-family: var(--font-mono);
  font-size: var(--text-subtitle);
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--color-ink-700);
}

.class-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

/* 按钮（本组件局部，沿用 token） */
.btn {
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--text-meta);
  font-weight: 500;
  padding: var(--space-2) var(--space-4);
  transition: all var(--duration-fast) var(--ease-out);
  cursor: pointer;
}

.btn:active:not(:disabled) { transform: scale(0.97); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-primary {
  background: var(--color-ink-700);
  color: var(--color-fg-inverse);
  padding: var(--space-3) var(--space-5);
  font-size: var(--text-body);
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-ink-900);
  box-shadow: var(--shadow-md);
}

.btn-ghost {
  background: var(--color-bg-sunken);
  color: var(--color-fg-secondary);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--color-border-subtle);
  color: var(--color-fg-primary);
}

.btn-danger-ghost {
  background: transparent;
  color: var(--color-error);
}

.btn-danger-ghost:hover:not(:disabled) {
  background: var(--color-error-bg);
}

.btn-block { width: 100%; }

.btn-link {
  border: none;
  background: none;
  color: var(--color-ink-500);
  font-size: var(--text-caption);
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
}

.btn-link:hover { color: var(--color-node-active); }

/* 学生面板 */
.student-panel {
  margin-top: var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
  padding-top: var(--space-3);
}

.panel-loading,
.panel-empty,
.panel-error {
  padding: var(--space-3);
  font-size: var(--text-meta);
  color: var(--color-fg-tertiary);
  text-align: center;
}

.panel-error { color: var(--color-error); }

.student-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.student-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}

.student-row:hover { background: var(--color-bg-sunken); }
.student-row:active { background: var(--color-border-subtle); }

.student-name {
  font-size: var(--text-body);
  color: var(--color-fg-primary);
  font-weight: 500;
}

.student-meta {
  font-size: var(--text-caption);
  color: var(--color-fg-muted);
  font-family: var(--font-mono);
}

.student-score {
  font-size: var(--text-meta);
  font-weight: 600;
  color: var(--color-node-info);
}

.student-score.score-none { color: var(--color-fg-muted); font-weight: 400; }

/* 弹层 */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  background: rgba(15, 30, 51, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}

.modal-card {
  width: 100%;
  max-width: 420px;
  background: var(--color-bg-elevated);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  padding: var(--space-6);
}

.modal-title {
  margin: 0 0 var(--space-4);
  font-family: var(--font-serif);
  font-size: var(--text-title);
  color: var(--color-ink-900);
}

.form-label {
  display: block;
  font-size: var(--text-meta);
  color: var(--color-fg-secondary);
  margin: var(--space-3) 0 var(--space-1);
}

.text-input {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  font-size: var(--text-body);
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-out);
}

.text-input:focus {
  border-color: var(--color-ink-700);
  box-shadow: 0 0 0 3px rgba(30, 58, 95, 0.12);
}

.subject-select {
  display: flex;
  gap: var(--space-2);
}

.subject-option {
  flex: 1;
  padding: var(--space-3);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  color: var(--color-fg-secondary);
  font-size: var(--text-body);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.subject-option:hover { border-color: var(--color-ink-500); }

.subject-option.active {
  border-color: var(--color-ink-700);
  background: var(--color-ink-700);
  color: var(--color-fg-inverse);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-5);
}

.created-result {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  text-align: center;
}

.created-hint { margin: 0; color: var(--color-fg-secondary); }

.created-code {
  font-family: var(--font-mono);
  font-size: var(--text-display);
  font-weight: 700;
  letter-spacing: 8px;
  color: var(--color-ink-700);
  padding: var(--space-4);
  background: var(--color-bg-sunken);
  border-radius: var(--radius-md);
}

@media (max-width: 768px) {
  .class-list-page { padding: var(--space-4); }
  .class-grid { grid-template-columns: 1fr; }
  .page-header { flex-direction: column; }
}
</style>
