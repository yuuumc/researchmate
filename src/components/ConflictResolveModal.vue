<script setup>
// ============================================================
// 画像冲突解决弹窗（v2.5 · UI 层）
// ============================================================
// 30s 冲突窗口：拉远端 + 本地有 diff → 弹起
// 字段级 diff：每字段选 local / remote / suggested
// 30s 超时：自动应用 suggested 合并
// 合并规则：LWW / union / max / starMax（utils/conflictMerge.js）
// 批量操作：全部本地 / 全部远端 / 按建议
// ============================================================
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSyncStore } from '@/stores/sync'
import {
  FIELD_LABELS,
  choicesAll,
  diffFields,
  formatValue
} from '@/utils/conflictMerge'

const syncStore = useSyncStore()

const visible = computed(() => Boolean(syncStore.conflict))
const diffs = computed(() => syncStore.conflict?.diffs || [])

/** 每字段选择：'local' | 'remote' | 'suggested'（默认 suggested） */
const choices = ref({})
let countdownTimer = null
const countdown = ref(30)

function resetChoices() {
  const initial = {}
  for (const d of diffs.value) initial[d.field] = 'suggested'
  choices.value = initial
}

function startCountdown() {
  stopCountdown()
  countdown.value = 30
  countdownTimer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) {
      stopCountdown()
      autoMerge()
    }
  }, 1000)
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

async function autoMerge() {
  // 30s 超时 → 应用 suggested 合并
  if (!syncStore.conflict) return
  await ElMessageBox.confirm(
    '30 秒冲突窗口已到，将按"建议"规则自动合并，是否确认？',
    '冲突超时',
    { confirmButtonText: '应用建议并合并', cancelButtonText: '我再看看', type: 'warning' }
  ).catch(() => null)
  // 关闭弹窗 + 应用建议（即使取消确认也应用，因为 timeout 已到）
  if (syncStore.conflict) {
    const ok = await syncStore.resolveConflict(choices.value)
    if (ok) ElMessage.success('已按建议自动合并')
    else ElMessage.error('自动合并失败')
  }
}

watch(visible, (v) => {
  if (v) {
    resetChoices()
    startCountdown()
  } else {
    stopCountdown()
  }
})

onBeforeUnmount(stopCountdown)

function pickAll(side) {
  choices.value = choicesAll(diffs.value, side)
}
function pickField(field, side) {
  choices.value = { ...choices.value, [field]: side }
}

async function onApply() {
  if (!syncStore.conflict) return
  const ok = await syncStore.resolveConflict(choices.value)
  if (ok) ElMessage.success('已合并并同步')
  else ElMessage.error('合并失败')
}

function onDismiss() {
  ElMessageBox.confirm(
    '放弃合并？本地的修改将保留，但不会同步到远端。',
    '放弃合并',
    { confirmButtonText: '放弃', cancelButtonText: '继续处理', type: 'warning' }
  ).then(() => {
    syncStore.dismissConflict()
  }).catch(() => null)
}

const RULE_LABELS = {
  lww: '最新',
  union: '并集',
  max: '取大',
  starMax: '按主题取大'
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="多设备同步冲突"
    width="640"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    align-center
    destroy-on-close
  >
    <template #header>
      <div class="crm-header">
        <span class="crm-header__title">多设备同步冲突</span>
        <span class="crm-header__countdown" :data-warning="countdown <= 10">
          将在 <strong>{{ countdown }}</strong> 秒后按建议自动合并
        </span>
      </div>
    </template>

    <div class="crm-body">
      <p class="crm-intro">
        检测到 <strong>{{ diffs.length }}</strong> 个字段在本地与远端不一致。
        请选择保留哪一边，或使用下方快捷操作。
      </p>

      <div class="crm-bulk">
        <el-button size="small" @click="pickAll('local')">全部保留本地</el-button>
        <el-button size="small" @click="pickAll('remote')">全部采用远端</el-button>
        <el-button size="small" type="primary" @click="pickAll('suggested')">全部按建议</el-button>
      </div>

      <div class="crm-list">
        <div
          v-for="d in diffs"
          :key="d.field"
          class="crm-row"
          :data-field="d.field"
        >
          <div class="crm-row__head">
            <span class="crm-row__label">{{ d.label }}</span>
            <span class="crm-row__rule" :data-rule="d.rule">{{ RULE_LABELS[d.rule] || d.rule }}</span>
          </div>

          <div class="crm-row__grid">
            <label class="crm-cell" :class="{ 'is-active': choices[d.field] === 'local' }">
              <input
                type="radio"
                :name="`crm-${d.field}`"
                :checked="choices[d.field] === 'local'"
                @change="pickField(d.field, 'local')"
              />
              <div class="crm-cell__inner">
                <div class="crm-cell__tag">本地</div>
                <div class="crm-cell__value">{{ formatValue(d.field, d.local) }}</div>
              </div>
            </label>

            <label class="crm-cell" :class="{ 'is-active': choices[d.field] === 'remote' }">
              <input
                type="radio"
                :name="`crm-${d.field}`"
                :checked="choices[d.field] === 'remote'"
                @change="pickField(d.field, 'remote')"
              />
              <div class="crm-cell__inner">
                <div class="crm-cell__tag crm-cell__tag--remote">远端</div>
                <div class="crm-cell__value">{{ formatValue(d.field, d.remote) }}</div>
              </div>
            </label>

            <label class="crm-cell" :class="{ 'is-active': choices[d.field] === 'suggested' }">
              <input
                type="radio"
                :name="`crm-${d.field}`"
                :checked="choices[d.field] === 'suggested'"
                @change="pickField(d.field, 'suggested')"
              />
              <div class="crm-cell__inner">
                <div class="crm-cell__tag crm-cell__tag--suggested">建议</div>
                <div class="crm-cell__value">{{ formatValue(d.field, d.suggested) }}</div>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="crm-footer">
        <el-button @click="onDismiss">放弃合并</el-button>
        <el-button type="primary" :loading="syncStore.status === 'syncing'" @click="onApply">
          应用所选并同步
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.crm-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}
.crm-header__title {
  font-size: var(--text-subtitle, 16px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-ink-900, #0f1e33);
}
.crm-header__countdown {
  font-size: 12px;
  color: var(--color-ink-500, #3d5a80);
  padding: 2px 8px;
  border-radius: var(--radius-sm, 6px);
  background: var(--color-info-bg, #e6f1fb);
  color: var(--color-info, #4d9de0);
}
.crm-header__countdown[data-warning='true'] {
  background: var(--color-warning-bg, #fff8e1);
  color: var(--color-warning, #b88a00);
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.crm-body { padding: 4px 0; }
.crm-intro {
  font-size: 13px;
  color: var(--color-ink-500, #3d5a80);
  margin: 0 0 12px;
}

.crm-bulk {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.crm-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 480px;
  overflow-y: auto;
  padding-right: 4px;
}

.crm-row {
  border: 1px solid var(--color-ink-100, #e5e9f0);
  border-radius: var(--radius-md, 8px);
  padding: 10px 12px;
  background: var(--color-bg-elevated, #fff);
  transition: border-color var(--duration-fast, 120ms) var(--ease-out, ease);
}
.crm-row:hover { border-color: var(--color-ink-300, #c8d3e0); }

.crm-row__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.crm-row__label {
  font-size: 13px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-ink-900, #0f1e33);
}
.crm-row__rule {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--radius-xs, 4px);
  background: var(--color-bg-sunken, #eaeef5);
  color: var(--color-ink-500, #3d5a80);
}
.crm-row__rule[data-rule='union'] { background: var(--color-info-bg, #e6f1fb); color: var(--color-info, #4d9de0); }
.crm-row__rule[data-rule='max'] { background: var(--color-warning-bg, #fff8e1); color: #b88a00; }
.crm-row__rule[data-rule='starMax'] { background: var(--color-success-bg, #e6f9f4); color: var(--color-success, #00a382); }

.crm-row__grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}

.crm-cell {
  display: block;
  cursor: pointer;
  position: relative;
  border: 1px solid var(--color-ink-100, #e5e9f0);
  border-radius: var(--radius-sm, 6px);
  padding: 8px 10px;
  background: var(--color-bg-base, #f4f6fa);
  transition:
    border-color var(--duration-fast, 120ms) var(--ease-out, ease),
    background-color var(--duration-fast, 120ms) var(--ease-out, ease),
    transform var(--duration-fast, 120ms) var(--ease-out, ease);
}
.crm-cell:hover { border-color: var(--color-ink-300, #c8d3e0); }
.crm-cell:active { transform: scale(0.99); }
.crm-cell.is-active {
  border-color: var(--color-ink-700, #1e3a5f);
  background: var(--color-bg-elevated, #fff);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-ink-700, #1e3a5f) 14%, transparent);
}
.crm-cell input[type='radio'] {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.crm-cell__inner { display: flex; flex-direction: column; gap: 4px; }
.crm-cell__tag {
  font-size: 10px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-ink-500, #3d5a80);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.crm-cell__tag--remote { color: var(--color-info, #4d9de0); }
.crm-cell__tag--suggested { color: var(--color-success, #00a382); }
.crm-cell__value {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-ink-900, #0f1e33);
  word-break: break-word;
  max-height: 80px;
  overflow-y: auto;
}

.crm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 768px) {
  .crm-row__grid { grid-template-columns: 1fr; }
}
</style>
