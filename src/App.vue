<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import TopBar from '@/components/TopBar.vue'
import SyncStatusBar from '@/components/SyncStatusBar.vue'
import ConflictResolveModal from '@/components/ConflictResolveModal.vue'
import AgentBootSequence from '@/components/AgentBootSequence.vue'
import { bootShown, markBootShown } from '@/utils/bootOnce'

const route = useRoute()
const router = useRouter()
const activeAgent = computed(() => route.meta.agent || 'tutor')
const hideTopBar = computed(() => Boolean(route.meta.hideTopBar))

// V2.6: 全局 Boot 序列（专属页统一开场）+ 克制化（每 Agent 会话内仅首次播放）
// ?boot=<agent> 触发：已播放过直接 strip 参数落页面（无动画）；
// 未播放过则全屏播放 AgentBootSequence，完成后写标记并 strip 参数
const bootAgent = ref('')
const booting = ref(false)

function stripBootParam() {
  const { boot, ...rest } = route.query
  router.replace({ path: route.path, query: rest })
}

watch(
  () => route.query.boot,
  (agent) => {
    if (agent && typeof agent === 'string') {
      if (bootShown(agent)) {
        // 本会话已播放过：直达页面，不打断
        stripBootParam()
        return
      }
      bootAgent.value = agent
      booting.value = true
    }
  },
  { immediate: true }
)

function onBootDone() {
  markBootShown(bootAgent.value)
  booting.value = false
  stripBootParam()
}
</script>

<template>
  <el-config-provider :locale="zhCn">
    <div class="app-shell">
      <TopBar v-if="!hideTopBar" :active-agent="activeAgent" />
      <main class="app-main" :class="{ 'app-main--no-topbar': hideTopBar }">
        <router-view v-slot="{ Component }">
          <transition name="route-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
      <SyncStatusBar />
      <ConflictResolveModal />

      <!-- 全局 Boot 序列遮罩（专属页统一开场） -->
      <AgentBootSequence
        v-if="booting"
        :agent-key="bootAgent"
        @done="onBootDone"
      />
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

/* 全局 Boot 遮罩：固定覆盖整个视口 */
.app-shell :deep(.boot-overlay) {
  position: fixed;
  z-index: 2000;
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
