<script setup>
import { ref, computed } from 'vue'
import { usePeerStore } from '@/stores/peer'
import { useProfileStore } from '@/stores/profile'
import { useTagInput } from '@/composables/useTagInput'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { stripStructuredJson } from '@/utils/stripStructuredJson'
import { SEED_PEER_MATCHES } from '@/data/seedDemo'
import AiGeneratedBadge from '@/components/AiGeneratedBadge.vue'

const peerStore = usePeerStore()
const profileStore = useProfileStore()

const form = ref({
  student_name: profileStore.profile?.name || profileStore.profile?.user_id || '',
  target_school: profileStore.profile?.target_school || '',
  target_major: profileStore.profile?.target_major || profileStore.profile?.major || '集成电路工程',
  // P1-3: 从画像注入已掌握 / 薄弱知识点，不再初始化为空
  mastered_skills: [...(profileStore.profile?.mastered_topics || [])],
  weak_points: [...(profileStore.profile?.weak_topics || [])]
})

const { input: skillInput, add: addSkill, remove: removeSkill } = useTagInput(form, 'mastered_skills')
const { input: weakInput, add: addWeak, remove: removeWeak } = useTagInput(form, 'weak_points')

async function submit() {
  if (!form.value.student_name) return
  await peerStore.runPeer({ ...form.value })
  // P1-3: 推荐结果中若含技能缺口字段，回写画像薄弱点
  const matches = peerStore.result?.structured?.matches || []
  const gaps = new Set()
  matches.forEach((m) => {
    ;(m.gap_skills || m.skill_gaps || []).forEach((g) => gaps.add(g))
  })
  gaps.forEach((g) => profileStore.addWeakTopic(g))
}

const matches = computed(() => peerStore.matches)
const result = computed(() => peerStore.result)
const loading = computed(() => peerStore.loading)
const error = computed(() => peerStore.error)

// 空态红线：无 Agent 结果时展示种子同伴
const showSeed = computed(() => !peerStore.hasResult)
const seedMatches = SEED_PEER_MATCHES
</script>

<template>
  <div class="peer-view">
    <div class="page-content">
      <div class="page-header">
        <div class="page-eyebrow"><span class="dot"></span><span>Peer Agent</span></div>
        <h1 class="page-title">同伴匹配</h1>
        <p class="page-subtitle">技能互补分析 · Top 3 匹配 · 互助小组构建</p>
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
            <input v-model="form.target_school" type="text" placeholder="如：中国科学技术大学" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>目标专业</label>
            <input v-model="form.target_major" type="text" placeholder="如：集成电路工程" />
          </div>
        </div>

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

        <button class="submit-btn" :disabled="loading || !form.student_name" @click="submit">
          {{ loading ? '匹配中…' : '开始匹配' }}
        </button>
        <div v-if="error" class="error-msg">{{ error }}</div>
      </section>

      <!-- 种子同伴匹配（空态红线 · 评委首次进入即见内容） -->
      <section v-if="showSeed" class="result-section seed-section">
        <div class="section-header">
          <h2 class="section-title">匹配结果 <span class="seed-badge">Demo</span></h2>
          <span class="section-en">Top {{ seedMatches.length }}</span>
        </div>
        <div class="match-cards">
          <div v-for="(m, i) in seedMatches" :key="i" class="match-card">
            <div class="match-header">
              <span class="match-rank">#{{ i + 1 }}</span>
              <span class="match-name">{{ m.name }}</span>
              <span class="match-score">匹配度 {{ m.match_score }}%</span>
            </div>
            <div class="match-meta">
              <span class="meta-school">{{ m.school }}</span>
              <span class="meta-major">{{ m.major }}</span>
            </div>
            <div class="match-complement">
              <span class="comp-label">互补能力：</span>
              <span class="comp-chip">{{ m.complement }}</span>
            </div>
            <div class="match-common">
              <span class="common-label">共同点：</span>
              <span v-for="c in m.common" :key="c" class="common-chip">{{ c }}</span>
            </div>
          </div>
        </div>
        <p class="seed-hint">以上为示例匹配，填写信息生成个性化同伴推荐</p>
      </section>
      <section v-if="matches.length" class="result-section">
        <div class="section-header">
          <h2 class="section-title">匹配结果</h2>
          <span class="section-en">Top {{ matches.length }}</span>
          <AiGeneratedBadge />
        </div>
        <div class="match-cards">
          <div v-for="(m, i) in matches" :key="i" class="match-card">
            <div class="match-header">
              <span class="match-rank">#{{ i + 1 }}</span>
              <span class="match-name">{{ m.name || m.peer_name || `同伴 ${i+1}` }}</span>
              <span v-if="m.match_score" class="match-score">
                匹配度 {{ (m.match_score * 100).toFixed(0) }}%
              </span>
            </div>

            <!-- 匹配维度 -->
            <div v-if="m.dimensions?.length" class="match-dimensions">
              <div v-for="d in m.dimensions" :key="d.name" class="dim-item">
                <div class="dim-header">
                  <span class="dim-name">{{ d.name }}</span>
                  <span class="dim-score">{{ (d.score * 100).toFixed(0) }}%</span>
                </div>
                <div class="dim-bar">
                  <div class="dim-fill" :style="{ width: `${d.score * 100}%` }"></div>
                </div>
              </div>
            </div>

            <!-- 互补分析 -->
            <div v-if="m.complementary_skills?.length" class="match-complement">
              <span class="comp-label">互补技能：</span>
              <span v-for="s in m.complementary_skills" :key="s" class="comp-chip">{{ s }}</span>
            </div>
            <div v-if="m.analysis" class="match-analysis">{{ m.analysis }}</div>
          </div>
        </div>
      </section>

      <!-- Markdown fallback -->
      <section v-if="result?.content && !matches.length" class="report-section">
        <MarkdownRenderer :content="stripStructuredJson(result.content, { hasStructured: !!result.structured })" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.peer-view { min-height: calc(100vh - 72px); }
.page-content { max-width: 880px; margin: 0 auto; padding: 40px 32px 64px; }

.page-header { margin-bottom: 32px; }
.page-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 4px 12px; background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle); border-radius: var(--radius-full);
  font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-500); margin-bottom: 12px;
}
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-node-active); }
.page-title { font-family: var(--font-serif); font-size: 32px; font-weight: 700; color: var(--color-ink-900); margin: 0 0 8px; }
.page-subtitle { font-size: 13px; color: var(--color-fg-secondary); margin: 0; }

.form-section {
  background: var(--color-bg-elevated); border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg); padding: 24px; margin-bottom: 24px; box-shadow: var(--shadow-sm);
}
.form-row { display: flex; gap: 16px; margin-bottom: 16px; }
.form-group { flex: 1; margin-bottom: 16px; }
.form-group label { display: block; font-size: 12px; font-weight: 600; color: var(--color-ink-700); margin-bottom: 6px; }
.form-group input {
  width: 100%; padding: 10px 12px; background: var(--color-bg-base);
  border: 1px solid var(--color-border-default); border-radius: var(--radius-sm);
  font-size: 14px; color: var(--color-ink-900);
}
.form-group input:focus { outline: none; border-color: var(--color-node-active); }

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

.match-cards { display: flex; flex-direction: column; gap: 16px; }
.match-card { background: var(--color-bg-elevated); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-lg); padding: 20px; }
.match-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.match-rank { font-family: var(--font-mono); font-size: 16px; font-weight: 700; color: var(--color-node-active); }
.match-name { font-family: var(--font-serif); font-size: 16px; font-weight: 600; color: var(--color-ink-900); flex: 1; }
.match-score { font-family: var(--font-mono); font-size: 13px; color: var(--color-node-active); font-weight: 600; }

.match-dimensions { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.dim-item { }
.dim-header { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
.dim-name { color: var(--color-fg-secondary); }
.dim-score { font-family: var(--font-mono); color: var(--color-ink-700); font-weight: 600; }
.dim-bar { height: 4px; background: var(--color-bg-sunken); border-radius: var(--radius-full); overflow: hidden; }
.dim-fill { height: 100%; background: linear-gradient(90deg, var(--color-node-weak), var(--color-node-active)); border-radius: var(--radius-full); transition: width var(--duration-slow) var(--ease-out); }

.match-complement { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 10px; }
.comp-label { font-size: 11px; color: var(--color-fg-tertiary); }
.comp-chip { padding: 2px 8px; background: var(--color-success-bg); border-radius: var(--radius-xs); font-size: 11px; color: var(--color-success); }
.match-analysis { font-size: 13px; color: var(--color-ink-700); line-height: 1.7; padding: 10px; background: var(--color-bg-sunken); border-radius: var(--radius-sm); }

.report-section { margin-top: 24px; }

/* 种子展示区 */
.seed-badge { display: inline-block; padding: 1px 8px; margin-left: 6px; background: color-mix(in srgb, #3498db 15%, transparent); color: #3498db; border-radius: var(--radius-full); font-size: 10px; font-weight: 600; font-family: var(--font-mono); vertical-align: middle; }
.seed-section { border-left: 3px solid #3498db; padding-left: 16px; }
.match-meta { display: flex; gap: 12px; margin: 8px 0; font-size: 13px; }
.meta-school { font-family: var(--font-serif); font-weight: 600; color: var(--color-ink-900); }
.meta-major { color: var(--color-fg-secondary); }
.match-complement { margin: 8px 0; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.match-common { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.common-label, .comp-label { font-size: 12px; color: var(--color-fg-tertiary); }
.common-chip { padding: 2px 8px; background: color-mix(in srgb, #3498db 12%, transparent); border-radius: var(--radius-xs); font-size: 11px; color: #2980b9; }
.seed-hint { margin-top: 12px; font-size: 12px; color: var(--color-fg-muted); font-style: italic; }

@media (max-width: 768px) {
  .page-content { padding: 24px 16px 48px; }
  .page-title { font-size: 26px; }
  .form-row { flex-direction: column; gap: 0; }
}
</style>
