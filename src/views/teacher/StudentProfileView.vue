<script setup>
// ============================================================
// StudentProfileView · 学生画像详情（v2.5 · 教师侧）
// ============================================================
// 数据：teacher.js realGetStudentProfile(studentId)
// 渲染：profile（metadata 内嵌认知模型）+ 最近 5 次 diagnosis
// 能力星视觉沿用 v1.5 ProfileCard 语言（★ 重复 / ≤2 红 / =5 绿）
// ============================================================
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  realGetStudentProfile
} from '@/services/teacher'
import { isSupabaseConfigured } from '@/services/supabase'

const route = useRoute()
const router = useRouter()
const studentId = route.params.studentId

const loading = ref(true)
const error = ref('')
const profile = ref(null)
const diagnoses = ref([])

const meta = computed(() => profile.value?.metadata || {})

const abilityList = computed(() => {
  const stars = meta.value.ability_stars || {}
  return Object.entries(stars)
    .map(([topic, s]) => ({ topic, stars: s }))
    .sort((a, b) => a.stars - b.stars)
})

const avgAbility = computed(() => {
  if (abilityList.value.length === 0) return null
  const sum = abilityList.value.reduce((s, x) => s + x.stars, 0)
  return (sum / abilityList.value.length).toFixed(1)
})

const latestDiagnosis = computed(() => diagnoses.value[0] || null)

function renderStars(n) {
  const s = Math.max(0, Math.min(5, Math.round(n || 0)))
  return '★'.repeat(s) + '☆'.repeat(5 - s)
}

function styleLabel(v) {
  return { theoretical: '理论型', practical: '实践型', mixed: '混合型' }[v] || '—'
}

function stageLabel(v) {
  return { initial: '起步', basic: '基础', intensive: '强化', sprint: '冲刺' }[v] || '—'
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-CN')
}

function scoreOf(d) {
  return d?.scores?.overall ?? null
}

onMounted(async () => {
  if (!isSupabaseConfigured) {
    loading.value = false
    return
  }
  try {
    const res = await realGetStudentProfile(studentId)
    profile.value = res.profile
    diagnoses.value = res.recent_diagnoses || []
  } catch (e) {
    console.error('[student-profile] load failed:', e)
    error.value = e?.message || '加载学生画像失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="student-profile-page">
    <header class="page-header">
      <button class="btn-back" @click="router.back()">← 返回</button>
      <h1 class="page-title">学生画像</h1>
    </header>

    <div v-if="!isSupabaseConfigured" class="notice-card">
      <h3>未配置 Supabase</h3>
      <p>教师侧功能需要多用户后端支持。</p>
    </div>

    <div v-else-if="loading" class="skeleton-wrap">
      <div class="skeleton-block" style="height: 120px" />
      <div class="skeleton-block" style="height: 260px" />
    </div>

    <div v-else-if="error" class="notice-card error">
      <h3>加载失败</h3>
      <p>{{ error }}</p>
    </div>

    <div v-else-if="!profile" class="notice-card">
      <h3>学生不存在</h3>
      <p>该学生可能未完善画像，或你没有查看权限。</p>
    </div>

    <template v-else>
      <!-- 身份卡 -->
      <section class="card identity-card">
        <div class="avatar">{{ (profile.name || '学').charAt(0) }}</div>
        <div class="identity-info">
          <h2 class="student-name">{{ profile.name || '未命名学生' }}</h2>
          <p class="student-meta">
            <span v-if="profile.phone" class="mono">{{ profile.phone }}</span>
            <span v-if="meta.major"> · {{ meta.major }}</span>
            <span v-if="meta.target_direction"> · 目标 {{ meta.target_direction }}</span>
          </p>
          <div class="badge-row">
            <span class="badge badge-role">学生</span>
            <span class="badge">{{ stageLabel(meta.preparation_stage) }}阶段</span>
            <span class="badge">{{ styleLabel(meta.learning_style) }}</span>
            <span v-if="meta.exam_date" class="badge">考研 {{ meta.exam_date }}</span>
          </div>
        </div>
        <div v-if="avgAbility !== null" class="avg-ability">
          <span class="avg-num">{{ avgAbility }}</span>
          <span class="avg-label">平均能力星</span>
        </div>
      </section>

      <!-- 能力星级 -->
      <section v-if="abilityList.length > 0" class="card">
        <h3 class="card-title">能力星级 <span class="count">{{ abilityList.length }}</span></h3>
        <div class="star-list">
          <div
            v-for="item in abilityList"
            :key="item.topic"
            class="star-row"
            :class="{ 'star-weak': item.stars <= 2, 'star-mastered': item.stars === 5 }"
          >
            <span class="star-topic">{{ item.topic }}</span>
            <span class="star-value">{{ renderStars(item.stars) }}</span>
          </div>
        </div>
      </section>

      <!-- 薄弱 / 已掌握 -->
      <section class="card two-col">
        <div>
          <h3 class="card-title">薄弱知识点 <span class="count">{{ (meta.weak_topics || []).length }}</span></h3>
          <div class="chip-list">
            <span v-for="t in meta.weak_topics || []" :key="`w-${t}`" class="chip chip-weak">{{ t }}</span>
            <span v-if="!(meta.weak_topics || []).length" class="empty-hint">暂无</span>
          </div>
        </div>
        <div>
          <h3 class="card-title">已掌握 <span class="count">{{ (meta.mastered_topics || []).length }}</span></h3>
          <div class="chip-list">
            <span v-for="t in meta.mastered_topics || []" :key="`m-${t}`" class="chip chip-mastered">{{ t }}</span>
            <span v-if="!(meta.mastered_topics || []).length" class="empty-hint">暂无</span>
          </div>
        </div>
      </section>

      <!-- 最近诊断 -->
      <section class="card">
        <h3 class="card-title">最近诊断 <span class="count">{{ diagnoses.length }}</span></h3>
        <div v-if="!diagnoses.length" class="empty-hint">该学生还没有诊断记录</div>
        <div v-else class="diag-list">
          <article
            v-for="d in diagnoses"
            :key="d.id"
            class="diag-row"
            :class="{ latest: latestDiagnosis && d.id === latestDiagnosis.id }"
          >
            <div class="diag-head">
              <span class="diag-subject">{{ d.subject || '—' }}</span>
              <span class="diag-score" v-if="scoreOf(d) !== null">{{ scoreOf(d) }} 分</span>
              <span class="diag-time">{{ formatDate(d.created_at) }}</span>
            </div>
            <div class="diag-tags">
              <span v-for="t in d.weak || []" :key="`dw-${d.id}-${t}`" class="chip chip-weak chip-sm">{{ t }}</span>
              <span v-for="t in d.mastered || []" :key="`dm-${d.id}-${t}`" class="chip chip-mastered chip-sm">{{ t }}</span>
            </div>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.student-profile-page {
  flex: 1;
  padding: var(--space-6) var(--space-8);
  max-width: 960px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.page-header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.btn-back {
  border: none;
  background: var(--color-bg-sunken);
  color: var(--color-fg-secondary);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-meta);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-back:hover { background: var(--color-border-subtle); color: var(--color-fg-primary); }
.btn-back:active { transform: scale(0.97); }

.page-title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: var(--text-section);
  color: var(--color-ink-900);
}

.card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  box-shadow: var(--shadow-sm);
}

.card-title {
  margin: 0 0 var(--space-4);
  font-size: var(--text-subtitle);
  color: var(--color-fg-secondary);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.count {
  padding: 1px 8px;
  background: var(--color-bg-sunken);
  border-radius: var(--radius-full);
  font-size: var(--text-caption);
  color: var(--color-fg-tertiary);
}

/* 身份卡 */
.identity-card {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--role-student-bg, #e6f1fb);
  color: var(--role-student, #4d9de0);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 600;
  flex-shrink: 0;
}

.identity-info { flex: 1; min-width: 0; }

.student-name {
  margin: 0;
  font-size: var(--text-title);
  color: var(--color-ink-900);
}

.student-meta {
  margin: var(--space-1) 0 var(--space-2);
  font-size: var(--text-meta);
  color: var(--color-fg-tertiary);
}

.mono { font-family: var(--font-mono); }

.badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.badge {
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background: var(--color-bg-sunken);
  color: var(--color-fg-secondary);
  font-size: var(--text-caption);
}

.badge-role {
  background: var(--role-student-bg, #e6f1fb);
  color: var(--role-student, #4d9de0);
}

.avg-ability {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 var(--space-4);
}

.avg-num {
  font-size: var(--text-display);
  font-weight: 700;
  color: var(--color-ink-700);
  font-variant-numeric: tabular-nums;
}

.avg-label {
  font-size: var(--text-caption);
  color: var(--color-fg-tertiary);
}

/* 能力星 */
.star-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.star-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-sunken);
  border-radius: var(--radius-sm);
  font-size: var(--text-body);
}

.star-row.star-weak { background: var(--color-error-bg); }
.star-row.star-mastered { background: var(--color-success-bg); }

.star-topic { color: var(--color-fg-primary); }

.star-value {
  color: var(--color-ink-700);
  letter-spacing: 2px;
  font-variant-numeric: tabular-nums;
}

.star-weak .star-value { color: var(--color-error); }
.star-mastered .star-value { color: var(--color-success); }

/* chips */
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-5);
}

.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.chip {
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: var(--text-meta);
}

.chip-sm { font-size: var(--text-caption); padding: 2px 8px; }

.chip-weak { background: var(--color-error-bg); color: var(--color-error); }
.chip-mastered { background: var(--color-success-bg); color: var(--color-success); }

.empty-hint { font-size: var(--text-meta); color: var(--color-fg-muted); }

/* 诊断列表 */
.diag-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.diag-row {
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
}

.diag-row.latest { border-color: var(--color-node-info); }

.diag-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}

.diag-subject { font-weight: 600; color: var(--color-ink-900); }

.diag-score {
  font-weight: 700;
  color: var(--color-node-info);
  font-variant-numeric: tabular-nums;
}

.diag-time {
  margin-left: auto;
  font-size: var(--text-caption);
  color: var(--color-fg-muted);
}

.diag-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

/* 骨架 / 提示 */
.skeleton-wrap { display: flex; flex-direction: column; gap: var(--space-4); }

.skeleton-block {
  border-radius: var(--radius-lg);
  background: linear-gradient(90deg, var(--color-bg-sunken) 25%, var(--color-bg-elevated) 50%, var(--color-bg-sunken) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

.notice-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-10);
  text-align: center;
}

.notice-card.error h3 { color: var(--color-error); }

.notice-card h3 { margin: 0 0 var(--space-2); color: var(--color-ink-900); }
.notice-card p { margin: 0; color: var(--color-fg-secondary); }

@media (max-width: 768px) {
  .student-profile-page { padding: var(--space-4); }
  .identity-card { flex-wrap: wrap; }
  .two-col { grid-template-columns: 1fr; }
  .avg-ability { width: 100%; flex-direction: row; gap: var(--space-2); justify-content: flex-start; padding: 0; }
  .avg-num { font-size: var(--text-section); }
}
</style>
