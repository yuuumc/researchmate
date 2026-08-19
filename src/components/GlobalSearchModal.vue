<script setup>
// ============================================================
// GlobalSearchModal.vue — Ctrl+K 全局搜索（知识点 / 题目入口）
// ============================================================
// 快捷键体系的一部分：
//   - AppLayout 捕获 Ctrl+K / Cmd+K 打开本组件
//   - 搜索范围：客户端知识点索引（知识图谱节点，多学科）
//   - 同时提供「题目练习 / 知识图谱 / 拍题讲解 / 模考 / 费曼复述」快速入口
//   - Esc 关闭、Enter 进入首个结果、↑↓ 移动选中、鼠标点击直接跳转
//
// 设计取舍（0.5 人日纯前端）：
//   - 知识点来自 public/knowledge/textbook/*-图谱.json，纯客户端 fuzzy，无需后端
//   - 题目（questions 表）在 Supabase，异步 + 需鉴权，此处不内联全量检索，
//     而是作为「入口」快速跳到 /practice，避免 0.5 人日内引入 DB 耦合
// ============================================================
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false }
})
const emit = defineEmits(['update:open', 'navigate'])

const inputRef = ref(null)
const query = ref('')
const activeIndex = ref(0)

// ---- 知识点索引（懒加载）----
const knowledgeIndex = ref([])      // [{ id, name, chapter, description, keywords, subject, subjectFile }]
const indexLoading = ref(false)
let indexLoaded = false

const SUBJECT_FILES = [
  { subject: '半导体物理', file: '/knowledge/textbook/半导体物理-图谱.json' },
  { subject: '数据结构',   file: '/knowledge/textbook/数据结构-图谱.json' }
]

async function loadKnowledgeIndex() {
  if (indexLoaded) return
  indexLoaded = true
  indexLoading.value = true
  const results = await Promise.allSettled(
    SUBJECT_FILES.map(async ({ subject, file }) => {
      const resp = await fetch(file)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      const nodes = Array.isArray(data?.nodes) ? data.nodes : []
      return nodes.map((n) => ({
        id: n.id,
        name: n.name || n.id,
        chapter: n.chapter || '',
        description: n.description || '',
        keywords: Array.isArray(n.keywords) ? n.keywords : [],
        subject,
        subjectFile: file
      }))
    })
  )
  const flat = []
  for (const r of results) {
    if (r.status === 'fulfilled') flat.push(...r.value)
  }
  knowledgeIndex.value = flat
  indexLoading.value = false
}

// ---- 快速导航入口 ----
const QUICK_NAV = [
  { type: 'nav', label: '题目练习', hint: '练习题 / 做题', to: '/practice', icon: '✎' },
  { type: 'nav', label: '知识图谱', hint: '可视化知识点网络', to: '/knowledge-graph', icon: '◈' },
  { type: 'nav', label: 'AI 导师对话', hint: '向 AI 提问', to: '/chat', icon: '✦' },
  { type: 'nav', label: '拍题讲解', hint: '拍照识别解题', to: '/tutor-photo', icon: '📷' },
  { type: 'nav', label: '模拟考试', hint: '模考训练', to: '/exam', icon: '📝' },
  { type: 'nav', label: '费曼复述', hint: '讲给 AI 听', to: '/feynman', icon: '⚗' },
  { type: 'nav', label: '复习计划', hint: '学习规划', to: '/plan', icon: '📅' }
]

// ---- 过滤结果 ----
const qp = computed(() => query.value.trim().toLowerCase())

const knowledgeResults = computed(() => {
  if (!qp.value) return []
  const q = qp.value
  const out = []
  for (const n of knowledgeIndex.value) {
    const name = n.name.toLowerCase()
    let score = 0
    if (name === q) score = 100
    else if (name.startsWith(q)) score = 80
    else if (name.includes(q)) score = 60
    else if (n.keywords.some((k) => k.toLowerCase().includes(q))) score = 40
    else if (n.description.toLowerCase().includes(q)) score = 20
    if (score > 0) out.push({ ...n, type: 'kp', score })
  }
  out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return out.slice(0, 8)
})

// 合并展示列表（空 query 时只显示快速入口；有 query 时知识点优先，快速入口次之）
const items = computed(() => {
  const nav = QUICK_NAV.filter((n) =>
    !qp.value ? true : (n.label + n.hint).toLowerCase().includes(qp.value)
  )
  const kps = knowledgeResults.value
  const list = []
  for (const k of kps) list.push({ kind: 'kp', ...k })
  for (const n of nav) list.push({ kind: 'nav', ...n })
  return list.slice(0, 12)
})

watch(items, () => { activeIndex.value = 0 })

// ---- 打开时聚焦输入 + 懒加载索引 ----
watch(
  () => props.open,
  async (v) => {
    if (v) {
      query.value = ''
      activeIndex.value = 0
      await nextTick()
      inputRef.value?.focus()
      loadKnowledgeIndex()
    }
  }
)

function close() {
  emit('update:open', false)
}

function go(item) {
  if (!item) return
  if (item.kind === 'nav') {
    emit('navigate', item.to)
  } else {
    // 知识点：跳知识图谱，带 focus query 供 KnowledgeGraphView 深链聚焦
    emit('navigate', { path: '/knowledge-graph', query: { focus: item.id, q: item.name } })
  }
  close()
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, items.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const it = items.value[activeIndex.value]
    if (it) go(it)
  }
}

// 组件卸载时确保不残留监听（事件挂在模板元素上，随卸载移除）
onBeforeUnmount(() => {
  /* 模板内 @keydown 已随元素卸载 */
})
</script>

<template>
  <Teleport to="body">
    <Transition name="gsm-fade">
      <div v-if="open" class="gsm-overlay" @mousedown.self="close">
        <div
          class="gsm-panel"
          role="dialog"
          aria-modal="true"
          aria-label="全局搜索"
        >
          <!-- 输入区 -->
          <div class="gsm-input-wrap">
            <svg class="gsm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              class="gsm-input"
              placeholder="搜索知识点 / 题目入口…（Esc 关闭）"
              autocomplete="off"
              spellcheck="false"
              @keydown="onKeydown"
            />
            <kbd class="gsm-kbd">Esc</kbd>
          </div>

          <!-- 结果区 -->
          <div class="gsm-results">
            <div v-if="indexLoading && !knowledgeIndex.length" class="gsm-hint">
              正在加载知识点索引…
            </div>

            <template v-if="items.length">
              <ul class="gsm-list">
                <li
                  v-for="(it, i) in items"
                  :key="(it.kind === 'kp' ? 'kp:' : 'nav:') + (it.id || it.to)"
                  class="gsm-item"
                  :class="{ 'gsm-item--active': i === activeIndex }"
                  @mouseenter="activeIndex = i"
                  @click="go(it)"
                >
                  <span class="gsm-item-icon">
                    <template v-if="it.kind === 'nav'">{{ it.icon }}</template>
                    <template v-else>◈</template>
                  </span>
                  <span class="gsm-item-main">
                    <span class="gsm-item-label">{{ it.label || it.name }}</span>
                    <span class="gsm-item-hint">
                      <template v-if="it.kind === 'kp'">
                        {{ it.subject }} · {{ it.chapter || '知识点' }}<template v-if="it.description"> · {{ it.description }}</template>
                      </template>
                      <template v-else>{{ it.hint }}</template>
                    </span>
                  </span>
                  <span v-if="it.kind === 'kp'" class="gsm-tag">知识点</span>
                  <span v-else class="gsm-tag gsm-tag--nav">入口</span>
                </li>
              </ul>
            </template>

            <div v-else-if="qp && !indexLoading" class="gsm-hint">
              没有匹配的知识点，可使用上方「题目练习」入口做题
            </div>

            <div v-else-if="!qp && !indexLoading" class="gsm-hint gsm-hint--static">
              输入关键词搜索知识点，或直接选择下方入口
            </div>
          </div>

          <!-- 底栏提示 -->
          <div class="gsm-footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
            <span><kbd>Enter</kbd> 跳转</span>
            <span><kbd>Esc</kbd> 关闭</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.gsm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1800;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  background: rgba(8, 10, 16, 0.55);
  backdrop-filter: blur(3px);
}

.gsm-panel {
  width: min(640px, 92vw);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated, #1b1f2a);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-lg, 14px);
  box-shadow: var(--shadow-elevated, 0 24px 60px rgba(0, 0, 0, 0.45));
  overflow: hidden;
}

.gsm-input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
}

.gsm-icon {
  width: 20px;
  height: 20px;
  color: var(--text-secondary, #9ca3af);
  flex-shrink: 0;
}

.gsm-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary, #f3f4f6);
  font-size: 16px;
  line-height: 1.5;
}

.gsm-input::placeholder {
  color: var(--text-secondary, #6b7280);
}

.gsm-kbd {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--bg-surface, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  color: var(--text-secondary, #9ca3af);
  flex-shrink: 0;
}

.gsm-results {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.gsm-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.gsm-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md, 10px);
  cursor: pointer;
  transition: background 0.12s ease;
}

.gsm-item--active {
  background: var(--primary-dim, rgba(99, 179, 191, 0.14));
}

.gsm-item-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: var(--primary, #63b3bf);
  flex-shrink: 0;
}

.gsm-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gsm-item-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #f3f4f6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gsm-item-hint {
  font-size: 12px;
  color: var(--text-secondary, #9ca3af);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gsm-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--primary-dim, rgba(99, 179, 191, 0.16));
  color: var(--primary, #8ad3dd);
  flex-shrink: 0;
}

.gsm-tag--nav {
  background: var(--bg-surface, rgba(255, 255, 255, 0.06));
  color: var(--text-secondary, #9ca3af);
}

.gsm-hint {
  padding: 18px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary, #9ca3af);
}

.gsm-hint--static {
  text-align: left;
}

.gsm-footer {
  display: flex;
  gap: 18px;
  padding: 10px 16px;
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
  font-size: 12px;
  color: var(--text-secondary, #9ca3af);
}

.gsm-footer kbd {
  margin-right: 4px;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--bg-surface, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  font-family: inherit;
  font-size: 11px;
}

/* 过渡 */
.gsm-fade-enter-active,
.gsm-fade-leave-active {
  transition: opacity 0.16s ease;
}
.gsm-fade-enter-active .gsm-panel,
.gsm-fade-leave-active .gsm-panel {
  transition: transform 0.16s ease, opacity 0.16s ease;
}
.gsm-fade-enter-from,
.gsm-fade-leave-to {
  opacity: 0;
}
.gsm-fade-enter-from .gsm-panel,
.gsm-fade-leave-to .gsm-panel {
  transform: translateY(-8px);
  opacity: 0;
}
</style>
