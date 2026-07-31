<template>
  <div class="agent-icon" :style="{ '--agent-color': agentColor }">
    <svg viewBox="0 0 24 24" :width="iconSize" :height="iconSize"
         fill="none" stroke="currentColor" :stroke-width="strokeWidth"
         stroke-linecap="round" stroke-linejoin="round">
      <!-- 概念引导 / 导师：灯泡 -->
      <template v-if="type === 'tutor'">
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.7c.5.4.8 1 .8 1.6v.7h6.4v-.7c0-.6.3-1.2.8-1.6A7 7 0 0 0 12 2z" />
      </template>
      <!-- 学习诊断：靶心 -->
      <template v-else-if="type === 'diagnose'">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </template>
      <!-- 成长规划：日历 -->
      <template v-else-if="type === 'planner'">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </template>
      <!-- 考研导航 / 择校：指南针 -->
      <template v-else-if="type === 'admission'">
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      </template>
      <!-- 科研成长：烧瓶 -->
      <template v-else-if="type === 'research'">
        <path d="M9 3h6" />
        <path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />
        <line x1="7" y1="14" x2="17" y2="14" />
      </template>
      <!-- 练习：书本 -->
      <template v-else-if="type === 'practice'">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </template>
      <!-- 同伴匹配：用户组 -->
      <template v-else-if="type === 'peer'">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </template>
      <!-- 就业：路线图 -->
      <template v-else-if="type === 'career'">
        <circle cx="6" cy="19" r="3" />
        <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
        <circle cx="18" cy="5" r="3" />
      </template>
      <!-- fallback：圆点 -->
      <template v-else>
        <circle cx="12" cy="12" r="4" fill="currentColor" />
      </template>
    </svg>
  </div>
</template>

<script setup>
const props = defineProps({
  type: { type: String, default: 'tutor' },
  iconSize: { type: Number, default: 24 },
  strokeWidth: { type: Number, default: 1.5 },
  agentColor: { type: String, default: '#00d4aa' }
})
</script>

<style scoped>
.agent-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--agent-color) 12%, transparent);
  color: var(--agent-color);
  transition: transform 0.2s ease, background 0.2s ease;
}
.agent-icon:hover {
  background: color-mix(in srgb, var(--agent-color) 20%, transparent);
  transform: scale(1.08);
}
</style>
