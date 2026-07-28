<script setup>
import ChatWindow from '@/components/ChatWindow.vue'
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
