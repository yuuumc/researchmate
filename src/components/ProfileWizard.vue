<script setup>
// ============================================================
// ProfileWizard — 3 步注册向导（v2.0 用户系统）
// ============================================================
// Step 1: 基础信息（nickname）
// Step 2: 学情自评（target_school, target_major, exam_year, mastered/weak, self_assessment）
// Step 3: 备考设置（exam_date, weekly_hours）
// 完成后 wizard_completed = true → 跳转首页
// 对齐 PRD 第六章 + UI 设计师 yx- 组件类
// ============================================================
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/profile'
import { saveProfile, loadProfile } from '@/services/profileService'
import { isSupabaseConfigured } from '@/services/supabase'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const profileStore = useProfileStore()

// 编辑模式：URL 带 ?edit=1 时预填已有数据
const isEditMode = computed(() => route.query.edit === '1')
const loadingExisting = ref(false)

const currentStep = ref(1)
const saving = ref(false)

// ---- 表单数据 ----
const form = ref({
  // Step 1
  nickname: '',
  // Step 2
  target_school: '',
  target_major: '',
  exam_year: 2027,
  mastered_skills: [],
  weak_points: [],
  self_assessment: {},
  // Step 3
  exam_date: '',
  weekly_hours: 20,
})

// ---- 专业选项 ----
const majors = [
  '半导体物理',
  '微电子器件',
  '集成电路设计',
  '微电子学与固体电子学',
  '电子科学与技术',
  '集成电路工程',
  '其他',
]

// ---- 常见知识点（学情自评用） ----
const knowledgePoints = [
  'PN结原理', 'MOSFET基础', 'CMOS模拟设计', '锁相环',
  '数字逻辑设计', 'Verilog HDL', '运算放大器', '半导体工艺',
  '量子力学基础', '固体物理', '信号与系统', '电路分析',
]

function toggleSkill(point, type) {
  const arr = form.value[type]
  const idx = arr.indexOf(point)
  if (idx >= 0) {
    arr.splice(idx, 1)
  } else {
    arr.push(point)
  }
  // mastered 和 weak 互斥
  if (type === 'mastered_skills') {
    form.value.weak_points = form.value.weak_points.filter(p => p !== point)
  } else {
    form.value.mastered_skills = form.value.mastered_skills.filter(p => p !== point)
  }
}

function setRating(subject, stars) {
  form.value.self_assessment[subject] = stars
}

// ---- 步骤校验 ----
const step1Valid = computed(() => form.value.nickname.trim().length >= 1)
const step2Valid = computed(() => form.value.target_school.trim() && form.value.target_major)
const step3Valid = computed(() => form.value.exam_date && form.value.weekly_hours >= 1)

const canNext = computed(() => {
  if (currentStep.value === 1) return step1Valid.value
  if (currentStep.value === 2) return step2Valid.value
  if (currentStep.value === 3) return step3Valid.value
  return false
})

// ---- 步骤导航 ----
function nextStep() {
  if (!canNext.value) return
  if (currentStep.value < 3) currentStep.value++
}

function prevStep() {
  if (currentStep.value > 1) currentStep.value--
}

// ---- 保存 ----
async function handleComplete() {
  if (!canNext.value || saving.value) return
  saving.value = true
  try {
    // 保存 profile + 标记向导完成
    const profileData = {
      nickname: form.value.nickname.trim(),
      target_school: form.value.target_school.trim(),
      target_major: form.value.target_major,
      exam_year: Number(form.value.exam_year),
      mastered_skills: form.value.mastered_skills,
      weak_points: form.value.weak_points,
      self_assessment: form.value.self_assessment,
      exam_date: form.value.exam_date,
      weekly_hours: Number(form.value.weekly_hours),
      wizard_completed: true,
    }

    await saveProfile(profileData)

    // 同步到本地 profile store
    profileStore.setIdentity({
      name: form.value.nickname.trim(),
      major: form.value.target_major,
      target_direction: form.value.target_major,
    })
    profileStore.setTarget(form.value.target_school, form.value.target_major)
    profileStore.setExamDate(form.value.exam_date)

    ElMessage.success(isEditMode ? '画像已更新' : '画像录入完成！开始你的备考之旅')

    // 编辑模式跳回画像页，新建模式跳首页
    router.push(isEditMode.value ? '/profile' : '/')
  } catch (e) {
    console.error('[ProfileWizard] save failed:', e)
    ElMessage.error('保存失败：' + (e?.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

// ---- 降级：未配置 Supabase ----
const degraded = !isSupabaseConfigured

// ---- 编辑模式：预填已有数据 ----
onMounted(async () => {
  if (!isEditMode.value || !isSupabaseConfigured) return
  loadingExisting.value = true
  try {
    const existing = await loadProfile()
    if (existing) {
      form.value.nickname = existing.nickname || ''
      form.value.target_school = existing.target_school || ''
      form.value.target_major = existing.target_major || ''
      form.value.exam_year = existing.exam_year || 2027
      form.value.mastered_skills = existing.mastered_skills || []
      form.value.weak_points = existing.weak_points || []
      form.value.self_assessment = existing.self_assessment || {}
      form.value.exam_date = existing.exam_date || ''
      form.value.weekly_hours = existing.weekly_hours || 20
    }
  } catch (e) {
    console.warn('[ProfileWizard] load existing failed:', e)
    ElMessage.warning('无法加载已有画像，请重新填写')
  } finally {
    loadingExisting.value = false
  }
})
</script>

<template>
  <div class="wizard-page">
    <!-- 降级提示 -->
    <div v-if="degraded" class="yx-card wizard-degraded">
      <div class="degraded-icon">⚠</div>
      <h3>未配置 Supabase</h3>
      <p>向导功能需要登录后使用。请先配置 Supabase 或以游客模式浏览。</p>
      <button class="yx-btn yx-btn--primary" @click="router.push('/')">返回首页</button>
    </div>

    <!-- 向导主体 -->
    <div v-else class="wizard-container">
      <!-- 步骤指示器 -->
      <div class="wizard-steps">
        <div
          v-for="s in 3"
          :key="s"
          class="wizard-step-indicator"
          :class="{ active: currentStep >= s, current: currentStep === s }"
        >
          <span class="step-dot">{{ currentStep > s ? '✓' : s }}</span>
          <span class="step-label">{{ ['', '基础信息', '学情自评', '备考设置'][s] }}</span>
        </div>
      </div>

      <!-- Step 1: 基础信息 -->
      <div v-show="currentStep === 1" class="yx-card wizard-step">
        <h2 class="wizard-title">{{ isEditMode ? '编辑基础信息' : '基础信息' }}</h2>
        <p class="wizard-subtitle">先告诉我们怎么称呼你</p>

        <div class="wizard-field">
          <label class="field-label">昵称 <span class="required">*</span></label>
          <input
            v-model="form.nickname"
            class="yx-input"
            placeholder="如：小明"
            maxlength="20"
          />
        </div>
      </div>

      <!-- Step 2: 学情自评 -->
      <div v-show="currentStep === 2" class="yx-card wizard-step">
        <h2 class="wizard-title">学情自评</h2>
        <p class="wizard-subtitle">你的目标院校和专业是什么？</p>

        <div class="wizard-field">
          <label class="field-label">目标院校 <span class="required">*</span></label>
          <input
            v-model="form.target_school"
            class="yx-input"
            placeholder="如：东南大学"
            list="school-list"
          />
          <datalist id="school-list">
            <option value="东南大学" />
            <option value="电子科技大学" />
            <option value="西安电子科技大学" />
            <option value="北京大学" />
            <option value="清华大学" />
            <option value="复旦大学" />
            <option value="上海交通大学" />
            <option value="浙江大学" />
            <option value="华中科技大学" />
            <option value="北京航空航天大学" />
          </datalist>
        </div>

        <div class="wizard-field">
          <label class="field-label">目标专业 <span class="required">*</span></label>
          <select v-model="form.target_major" class="yx-input">
            <option value="" disabled>请选择</option>
            <option v-for="m in majors" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>

        <div class="wizard-field">
          <label class="field-label">考研年份</label>
          <select v-model="form.exam_year" class="yx-input yx-input--narrow">
            <option :value="2026">2026</option>
            <option :value="2027">2027</option>
            <option :value="2028">2028</option>
          </select>
        </div>

        <div class="wizard-field">
          <label class="field-label">已掌握知识点（可选）</label>
          <div class="skill-chips">
            <button
              v-for="p in knowledgePoints"
              :key="p"
              class="skill-chip"
              :class="{ selected: form.mastered_skills.includes(p) }"
              @click="toggleSkill(p, 'mastered_skills')"
            >{{ p }}</button>
          </div>
        </div>

        <div class="wizard-field">
          <label class="field-label">薄弱知识点（可选）</label>
          <div class="skill-chips">
            <button
              v-for="p in knowledgePoints"
              :key="p"
              class="skill-chip skill-chip--weak"
              :class="{ selected: form.weak_points.includes(p) }"
              @click="toggleSkill(p, 'weak_points')"
            >{{ p }}</button>
          </div>
        </div>

        <div class="wizard-field">
          <label class="field-label">各科自评（1-5 星）</label>
          <div class="rating-grid">
            <div v-for="subj in ['半导体物理','微电子器件','集成电路设计']" :key="subj" class="rating-row">
              <span class="rating-label">{{ subj }}</span>
              <div class="star-group">
                <button
                  v-for="n in 5"
                  :key="n"
                  class="star-btn"
                  :class="{ active: (form.self_assessment[subj] || 0) >= n }"
                  @click="setRating(subj, n)"
                >★</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 3: 备考设置 -->
      <div v-show="currentStep === 3" class="yx-card wizard-step">
        <h2 class="wizard-title">备考设置</h2>
        <p class="wizard-subtitle">最后一步，设定你的备考节奏</p>

        <div class="wizard-field">
          <label class="field-label">考试日期 <span class="required">*</span></label>
          <input
            v-model="form.exam_date"
            class="yx-input"
            type="date"
          />
        </div>

        <div class="wizard-field">
          <label class="field-label">每周可学习时长（小时）<span class="required">*</span></label>
          <input
            v-model.number="form.weekly_hours"
            class="yx-input"
            type="number"
            min="1"
            max="80"
          />
          <div class="field-hint">建议 15-30 小时/周</div>
        </div>
      </div>

      <!-- 导航按钮 -->
      <div class="wizard-nav">
        <button
          v-if="currentStep > 1"
          class="yx-btn yx-btn--ghost"
          @click="prevStep"
        >上一步</button>
        <button
          v-if="currentStep < 3"
          class="yx-btn yx-btn--primary"
          :disabled="!canNext"
          @click="nextStep"
        >下一步</button>
        <button
          v-if="currentStep === 3"
          class="yx-btn yx-btn--primary"
          :disabled="!canNext || saving"
          @click="handleComplete"
        >{{ saving ? '保存中…' : '完成' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wizard-page {
  min-height: 100vh;
  background: var(--bg-base, #0a0b12);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: var(--space-8, 32px) var(--space-4, 16px);
}

.wizard-container {
  width: 100%;
  max-width: 560px;
}

/* 步骤指示器 */
.wizard-steps {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--space-8, 32px);
  position: relative;
}

.wizard-steps::before {
  content: '';
  position: absolute;
  top: 14px;
  left: 10%;
  right: 10%;
  height: 2px;
  background: var(--border-subtle, rgba(255,255,255,0.08));
  z-index: 0;
}

.wizard-step-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1, 4px);
  z-index: 1;
}

.step-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  background: var(--bg-elevated, #1a1d29);
  color: var(--text-muted, #64748b);
  border: 2px solid var(--border-subtle, rgba(255,255,255,0.08));
  transition: all var(--dur-base, 300ms) var(--ease-snappy, ease);
}

.wizard-step-indicator.active .step-dot {
  background: var(--primary, #22d3ee);
  color: #062a30;
  border-color: var(--primary, #22d3ee);
}

.wizard-step-indicator.current .step-dot {
  box-shadow: var(--shadow-focus, 0 0 0 3px rgba(34,211,238,0.25));
}

.step-label {
  font-size: var(--text-xs, 12px);
  color: var(--text-muted, #64748b);
  transition: color var(--dur-fast, 150ms);
}

.wizard-step-indicator.active .step-label {
  color: var(--text-primary, #f1f5f9);
}

/* 步骤卡片 */
.wizard-step {
  margin-bottom: var(--space-6, 24px);
  animation: wizard-fade-up var(--dur-base, 300ms) var(--ease-snappy, ease);
}

@keyframes wizard-fade-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.wizard-title {
  margin: 0 0 var(--space-1, 4px);
  font-family: var(--font-display, var(--font-body, sans-serif));
  font-size: var(--text-xl, 24px);
  color: var(--text-primary, #f1f5f9);
}

.wizard-subtitle {
  margin: 0 0 var(--space-6, 24px);
  font-size: var(--text-sm, 14px);
  color: var(--text-secondary, #94a3b8);
}

/* 表单字段 */
.wizard-field {
  margin-bottom: var(--space-6, 24px);
}

.field-label {
  display: block;
  margin-bottom: var(--space-2, 8px);
  font-size: var(--text-sm, 14px);
  font-weight: 500;
  color: var(--text-secondary, #94a3b8);
}

.required {
  color: var(--primary, #22d3ee);
}

.field-hint {
  margin-top: var(--space-1, 4px);
  font-size: var(--text-xs, 12px);
  color: var(--text-muted, #64748b);
}

.yx-input--narrow {
  max-width: 200px;
}

/* 知识点 chips */
.skill-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
}

.skill-chip {
  height: 32px;
  padding: 0 var(--space-3, 12px);
  border-radius: var(--radius-pill, 999px);
  border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
  background: transparent;
  color: var(--text-secondary, #94a3b8);
  font-size: var(--text-xs, 12px);
  cursor: pointer;
  transition: all var(--dur-fast, 150ms) var(--ease-snappy, ease);
}

.skill-chip:hover {
  border-color: var(--primary, #22d3ee);
  color: var(--primary, #22d3ee);
}

.skill-chip.selected {
  background: var(--primary-dim, rgba(34,211,238,0.12));
  border-color: var(--primary, #22d3ee);
  color: var(--primary, #22d3ee);
}

.skill-chip--weak.selected {
  background: rgba(248, 113, 113, 0.1);
  border-color: var(--danger, #f87171);
  color: var(--danger, #f87171);
}

/* 评分星级 */
.rating-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.rating-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rating-label {
  font-size: var(--text-sm, 14px);
  color: var(--text-secondary, #94a3b8);
}

.star-group {
  display: flex;
  gap: 2px;
}

.star-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: var(--text-muted, #64748b);
  font-size: 18px;
  cursor: pointer;
  transition: all var(--dur-fast, 150ms);
  opacity: 0.4;
}

.star-btn:hover {
  opacity: 0.7;
  transform: scale(1.15);
}

.star-btn.active {
  color: var(--warning, #fbbf24);
  opacity: 1;
}

/* 导航按钮 */
.wizard-nav {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3, 12px);
}

.wizard-nav .yx-btn--primary {
  margin-left: auto;
}

/* 降级卡片 */
.wizard-degraded {
  text-align: center;
  max-width: 400px;
  margin: 60px auto 0;
}

.degraded-icon {
  font-size: 48px;
  margin-bottom: var(--space-4, 16px);
}

.wizard-degraded h3 {
  color: var(--text-primary, #f1f5f9);
  margin-bottom: var(--space-2, 8px);
}

.wizard-degraded p {
  color: var(--text-secondary, #94a3b8);
  margin-bottom: var(--space-6, 24px);
}

/* select 样式修正 */
select.yx-input {
  appearance: none;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%2394a3b8' d='M6 8L0 0h12z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}

/* 响应式 */
@media (max-width: 480px) {
  .wizard-page { padding: var(--space-4, 16px) var(--space-2, 8px); }
  .step-label { display: none; }
  .wizard-nav { flex-direction: column; }
  .wizard-nav .yx-btn { width: 100%; }
}
</style>
