<script setup>
import { onMounted } from 'vue'
import { useDiagnosisStore } from '@/stores/diagnosis'
import ChatWindow from '@/components/ChatWindow.vue'

const diagnosisStore = useDiagnosisStore()
// P0-2: 进入对话前从 DB 回填向量记忆，保证后续轮次记忆召回命中（库内不再为 0）
onMounted(async () => {
  try { await diagnosisStore.loadFromDB() } catch (e) { /* silent */ }
})
</script>

<template>
  <div class="chat-view">
    <ChatWindow />
  </div>
</template>

<style scoped>
.chat-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>
