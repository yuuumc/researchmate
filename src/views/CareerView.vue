<script setup>
import { ref, computed } from 'vue'
import { useCareerStore } from '@/stores/career'
import { useProfileStore } from '@/stores/profile'
import { useMasteryData } from '@/composables/useMasteryData'
import { useTagInput } from '@/composables/useTagInput'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { stripStructuredJson } from '@/utils/stripStructuredJson'
import schoolData from '@/data/employment/school-profiles.json'
import { SEED_CAREER_PATHS } from '@/data/seedDemo'
import AiGeneratedBadge from '@/components/AiGeneratedBadge.vue'

const careerStore = useCareerStore()
const profileStore = useProfileStore()
// A1: 统一学情数据层 — 已掌握技能 / 弱弱点均直读共享数据源，禁止自行推断
const mastery = useMasteryData()

const schools = computed(() => schoolData.schools.map(s => ({
  name: s.school,
  alias: s.alias,
  region: s.region,
  level: s.level,
  rank: s.microelectronics_rank
})))

const form = ref({
  student_name: profileStore.profile?.name || profileStore.profile?.user_id || '',
  target_school: profileStore.profile?.target_school || '',
  target_major: profileStore.profile?.target_major || profileStore.profile?.major || '集成电路工程',
  // A1: 直读统一学情数据层（diagnosis 唯一源 + 统一 >=4 星阈值）
  //   - mastered_skills: 与主页/星图同源，诊断/练习判掌握即同步（A1-a/A1-c）
  //   - weak_points: 只含诊断薄弱点（考纲内），零职业技能标签（Bug1 数据层隔离）
  mastered_skills: [...mastery.masteredSkills.value],
  weak_points: [...mastery.weakPoints.value]
})

const { input: skillInput, add: addSkill, remove: removeSkill } = useTagInput(form, 'mastered_skills')
const { input: weakInput, add: addWeak, remove: removeWeak } = useTagInput(form, 'weak_points')

async function submit() {
  if (!form.value.student_name || !form.value.target_school) return
  // A1: 提交时重新读取最新学情数据（避免 form 初始化后 mastery 更新不同步）
  form.value.mastered_skills = [...mastery.masteredSkills.value]
  form.value.weak_points = [...mastery.weakPoints.value]
  await careerStore.runCareer({ ...form.value })
  // Bug1 热修：移除就业技能缺口回写画像薄弱点（原 P1-3 写回）
  // 就业职业技能标签（运放/Verilog/UVM…）不应进入诊断薄弱点池，否则练习题按职业技能抽题
  // T1-7 统一学情数据层将从数据源侧正式隔离 career 与 diagnosis 的薄弱点来源
}

const careerPaths = computed(() => careerStore.careerPaths)
const result = computed(() => careerStore.result)
const loading = computed(() => careerStore.loading)
const error = computed(() => careerStore.error)

// 空态红线：无 Agent 结果时展示种子推荐方向
const showSeed = computed(() => !careerStore.hasResult)
const seedPaths = SEED_CAREER_PATHS

// 序列化技能缺口（可能包含对象）
function cleanGap(g) {
  if (g == null) return ''
  if (typeof g === 'string') return g
  if (typeof g === 'object') {
    if (Array.isArray(g)) return g.map(cleanGap).join('、')
    return g.skill || g.name || g.gap || g.description || g.label || g.value || JSON.stringify(g)
  }
  return String(g)
}
</script>

<template>
  <div class="career-view">
    <div class="page-content">
      <div class="page-header">
        <div class="page-eyebrow"><span class="dot"></span><span>Career Agent</span></div>
        <h1 class="page-title">就业指导</h1>
        <p class="page-subtitle">基于院校就业画像 · 推荐 3 条路径 · 技能缺口分析</p>
      </div>

      <!-- 表单 -->
      <section class="form-section">
        <div class="form-row">
          <div class="form-group">
            <label>学生姓名</label>
            <input v-model="form.student_name" type="text" placeholder="请输入姓名" />
          </div>
          <div class="form-group">
            <label>目标院校</label>
            <select v-model="form.target_school">
              <option value="">请选择</option>
              <option v-for="s in schools" :key="s.name" :value="s.name">
                {{ s.name }}（{{ s.alias }}）· {{ s.level }} · {{ s.region }}
              </option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>目标专业</label>
            <input v-model="form.target_major" type="text" placeholder="如：集成电路工程" />
          </div>
        </div>

        <!-- 已掌握技能 -->
        <div class="form-group">
          <label>已掌握技能</label>
          <div class="tag-input">
            <span v-for="(s, i) in form.mastered_skills" :key="i" class="tag tag-green">
              {{ s }}<button @click="removeSkill(i)">×</button>
            </span>
            <input v-model="skillInput" type="text" placeholder="输入后回车添加"
              @keydown.enter.prevent="addSkill" />
          </div>
        </div>

        <!-- 薄弱点 -->
        <div class="form-group">
          <label>薄弱点</label>
          <div class="tag-input">
            <span v-for="(w, i) in form.weak_points" :key="i" class="tag tag-red">
              {{ w }}<button @click="removeWeak(i)">×</button>
            </span>
            <input v-model="weakInput" type="text" placeholder="输入后回车添加"
              @keydown.enter.prevent="addWeak" />
          </div>
        </div>

        <button class="submit-btn" :disabled="loading || !form.student_name || !form.target_school" @click="submit">
          {{ loading ? '生成中…' : '生成就业路径' }}
        </button>
        <div v-if="error" class="error-msg">{{ error }}</div>
      </section>

      <!-- 种子推荐方向（空态红线 · 评委首次进入即见内容） -->
      <section v-if="showSeed" class="result-section seed-section">
        <div class="section-header">
          <h2 class="section-title">推荐方向 <span class="seed-badge">Demo</span></h2>
          <span class="section-en">Career Paths</span>
        </div>
        <div class="path-cards">
          <div v-for="(p, i) in seedPaths" :key="i" class="path-card">
            <div class="path-header">
              <span class="path-num">{{ i + 1 }}</span>
              <span class="path-name">{{ p.title }}</span>
              <span class="path-weight">{{ p.match }}%</span>
            </div>
            <div class="path-detail">
              <div class="detail-row">
                <span class="detail-label">技能缺口</span>
                <span v-for="g in p.gap" :key="g" class="gap-chip">{{ g }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">代表企业</span>
                <span v-for="c in p.companies" :key="c" class="company-chip">{{ c }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">参考薪资</span>
                <span class="salary-text">{{ p.salary }}</span>
              </div>
            </div>
          </div>
        </div>
        <p class="seed-hint">以上为示例推荐方向，填写表单生成个性化路径</p>
      </section>
      <section v-if="careerPaths.length" class="result-section">
        <div class="section-header">
          <h2 class="section-title">推荐路径</h2>
          <span class="section-en">Career Paths</span>
          <AiGeneratedBadge />
        </div>
        <div class="path-cards">
          <div v-for="(path, i) in careerPaths" :key="i" class="path-card">
            <div class="path-header">
              <span class="path-num">{{ i + 1 }}</span>
              <span class="path-name">{{ path.direction || path.name || `路径 ${i+1}` }}</span>
              <span v-if="path.weight" class="path-weight">{{ (path.weight * 100).toFixed(0) }}%</span>
            </div>
            <div v-if="path.target_roles?.length" class="path-roles">
              <div v-for="(role, j) in path.target_roles" :key="j" class="role-item">
                <div class="role-header">
                  <span class="role-name">{{ role.role }}</span>
                </div>
                <div v-if="role.companies?.length" class="role-companies">
                  <span v-for="c in role.companies" :key="c" class="company-chip">{{ c }}</span>
                </div>
                <div v-if="role.skill_gaps?.length" class="role-gaps">
                  <span class="gap-label">技能缺口：</span>
                  <span v-for="g in role.skill_gaps" :key="cleanGap(g)" class="gap-chip">{{ cleanGap(g) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 结果：Markdown 报告 -->
      <section v-if="result?.content" class="report-section">
        <div class="section-header">
          <h2 class="section-title">详细报告</h2>
          <span class="section-en">Full Report</span>
        </div>
        <MarkdownRenderer :content="stripStructuredJson(result.content, { hasStructured: !!result.structured })" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.career-view { min-height: calc(100vh - 72px); }
.page-content { max-width: 880px; margin: 0 auto; padding: 40px 32px 64px; }

.page-header { margin-bottom: 32px; }
.page-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 4px 12px; background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle); border-radius: var(--radius-full);
  font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-500);
  margin-bottom: 12px;
}
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-node-active); }
.page-title { font-family: var(--font-serif); font-size: 32px; font-weight: 700; color: var(--color-ink-900); margin: 0 0 8px; }
.page-subtitle { font-size: 13px; color: var(--color-fg-secondary); margin: 0; }

.form-section {
  background: var(--color-bg-elevated); border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg); padding: 24px; margin-bottom: 24px;
  box-shadow: var(--shadow-sm);
}
.form-row { display: flex; gap: 16px; margin-bottom: 16px; }
.form-group { flex: 1; margin-bottom: 16px; }
.form-group label { display: block; font-size: 12px; font-weight: 600; color: var(--color-ink-700); margin-bottom: 6px; }
.form-group input, .form-group select {
  width: 100%; padding: 10px 12px; background: var(--color-bg-base);
  border: 1px solid var(--color-border-default); border-radius: var(--radius-sm);
  font-size: 14px; color: var(--color-ink-900);
}
.form-group input:focus, .form-group select:focus {
  outline: none; border-color: var(--color-node-active);
}

.tag-input {
  display: flex; flex-wrap: wrap; gap: 6px; padding: 8px;
  background: var(--color-bg-base); border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm); min-height: 42px; align-items: center;
}
.tag-input input { flex: 1; min-width: 120px; border: none; background: none; outline: none; font-size: 13px; }
.tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: var(--radius-full); font-size: 12px; }
.tag-green { background: var(--color-success-bg); color: var(--color-success); }
.tag-red { background: rgba(255,107,107,0.1); color: #ff6b6b; }
.tag button { background: none; border: none; cursor: pointer; font-size: 14px; line-height: 1; padding: 0; color: inherit; opacity: 0.6; }

.submit-btn {
  padding: 12px 32px; background: var(--color-ink-900); color: var(--color-fg-inverse);
  border: none; border-radius: var(--radius-sm); font-size: 14px; font-weight: 600;
  cursor: pointer; transition: opacity var(--duration-fast);
}
.submit-btn:hover:not(:disabled) { opacity: 0.85; }
.submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.error-msg { margin-top: 12px; padding: 10px 14px; background: rgba(255,107,107,0.08); border-radius: var(--radius-sm); color: #ff6b6b; font-size: 13px; }

.section-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
.section-title { font-family: var(--font-serif); font-size: 18px; font-weight: 700; color: var(--color-ink-900); margin: 0; }
.section-en { font-family: var(--font-mono); font-size: 11px; color: var(--color-fg-tertiary); letter-spacing: 1px; }

.path-cards { display: flex; flex-direction: column; gap: 16px; }
.path-card { background: var(--color-bg-elevated); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-lg); padding: 20px; }
.path-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.path-num { width: 28px; height: 28px; border-radius: 50%; background: var(--color-ink-900); color: var(--color-fg-inverse); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
.path-name { font-family: var(--font-serif); font-size: 16px; font-weight: 600; color: var(--color-ink-900); flex: 1; }
.path-weight { font-family: var(--font-mono); font-size: 12px; color: var(--color-node-active); }

.path-roles { display: flex; flex-direction: column; gap: 12px; }
.role-item { padding: 12px; background: var(--color-bg-sunken); border-radius: var(--radius-sm); }
.role-name { font-size: 14px; font-weight: 600; color: var(--color-ink-900); }
.role-companies { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.company-chip { padding: 3px 10px; background: var(--color-bg-elevated); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-full); font-size: 12px; color: var(--color-ink-700); }
.role-gaps { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.gap-label { font-size: 11px; color: var(--color-fg-tertiary); }
.gap-chip { padding: 2px 8px; background: rgba(255,209,102,0.15); border-radius: var(--radius-xs); font-size: 11px; color: #b8860b; }

.report-section { margin-top: 24px; }

/* 种子展示区 */
.seed-badge { display: inline-block; padding: 1px 8px; margin-left: 6px; background: color-mix(in srgb, #9b59b6 15%, transparent); color: #9b59b6; border-radius: var(--radius-full); font-size: 10px; font-weight: 600; font-family: var(--font-mono); vertical-align: middle; }
.seed-section { border-left: 3px solid #9b59b6; padding-left: 16px; }
.path-detail { display: flex; flex-direction: column; gap: 10px; }
.detail-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.detail-label { font-size: 12px; color: var(--color-fg-tertiary); min-width: 64px; }
.salary-text { font-family: var(--font-mono); font-size: 13px; color: var(--color-node-active); font-weight: 600; }
.seed-hint { margin-top: 12px; font-size: 12px; color: var(--color-fg-muted); font-style: italic; }

@media (max-width: 768px) {
  .page-content { padding: 24px 16px 48px; }
  .page-title { font-size: 26px; }
  .form-row { flex-direction: column; gap: 0; }
}
</style>
