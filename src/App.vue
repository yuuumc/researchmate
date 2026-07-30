<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import TopBar from '@/components/TopBar.vue'
import SyncStatusBar from '@/components/SyncStatusBar.vue'
import ConflictResolveModal from '@/components/ConflictResolveModal.vue'

const route = useRoute()
const activeAgent = computed(() => route.meta.agent || 'tutor')
const hideTopBar = computed(() => Boolean(route.meta.hideTopBar))
</script>

<template>
  <el-config-provider :locale="zhCn">
    <div class="app-shell">
      <TopBar v-if="!hideTopBar" :active-agent="activeAgent" />
      <main class="app-main" :class="{ 'app-main--no-topbar': hideTopBar }">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
      <SyncStatusBar />
      <ConflictResolveModal />
    </div>
  </el-config-provider>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-base);
}

.app-main {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  /* SyncStatusBar 高度 36px，main 留出空间 */
  padding-bottom: 36px;
}
.app-main--no-topbar {
  /* 登录页全屏，不让 36px 状态条压底 */
  padding-bottom: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--duration-base) var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
