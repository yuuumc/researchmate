<script setup>
import { computed } from 'vue'
import { useWrongBookStore } from '@/stores/wrongBook'
import { useRouter } from 'vue-router'

const wbStore = useWrongBookStore()
const router = useRouter()

const items = computed(() => wbStore.recent)
const activeCount = computed(() => wbStore.unresolvedCount)

const sourceLabel = {
  weak_point: '薄弱点',
  root_cause: '根因'
}

function formatTime(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86400000)
  if (days < 1) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 周前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

function starLabel(n) {
  return n == null ? '未评分' : '★'.repeat(Math.max(0, n)) + '☆'.repeat(Math.max(0, 5 - n))
}

function handleResolve(item) {
  wbStore.resolve(item.id)
}

function handleRemove(item) {
  wbStore.remove(item.id)
}

function practiceInChat(topic) {
  router.push({ path: '/chat', query: { q: `帮我补强「${topic}」` } })
}
function practiceVariant(topic) {
  router.push('/variant/' + encodeURIComponent(topic))
}
</script>

<template>
  <div class="wrong-book">
    <div v-if="items.length === 0" class="wb-empty">
      <span class="wb-empty-icon">◯</span>
      <div class="wb-empty-title">错题本是空的</div>
      <div class="wb-empty-desc">
        去做一次诊断，能力星 ≤ 2 的薄弱点会自动收进错题本
      </div>
    </div>

    <ul v-else class="wb-list">
      <li
        v-for="item in items"
        :key="item.id"
        class="wb-item"
        :class="{ resolved: item.resolved }"
      >
        <div class="wb-item-top">
          <span class="wb-topic">{{ item.topic }}</span>
          <span class="wb-source">{{ sourceLabel[item.source] || item.source }}</span>
        </div>
        <div class="wb-item-meta">
          <span class="wb-stars" :title="`能力星 ${item.ability_stars} / 5`">
            {{ starLabel(item.ability_stars) }}
          </span>
          <span class="wb-occ" v-if="item.occurrences > 1">错 {{ item.occurrences }} 次</span>
          <span class="wb-time">最近 {{ formatTime(item.last_seen) }}</span>
        </div>
        <div class="wb-item-actions">
          <button
            v-if="!item.resolved"
            class="wb-btn primary"
            @click="practiceInChat(item.topic)"
          >
            去补强
          </button>
          <button
            v-if="!item.resolved"
            class="wb-btn"
            @click="practiceVariant(item.topic)"
          >
            变式练习
          </button>
          <button
            v-if="!item.resolved"
            class="wb-btn"
            @click="handleResolve(item)"
          >
            标记掌握
          </button>
          <span v-else class="wb-resolved-tag">已掌握 · {{ formatTime(item.resolved_at) }}</span>
          <button class="wb-btn ghost" @click="handleRemove(item)" title="删除">✕</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.wrong-book {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 24px 12px;
  color: var(--color-fg-tertiary);
}

.wb-empty-icon {
  font-size: 26px;
  opacity: 0.5;
}

.wb-empty-title {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-700);
}

.wb-empty-desc {
  font-size: 12px;
  color: var(--color-fg-muted);
  text-align: center;
  max-width: 280px;
  line-height: 1.5;
}

.wb-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wb-item {
  padding: 10px 12px;
  background: var(--color-bg-sunken);
  border: 1px solid var(--color-border-subtle);
  border-left: 3px solid var(--color-error);
  border-radius: var(--radius-md);
  transition: all 0.2s;
}

.wb-item.resolved {
  border-left-color: var(--color-success);
  opacity: 0.65;
  background: transparent;
}

.wb-item-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}

.wb-topic {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink-900);
  line-height: 1.4;
}

.wb-source {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 1px 6px;
  background: var(--color-bg-elevated);
  border-radius: var(--radius-xs);
  color: var(--color-fg-secondary);
  flex-shrink: 0;
}

.wb-item-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--color-fg-tertiary);
  margin-bottom: 8px;
}

.wb-stars {
  font-family: var(--font-mono);
  color: var(--color-warning);
  letter-spacing: 1px;
}

.wb-occ {
  padding: 0 6px;
  background: var(--color-error-bg);
  color: var(--color-error);
  border-radius: var(--radius-xs);
  font-family: var(--font-mono);
  font-size: 10px;
}

.wb-time {
  margin-left: auto;
  font-family: var(--font-mono);
}

.wb-item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.wb-btn {
  padding: 4px 10px;
  background: var(--color-bg-elevated);
  color: var(--color-ink-700);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.wb-btn:hover {
  border-color: var(--color-ink-500);
  color: var(--color-ink-900);
}

.wb-btn.primary {
  background: var(--color-error);
  color: white;
  border-color: var(--color-error);
}

.wb-btn.primary:hover {
  background: var(--color-ink-900);
  border-color: var(--color-ink-900);
}

.wb-btn.ghost {
  margin-left: auto;
  padding: 4px 8px;
  background: transparent;
  border-color: transparent;
  color: var(--color-fg-muted);
}

.wb-btn.ghost:hover {
  color: var(--color-error);
  background: var(--color-error-bg);
}

.wb-resolved-tag {
  font-size: 11px;
  color: var(--color-success);
  font-family: var(--font-mono);
}

@media (max-width: 480px) {
  .wb-item { padding: 8px 10px; }
  .wb-topic { font-size: 13px; }
  .wb-item-meta { flex-wrap: wrap; gap: 6px; }
  .wb-time { width: 100%; margin-left: 0; }
  .wb-item-actions { flex-wrap: wrap; }
}
</style>
