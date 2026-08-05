<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import AppLayout from '@/components/AppLayout.vue'
import ConflictResolveModal from '@/components/ConflictResolveModal.vue'
import AgentBootSequence from '@/components/AgentBootSequence.vue'
import { bootShown, markBootShown } from '@/utils/bootOnce'

const route = useRoute()
const router = useRouter()
const activeAgent = computed(() => route.meta.agent || 'tutor')
const hideTopBar = computed(() => Boolean(route.meta.hideTopBar))

// V2.6: 全局 Boot 序列（H-1 fix: disabled, just strip param）
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
      stripBootParam()
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
    <!-- Full-screen pages without sidebar (login, wizard) -->
    <template v-if="hideTopBar">
      <router-view v-slot="{ Component }">
        <transition name="route-fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </template>

    <!-- Main app with sidebar layout -->
    <AppLayout v-else>
      <router-view v-slot="{ Component }">
        <transition name="route-fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </AppLayout>

    <ConflictResolveModal />

    <!-- 全局 Boot 序列遮罩 -->
    <AgentBootSequence
      v-if="booting"
      :agent-key="bootAgent"
      @done="onBootDone"
    />
  </el-config-provider>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-base);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--duration-base) var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.app-shell :deep(.boot-overlay) {
  position: fixed;
  z-index: 2000;
}
</style>
