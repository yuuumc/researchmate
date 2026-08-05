<script setup>
// ============================================================
// 多设备同步状态条（v2.5 · UI 层）
// ============================================================
// 5 态：idle / syncing / success / conflict / offline / error
// 颜色：--sync-{idle,syncing,success,conflict,offline} Design Token v2
// 数据源：stores/sync.js
// 触发：syncNow（手动同步按钮）
// 交互：点击 "有冲突" → 唤起 ConflictResolveModal（通过 store 状态）
// ============================================================
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'

const router = useRouter()
const auth = useAuthStore()
const syncStore = useSyncStore()

const visible = computed(() => syncStore.configured && auth.isAuthenticated && (isConflict.value || isOffline.value || status.value === 'error'))
const status = computed(() => syncStore.status)
const label = computed(() => syncStore.statusLabel)
const lastText = computed(() => syncStore.lastSyncText)
const isConflict = computed(() => status.value === 'conflict')
const isSyncing = computed(() => status.value === 'syncing')
const isOffline = computed(() => status.value === 'offline')

/** 手动同步 */
async function onSyncClick() {
  if (isSyncing.value) return
  if (isConflict.value) {
    // 跳到首页让 ConflictResolveModal 接管（或在 store 上由组件响应）
    ElMessage.info('请在冲突弹窗中处理')
    return
  }
  const ok = await syncStore.syncNow()
  if (ok) {
    ElMessage.success('同步完成')
  } else if (syncStore.lastError) {
    ElMessage.error(`同步失败：${syncStore.lastError.message || '未知错误'}`)
  }
}

function onConflictClick() {
  // ConflictResolveModal 由 store.conflict 监听渲染，无需路由跳转；
  // 这里给一个回退：若 modal 关闭了但 conflict 仍存在，可手动重新打开（占位）
  if (!syncStore.conflict) return
  // ConflictResolveModal 自身 watch syncStore.conflict 自动弹起；
  // 此处保留一个 console hint 便于排查。
  console.info('[SyncStatusBar] conflict pending, modal will open via store watcher')
}

let onlineHandler, offlineHandler
onMounted(() => {
  if (typeof window !== 'undefined') {
    onlineHandler = () => syncStore.setOnline(true)
    offlineHandler = () => syncStore.setOnline(false)
    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', offlineHandler)
    syncStore.setOnline(window.navigator.onLine)
  }
})
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    if (onlineHandler) window.removeEventListener('online', onlineHandler)
    if (offlineHandler) window.removeEventListener('offline', offlineHandler)
  }
})
</script>

<template>
  <transition name="sync-bar-fade">
    <div
      v-if="visible"
      class="sync-bar"
      :data-status="status"
      role="status"
      aria-live="polite"
    >
      <div class="sync-bar__left">
        <span class="sync-bar__dot" :data-status="status" />
        <span class="sync-bar__label">{{ label }}</span>
        <span class="sync-bar__sep">·</span>
        <span class="sync-bar__last">{{ lastText }}</span>
        <span v-if="isOffline" class="sync-bar__hint">网络已断开，恢复后自动同步</span>
      </div>

      <div class="sync-bar__right">
        <button
          v-if="isConflict"
          class="sync-bar__btn sync-bar__btn--conflict"
          type="button"
          @click="onConflictClick"
        >
          去解决冲突
        </button>
        <button
          class="sync-bar__btn"
          :class="{ 'is-loading': isSyncing }"
          :disabled="isSyncing || isOffline || isConflict"
          type="button"
          @click="onSyncClick"
        >
          <span v-if="isSyncing" class="sync-bar__spinner" aria-hidden="true" />
          <span>{{ isSyncing ? '同步中' : '立即同步' }}</span>
        </button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.sync-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-sticky, 60);
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 var(--space-4, 16px);
  background: var(--color-bg-elevated, #fff);
  border-top: 1px solid var(--color-ink-100, #e5e9f0);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(15, 30, 51, 0.04));
  font-size: var(--text-caption, 12px);
  color: var(--color-ink-700, #1e3a5f);
  transition: background-color var(--duration-base, 200ms) var(--ease-out, ease);
}

.sync-bar__left {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  min-width: 0;
  flex: 1;
}

.sync-bar__right {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-shrink: 0;
}

.sync-bar__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full, 999px);
  flex-shrink: 0;
  background: var(--sync-idle, #7a8ba3);
  transition: background-color var(--duration-base, 200ms) var(--ease-out, ease);
}

.sync-bar__dot[data-status='syncing'] { background: var(--sync-syncing, #4d9de0); }
.sync-bar__dot[data-status='success'] { background: var(--sync-success, #00d4aa); }
.sync-bar__dot[data-status='conflict'] { background: var(--sync-conflict, #ff6b6b); }
.sync-bar__dot[data-status='offline'] { background: var(--sync-offline, #7a8ba3); }
.sync-bar__dot[data-status='error'] { background: var(--sync-conflict, #ff6b6b); }

.sync-bar[data-status='conflict'] {
  background: color-mix(in srgb, var(--sync-conflict, #ff6b6b) 8%, var(--color-bg-elevated, #fff));
}
.sync-bar[data-status='success'] {
  background: color-mix(in srgb, var(--sync-success, #00d4aa) 6%, var(--color-bg-elevated, #fff));
}
.sync-bar[data-status='syncing'] {
  background: color-mix(in srgb, var(--sync-syncing, #4d9de0) 6%, var(--color-bg-elevated, #fff));
}
.sync-bar[data-status='offline'] {
  background: var(--color-bg-sunken, #eaeef5);
}
.sync-bar[data-status='error'] {
  background: color-mix(in srgb, var(--sync-conflict, #ff6b6b) 8%, var(--color-bg-elevated, #fff));
}

.sync-bar__label {
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-ink-900, #0f1e33);
}

.sync-bar__sep { color: var(--color-ink-300, #c8d3e0); }
.sync-bar__last { color: var(--color-ink-500, #3d5a80); }
.sync-bar__hint { color: var(--color-ink-500, #3d5a80); font-size: 11px; }

.sync-bar__btn {
  appearance: none;
  border: 1px solid var(--color-ink-100, #e5e9f0);
  background: var(--color-bg-elevated, #fff);
  color: var(--color-ink-700, #1e3a5f);
  height: 24px;
  padding: 0 var(--space-3, 12px);
  border-radius: var(--radius-sm, 6px);
  font-size: 12px;
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition:
    background-color var(--duration-fast, 120ms) var(--ease-out, ease),
    border-color var(--duration-fast, 120ms) var(--ease-out, ease),
    transform var(--duration-fast, 120ms) var(--ease-out, ease),
    opacity var(--duration-fast, 120ms) var(--ease-out, ease);
}

.sync-bar__btn:hover:not(:disabled) {
  border-color: var(--color-ink-300, #c8d3e0);
  background: var(--color-bg-sunken, #eaeef5);
}
.sync-bar__btn:active:not(:disabled) { transform: scale(0.97); }
.sync-bar__btn:focus-visible {
  outline: 2px solid var(--color-info, #4d9de0);
  outline-offset: 1px;
}
.sync-bar__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.sync-bar__btn.is-loading {
  pointer-events: none;
  opacity: 0.7;
}

.sync-bar__btn--conflict {
  border-color: var(--sync-conflict, #ff6b6b);
  color: var(--sync-conflict, #ff6b6b);
  background: var(--color-error-bg, #ffeaea);
}
.sync-bar__btn--conflict:hover:not(:disabled) {
  background: color-mix(in srgb, var(--sync-conflict, #ff6b6b) 14%, var(--color-bg-elevated, #fff));
}

.sync-bar__spinner {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid var(--color-ink-100, #e5e9f0);
  border-top-color: var(--sync-syncing, #4d9de0);
  animation: spin 0.7s linear infinite;
  display: inline-block;
}

@keyframes spin { to { transform: rotate(360deg); } }

.sync-bar-fade-enter-active,
.sync-bar-fade-leave-active {
  transition: opacity var(--duration-base, 200ms) var(--ease-out, ease),
              transform var(--duration-base, 200ms) var(--ease-out, ease);
}
.sync-bar-fade-enter-from,
.sync-bar-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 768px) {
  .sync-bar { padding: 0 var(--space-3, 12px); }
  .sync-bar__hint { display: none; }
}
</style>
